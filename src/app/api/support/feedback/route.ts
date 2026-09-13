import { NextRequest, NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { notifySupportEvent } from '@/lib/supportEvents';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/support/feedback
 * Records 1-5 star CSAT feedback and resolves the conversation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId || '').trim();
    const rating = Math.min(5, Math.max(1, parseInt(body.rating, 10) || 5));
    const comment = String(body.comment || '').slice(0, 1000).trim();
    const tags = (Array.isArray(body.tags) ? body.tags.join(', ') : String(body.tags || '')).slice(0, 500).trim();

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const cRes = await queryDb(`SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
    const conv = cRes.rows[0];
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // ── IDOR & Ownership Check
    const { getAuthenticatedUser } = await import('@/lib/serverSecurity');
    const user = await getAuthenticatedUser(req).catch(() => null);
    const sessionToken = req.cookies.get('bpg_support_session')?.value;
    const isAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));
    const isOwner = (conv.session_token && sessionToken && conv.session_token === sessionToken) ||
                    (user?.userId && conv.customer_id === String(user.userId));
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized to submit feedback for this conversation' }, { status: 403 });
    }

    const feedbackId = `fb_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    await queryDb(
      `INSERT INTO support_feedback 
         (id, conversation_id, customer_name, admin_id, admin_name, rating, tags, comment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (conversation_id) DO UPDATE 
       SET rating = EXCLUDED.rating, tags = EXCLUDED.tags, comment = EXCLUDED.comment`,
      [
        feedbackId,
        conversationId,
        conv.customer_name || 'Customer',
        conv.assigned_admin_id || (conv.status === 'BOT' ? 'ai_bot' : null),
        conv.assigned_admin_name || (conv.status === 'BOT' ? 'Blessing AI Assistant' : 'Chennai Support Team'),
        rating,
        tags,
        comment,
      ]
    );

    await queryDb(
      `UPDATE support_conversations 
       SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
       WHERE id = $1`,
      [conversationId]
    );

    // Insert system notice into chat only if not already present
    const existingSys = await queryDb(
      `SELECT id FROM support_messages WHERE conversation_id = $1 AND sender_type = 'SYSTEM' AND text LIKE '⭐ Customer submitted feedback%' LIMIT 1`,
      [conversationId]
    );
    if (existingSys.rows.length === 0) {
      const sysMsgId = `msg_${Date.now()}_sys`;
      await queryDb(
        `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, text)
         VALUES ($1, $2, 'SYSTEM', 'System', $3)`,
        [sysMsgId, conversationId, `⭐ Customer submitted feedback (${rating}/5 stars). Ticket resolved.`]
      );
    }

    await notifySupportEvent({
      type: 'CHAT_RESOLVED',
      conversationId,
      status: 'RESOLVED',
      data: { rating, tags, comment },
      timestamp: new Date().toISOString(),
    });

    const freshSession = crypto.randomBytes(16).toString('hex');
    const res = NextResponse.json({
      success: true,
      rating,
      status: 'RESOLVED',
    });
    res.cookies.set('bpg_support_session', freshSession, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to submit feedback' }, { status: 500 });
  }
}
