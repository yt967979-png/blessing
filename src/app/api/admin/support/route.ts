import { NextRequest, NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { verifyAdminRequest } from '@/lib/serverSecurity';
import { fulfillmentStatus, isRecordCancelled } from '@/lib/orderStatus';
import { notifySupportEvent } from '@/lib/supportEvents';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const check = await verifyAdminRequest(req);
    if (!check.isAdmin || !check.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const view = req.nextUrl.searchParams.get('view') || 'overview';

    // ── 1. Context Card View for Selected Customer/Order
    if (view === 'context_card') {
      const orderIdParam = req.nextUrl.searchParams.get('orderId');
      const phoneParam = req.nextUrl.searchParams.get('phone');
      const conversationId = req.nextUrl.searchParams.get('conversationId');

      let order: any = null;
      let items: any[] = [];
      let pastTicketsCount = 0;
      let pastFeedback: any[] = [];

      // If conversationId is provided, verify against the verified conversation record
      let verifiedConv: any = null;
      if (conversationId) {
        const cCheck = await queryDb(`SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`, [conversationId]);
        verifiedConv = cCheck.rows[0] || null;
      }

      // If conversation specifies an order_id, that takes strict precedence
      const targetOrderId = verifiedConv?.order_id || orderIdParam;
      const targetPhone = verifiedConv?.customer_phone || phoneParam;

      if (targetOrderId) {
        const oRes = await queryDb(
          `SELECT * FROM orders WHERE id = $1 OR order_number = $1 LIMIT 1`,
          [targetOrderId]
        );
        const candidateOrder = oRes.rows[0];
        // Ensure candidate order belongs to the customer phone or user id
        if (candidateOrder) {
          if (verifiedConv) {
            const matchesUser = verifiedConv.customer_id && candidateOrder.user_id === verifiedConv.customer_id;
            const cleanConvPhone = (verifiedConv.customer_phone || '').replace(/\D/g, '').slice(-10);
            const matchesPhone = cleanConvPhone && candidateOrder.shipping_address && candidateOrder.shipping_address.includes(cleanConvPhone);
            if (matchesUser || matchesPhone || verifiedConv.order_id === targetOrderId) {
              order = candidateOrder;
            }
          } else {
            order = candidateOrder;
          }
        }
      }

      if (!order && targetPhone) {
        const cleanPhone = targetPhone.replace(/\D/g, '').slice(-10);
        if (cleanPhone.length >= 10) {
          const oRes = await queryDb(
            `SELECT o.* FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             WHERE o.shipping_address LIKE $1 
                OR u.phone = $2 
                OR u.phone = $3
             ORDER BY o.ordered_at DESC LIMIT 1`,
            [`%${cleanPhone}%`, cleanPhone, `+91${cleanPhone}`]
          );
          order = oRes.rows[0];
        }
      }

      let parsedAddr: any = {};
      if (order?.shipping_address) {
        try {
          parsedAddr = typeof order.shipping_address === 'string'
            ? JSON.parse(order.shipping_address)
            : order.shipping_address;
        } catch (_) {
          parsedAddr = {};
        }
      }

      if (order?.id) {
        const iRes = await queryDb(
          `SELECT book_title as title, quantity as qty, book_price as price, subtotal FROM order_items WHERE order_id = $1`,
          [order.id]
        );
        items = iRes.rows;
      }

      const effectivePhone = parsedAddr.phone || phoneParam;
      if (effectivePhone) {
        const cleanPhone = effectivePhone.replace(/\D/g, '').slice(-10);
        const tCountRes = await queryDb(
          `SELECT COUNT(*) as cnt FROM support_conversations WHERE customer_phone LIKE $1`,
          [`%${cleanPhone}%`]
        );
        pastTicketsCount = parseInt(tCountRes.rows[0]?.cnt || '0', 10);
      }

      if (conversationId) {
        const fbRes = await queryDb(
          `SELECT rating, tags, comment, created_at FROM support_feedback WHERE conversation_id = $1`,
          [conversationId]
        );
        pastFeedback = fbRes.rows;
      }

      return NextResponse.json({
        order: order
          ? {
              orderId: order.order_number || order.id,
              customerName: parsedAddr.name || 'Customer',
              customerPhone: parsedAddr.phone || '',
              customerAltPhone: parsedAddr.alternatePhone || '',
              address: parsedAddr.address || order.shipping_address || '',
              city: parsedAddr.city || '',
              pincode: parsedAddr.pincode || '',
              totalAmount: Number(order.total_amount || 0),
              status: order.order_status || fulfillmentStatus(order),
              isCancelled: isRecordCancelled(order),
              paymentMethod: order.payment_method,
              paymentStatus: order.payment_status,
              awbNumber: order.awb_number,
              courierName: order.courier_name || 'ST Courier Express',
              isOfficialAwb: order.is_official_awb,
              trackingUrl: order.tracking_url,
              orderedAt: order.ordered_at,
              items,
            }
          : null,
        pastTicketsCount,
        feedback: pastFeedback[0] || null,
      });
    }

    // ── 2. Message History View for Selected Conversation
    if (view === 'messages') {
      const convId = req.nextUrl.searchParams.get('conversationId');
      if (!convId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

      const mRes = await queryDb(
        `SELECT id, conversation_id, sender_type, sender_name, sender_id, text, is_read, created_at 
         FROM support_messages 
         WHERE conversation_id = $1 
         ORDER BY created_at ASC`,
        [convId]
      );
      return NextResponse.json({ messages: mRes.rows });
    }

    // ── 3. Support Queue Overview View
    // Automatic self-healing: resolve any older duplicate waiting tickets and abandoned requests
    try {
      await queryDb(`
        UPDATE support_conversations
        SET status = 'RESOLVED', resolved_at = NOW()
        WHERE status = 'WAITING_ADMIN'
          AND id NOT IN (
            SELECT DISTINCT ON (COALESCE(customer_id, customer_phone, session_token)) id
            FROM support_conversations
            WHERE status = 'WAITING_ADMIN'
            ORDER BY COALESCE(customer_id, customer_phone, session_token), updated_at DESC
          )
      `);
      await queryDb(`
        UPDATE support_conversations
        SET status = 'RESOLVED', resolved_at = NOW()
        WHERE status = 'WAITING_ADMIN'
          AND updated_at < NOW() - INTERVAL '15 minutes'
      `);
      // Auto-requeue abandoned ACTIVE chats where admin became inactive (>15m without admin activity)
      const requeuedRes = await queryDb(`
        UPDATE support_conversations
        SET status = 'WAITING_ADMIN', assigned_admin_id = NULL, assigned_admin_name = NULL, updated_at = NOW()
        WHERE status = 'ACTIVE'
          AND COALESCE(last_admin_activity_at, accepted_at) < NOW() - INTERVAL '15 minutes'
        RETURNING id, customer_name
      `);
      if (requeuedRes.rowCount && requeuedRes.rowCount > 0) {
        for (const row of requeuedRes.rows) {
          const sysMsgId = `msg_${Date.now()}_sys_requeue_${Math.random().toString(36).substring(2, 6)}`;
          await queryDb(
            `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, text)
             VALUES ($1, $2, 'SYSTEM', 'System', $3)`,
            [sysMsgId, row.id, 'Re-routing to available team members']
          ).catch(() => {});

          notifySupportEvent({
            type: 'SUPPORT_REQUESTED',
            conversationId: row.id,
            senderType: 'SYSTEM',
            senderName: row.customer_name || 'Customer',
            text: 'Re-routing to available team members',
            status: 'WAITING_ADMIN',
            timestamp: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    } catch (_) {}

    const waitingRes = await queryDb(
      `SELECT DISTINCT ON (COALESCE(NULLIF(order_id, ''), NULLIF(customer_id, ''), NULLIF(customer_phone, ''), session_token)) * 
       FROM support_conversations 
       WHERE status = 'WAITING_ADMIN' 
         AND (
           order_id IS NULL 
           OR order_id NOT IN (
             SELECT order_id FROM support_conversations 
             WHERE status = 'ACTIVE' AND order_id IS NOT NULL AND order_id != ''
           )
         )
       ORDER BY COALESCE(NULLIF(order_id, ''), NULLIF(customer_id, ''), NULLIF(customer_phone, ''), session_token), updated_at DESC`
    );

    const currentAdminId = String(check.user.userId);

    const activeRes = await queryDb(
      `SELECT * FROM support_conversations 
       WHERE status = 'ACTIVE' 
         AND assigned_admin_id = $1
       ORDER BY last_message_at DESC LIMIT 50`,
      [currentAdminId]
    );

    const resolvedRes = await queryDb(
      `SELECT c.*, f.rating, f.tags as feedback_tags, f.comment as feedback_comment 
       FROM support_conversations c
       LEFT JOIN support_feedback f ON f.conversation_id = c.id
       WHERE c.status = 'RESOLVED' 
       ORDER BY c.resolved_at DESC LIMIT 50`
    );

    const statsRes = await queryDb(
      `SELECT 
         COUNT(*) as total_feedback,
         COALESCE(ROUND(AVG(rating), 1), 5.0) as avg_rating,
         COUNT(*) FILTER (WHERE rating = 5) as five_star_count
       FROM support_feedback`
    );

    const stats = statsRes.rows[0];

    return NextResponse.json({
      waiting: waitingRes.rows,
      active: activeRes.rows,
      resolved: resolvedRes.rows,
      stats: {
        waitingCount: waitingRes.rowCount,
        activeCount: activeRes.rowCount,
        totalFeedback: parseInt(stats?.total_feedback || '0', 10),
        avgRating: Number(stats?.avg_rating || 5.0),
        fiveStarCount: parseInt(stats?.five_star_count || '0', 10),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to fetch admin support data' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const check = await verifyAdminRequest(req);
    if (!check.isAdmin || !check.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const uRes = await queryDb(`SELECT name, email FROM users WHERE id = $1 LIMIT 1`, [check.user.userId]);
    const adminName = uRes.rows[0]?.name || uRes.rows[0]?.email?.split('@')[0] || 'Staff';
    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId || '').trim();
    const action = String(body.action || '').trim();

    if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 });

    if (action === 'resolve') {
      const cRes = await queryDb(`SELECT order_id, assigned_admin_id, assigned_admin_name FROM support_conversations WHERE id = $1`, [conversationId]);
      const conv = cRes.rows[0];
      if (conv?.assigned_admin_id && conv.assigned_admin_id !== String(check.user.userId)) {
        return NextResponse.json(
          { error: `Only ${conv.assigned_admin_name || 'the assigned admin'} can resolve this chat.` },
          { status: 403 }
        );
      }
      const oid = conv?.order_id;

      await queryDb(
        `UPDATE support_conversations 
         SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
         WHERE id = $1`,
        [conversationId]
      );

      if (oid) {
        await queryDb(
          `UPDATE support_conversations 
           SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
           WHERE status = 'WAITING_ADMIN' AND order_id = $1`,
          [oid]
        );
      }

      const sysMsgId = `msg_${Date.now()}_sys`;
      await queryDb(
        `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, text)
         VALUES ($1, $2, 'SYSTEM', 'System', $3)`,
        [sysMsgId, conversationId, `Chat ended by admin (${adminName}). How was your experience?`]
      );

      await notifySupportEvent({
        type: 'CHAT_RESOLVED',
        conversationId,
        status: 'RESOLVED',
        timestamp: new Date().toISOString(),
      });

      return NextResponse.json({ success: true, status: 'RESOLVED' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Action failed' }, { status: 500 });
  }
}
