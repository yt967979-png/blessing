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

    if (!text) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 });
    }

    const cRes = await queryDb(`SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
    const conv = cRes.rows[0];
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const senderType: 'ADMIN' | 'CUSTOMER' = isAdmin ? 'ADMIN' : 'CUSTOMER';
    const senderName = isAdmin ? (conv.assigned_admin_name || 'Support Admin') : (conv.customer_name || 'Customer');
    const msgId = `msg_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    await queryDb(
      `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, sender_id, text)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [msgId, conversationId, senderType, senderName, user?.userId || null, text]
    );

    await queryDb(`UPDATE support_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [conversationId]);

    const ev = {
      type: 'NEW_MESSAGE' as const,
      conversationId,
      senderType,
      senderName,
      text,
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
