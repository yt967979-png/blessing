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
    const isTyping = body.typing === true || body.isTyping === true;

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

    // Strictly block messages on ended/resolved conversations
    if (conv.status === 'RESOLVED') {
      return NextResponse.json(
        { error: 'This chat session has ended and is closed. No further messages can be sent.' },
        { status: 403 }
      );
    }

    // ── IDOR & RBAC Check
    const sessionToken = req.cookies.get('bpg_support_session')?.value;
    const isOwner = (user?.userId && conv.customer_id === String(user.userId)) ||
                    (!user?.userId && conv.session_token && sessionToken && conv.session_token === sessionToken);
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized to post messages to this conversation' }, { status: 403 });
    }

    const rawUserId = String(user?.userId || '');
    const deviceId = (req.headers.get('x-device-id') || req.cookies.get('bpg_device')?.value || '').trim();
    const actorAdminId = isAdmin ? (deviceId ? `${rawUserId}::${deviceId}` : rawUserId) : '';
    const assignedId = String(conv.assigned_admin_id || '');
    const isAssignedToThisAdmin = !assignedId || assignedId === actorAdminId || (!assignedId.includes('::') && assignedId === rawUserId);

    // Strictly enforce one-admin-at-a-time: if another admin/session already claimed this chat, block any other admin
    if (isAdmin && conv.status === 'ACTIVE' && assignedId && !isAssignedToThisAdmin) {
      return NextResponse.json(
        {
          error: `This conversation is already accepted and handled by ${conv.assigned_admin_name || 'another admin'}. Only one admin can chat at a time.`,
        },
        { status: 403 }
      );
    }

    // If an unassigned conversation is replied to by an admin, auto-claim it atomically for that admin
    if (isAdmin && !conv.assigned_admin_id) {
      const isMobileApp = req.headers.get('x-client-platform') === 'android-app';
      const uRes = await queryDb(`SELECT name, email FROM users WHERE id = $1 LIMIT 1`, [rawUserId]);
      const baseName = uRes.rows[0]?.name || uRes.rows[0]?.email?.split('@')[0] || (user?.role === 'super_admin' ? 'Super Admin' : 'Support Admin');
      const adminName = `${baseName} (${isMobileApp ? 'Mobile App' : 'Web'})`;
      const claimRes = await queryDb(
        `UPDATE support_conversations 
         SET assigned_admin_id = $1, assigned_admin_name = $2, status = 'ACTIVE', accepted_at = COALESCE(accepted_at, NOW()), last_admin_activity_at = NOW(), updated_at = NOW() 
         WHERE id = $3 AND (assigned_admin_id IS NULL OR assigned_admin_id = $1)
         RETURNING *`,
        [actorAdminId, adminName, conversationId]
      );
      if (claimRes.rowCount === 0) {
        return NextResponse.json(
          { error: 'This conversation was just accepted by another admin.' },
          { status: 409 }
        );
      }
      conv.assigned_admin_id = actorAdminId;
      conv.assigned_admin_name = adminName;
      conv.status = 'ACTIVE';
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

    // If customer sent a message and chat is not claimed by human admin, invoke AI Co-Pilot
    if (senderType === 'CUSTOMER' && (conv.status !== 'ACTIVE' || !conv.assigned_admin_id)) {
      const { executeAiReplyCycle } = await import('@/lib/supportAiEngine');
      void executeAiReplyCycle({
        conversationId,
        customerMessage: sanitizedText,
        customerName: conv.customer_name || senderName,
        customerPhone: conv.customer_phone || undefined,
        customerId: conv.customer_id || user?.userId || undefined,
        linkedOrderId: conv.order_id || undefined,
      }).catch((e) => console.warn('[support/message] AI reply error:', e));
    }

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
