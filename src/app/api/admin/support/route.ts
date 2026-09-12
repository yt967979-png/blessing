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

      if (orderIdParam) {
        const oRes = await queryDb(
          `SELECT * FROM orders WHERE order_id = $1 OR id = $1 LIMIT 1`,
          [orderIdParam]
        );
        order = oRes.rows[0];
      } else if (phoneParam) {
        const oRes = await queryDb(
          `SELECT * FROM orders WHERE customer_phone = $1 OR customer_phone = $2 ORDER BY ordered_at DESC LIMIT 1`,
          [phoneParam, phoneParam.replace('+91', '')]
        );
        order = oRes.rows[0];
      }

      if (order?.id) {
        const iRes = await queryDb(
          `SELECT title, qty, price, subtotal FROM order_items WHERE order_id = $1`,
          [order.id]
        );
        items = iRes.rows;
      }

      if (phoneParam) {
        const tCountRes = await queryDb(
          `SELECT COUNT(*) as cnt FROM support_conversations WHERE customer_phone = $1`,
          [phoneParam]
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
              orderId: order.order_id || order.id,
              customerName: order.customer_name,
              customerPhone: order.customer_phone,
              customerAltPhone: order.customer_alt_phone,
              address: order.shipping_address || order.address,
              city: order.city,
              pincode: order.pincode,
              totalAmount: Number(order.total_amount || 0),
              status: fulfillmentStatus(order),
              isCancelled: isRecordCancelled(order),
              paymentMethod: order.payment_method,
              paymentStatus: order.payment_status,
              awbNumber: order.awb_number,
              courierName: order.courier_name || 'ST Courier',
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
    } catch (_) {}

    const waitingRes = await queryDb(
      `SELECT DISTINCT ON (COALESCE(customer_id, customer_phone, session_token)) * 
       FROM support_conversations 
       WHERE status = 'WAITING_ADMIN' 
       ORDER BY COALESCE(customer_id, customer_phone, session_token), updated_at DESC`
    );

    const activeRes = await queryDb(
      `SELECT * FROM support_conversations 
       WHERE status = 'ACTIVE' 
       ORDER BY last_message_at DESC LIMIT 50`
    );

    const resolvedRes = await queryDb(
      `SELECT c.*, f.rating, f.tags as feedback_tags 
       FROM support_conversations c
       LEFT JOIN support_feedback f ON f.conversation_id = c.id
       WHERE c.status = 'RESOLVED' 
       ORDER BY c.resolved_at DESC LIMIT 30`
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
      await queryDb(
        `UPDATE support_conversations 
         SET status = 'RESOLVED', resolved_at = NOW(), updated_at = NOW() 
         WHERE id = $1`,
        [conversationId]
      );

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
