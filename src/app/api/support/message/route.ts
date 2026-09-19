import { NextRequest, NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/serverSecurity';
import { notifySupportEvent } from '@/lib/supportEvents';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

/**
 * POST /api/support/message
 * Sends a message in an existing conversation (Customer or Admin).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId || '').trim();
    const text = String(body.text || '').trim();
    const isTyping = body.typing === true;

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId is required' }, { status: 400 });
    }

    const user = await getAuthenticatedUser(req).catch(() => null);
    const isAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));

    // If this is just a typing indicator ping
    if (isTyping) {
      await notifySupportEvent({
        type: 'TYPING',
        conversationId,
        senderType: isAdmin ? 'ADMIN' : 'CUSTOMER',
        senderName: isAdmin ? 'Admin' : 'Customer',
        timestamp: new Date().toISOString(),
      });
      return NextResponse.json({ success: true, typing: true });
    }

    if (!isAdmin) {
      const { applyRateLimitAsync, clientIp } = await import('@/lib/serverSecurity');
      const rl = await applyRateLimitAsync(`support-msg:${clientIp(req)}`, 40, 60000);
      if (!rl.allowed) {
        return NextResponse.json({ error: 'Too many messages. Please slow down.' }, { status: 429 });
      }
    }

    if (!text) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }

    if (text.length > 2000) {
      return NextResponse.json({ error: 'Message text exceeds maximum limit of 2000 characters' }, { status: 400 });
    }

    const sanitizedText = text.replace(/\0/g, '');

    const cRes = await queryDb(`SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
    const conv = cRes.rows[0];
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // ── IDOR & RBAC Check
    const sessionToken = req.cookies.get('bpg_support_session')?.value;
    const isOwner = (user?.userId && conv.customer_id === String(user.userId)) ||
                    (!user?.userId && conv.session_token && sessionToken && conv.session_token === sessionToken);
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized to post messages to this conversation' }, { status: 403 });
    }

    // If an unassigned conversation is replied to by an admin, auto-claim it for that admin
    if (isAdmin && !conv.assigned_admin_id) {
      const adminName = user?.role === 'super_admin' ? 'Super Admin' : 'Support Admin';
      await queryDb(
        `UPDATE support_conversations 
         SET assigned_admin_id = $1, assigned_admin_name = $2, status = 'ACTIVE', updated_at = NOW() 
         WHERE id = $3`,
        [String(user?.userId), adminName, conversationId]
      );
      conv.assigned_admin_id = String(user?.userId);
      conv.assigned_admin_name = adminName;
      conv.status = 'ACTIVE';
    }

    // If a regular admin is posting to an ACTIVE conversation assigned to someone else, block them (super_admin can always reply)
    if (
      isAdmin &&
      user?.role !== 'super_admin' &&
      conv.status === 'ACTIVE' &&
      conv.assigned_admin_id &&
      conv.assigned_admin_id !== String(user?.userId)
    ) {
      return NextResponse.json(
        {
          error: `This conversation is assigned to ${conv.assigned_admin_name || 'another staff member'}. Only the assigned admin can reply.`,
        },
        { status: 403 }
      );
    }

    const clientMessageId = body.clientMessageId ? String(body.clientMessageId).trim() : null;
    if (clientMessageId) {
      const existing = await queryDb(
        `SELECT id, conversation_id, sender_type, sender_name, text, created_at 
         FROM support_messages 
         WHERE conversation_id = $1 AND (client_message_id = $2 OR id = $2) 
         LIMIT 1`,
        [conversationId, clientMessageId]
      );
      if (existing.rows.length > 0) {
        return NextResponse.json({
          success: true,
          messageId: existing.rows[0].id,
          senderType: existing.rows[0].sender_type,
          senderName: existing.rows[0].sender_name,
          text: existing.rows[0].text,
          createdAt: existing.rows[0].created_at,
          duplicateIgnored: true,
        });
      }
    }

    const senderType: 'ADMIN' | 'CUSTOMER' = isAdmin ? 'ADMIN' : 'CUSTOMER';
    const senderName = isAdmin ? (conv.assigned_admin_name || (user?.role === 'super_admin' ? 'Super Admin' : 'Support Admin')) : (conv.customer_name || 'Customer');
    const msgId = `msg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    try {
      await queryDb(
        `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, sender_id, text, client_message_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [msgId, conversationId, senderType, senderName, user?.userId || null, sanitizedText, clientMessageId]
      );
    } catch (insertErr: any) {
      // If unique constraint violation on (conversation_id, client_message_id)
      if (insertErr?.code === '23505' && clientMessageId) {
        const existing = await queryDb(
          `SELECT id, conversation_id, sender_type, sender_name, text, created_at 
           FROM support_messages 
           WHERE conversation_id = $1 AND client_message_id = $2 
           LIMIT 1`,
          [conversationId, clientMessageId]
        );
        if (existing.rows.length > 0) {
          return NextResponse.json({
            success: true,
            messageId: existing.rows[0].id,
            senderType: existing.rows[0].sender_type,
            senderName: existing.rows[0].sender_name,
            text: existing.rows[0].text,
            createdAt: existing.rows[0].created_at,
            duplicateIgnored: true,
          });
        }
      }
      throw insertErr;
    }

    if (senderType === 'ADMIN') {
      await queryDb(
        `UPDATE support_conversations SET last_message_at = NOW(), last_admin_activity_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [conversationId]
      );
    } else {
      await queryDb(
        `UPDATE support_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [conversationId]
      );
    }

    const ev = {
      type: 'NEW_MESSAGE' as const,
      conversationId,
      senderType,
      senderName,
      text: sanitizedText,
      timestamp: new Date().toISOString(),
    };

    await notifySupportEvent(ev);

    return NextResponse.json({
      success: true,
      messageId: msgId,
      senderType,
      senderName,
      text,
      createdAt: ev.timestamp,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to send message' }, { status: 500 });
  }
}
