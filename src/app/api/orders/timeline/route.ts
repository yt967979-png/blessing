import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { applyRateLimit, verifyAdminRequest } from '@/lib/serverSecurity';

// Stage metadata - mirrors ST Courier's real logistics stages
const STAGE_META: Record<string, { emoji: string; label: string; whatsappTitle: string; whatsappDesc: string }> = {
  ORDER_PLACED:         { emoji: '📋', label: 'Order Confirmed',      whatsappTitle: '🎉 ORDER CONFIRMED',        whatsappDesc: 'Thank you! Your order has been received and is being processed.' },
  PACKED:               { emoji: '📦', label: 'Packed & Sealed',      whatsappTitle: '📦 ORDER PACKED & SEALED',  whatsappDesc: 'Your books have been quality-checked, packed, and sealed for shipment.' },
  HANDED_TO_ST_COURIER: { emoji: '🚚', label: 'Handed to ST Courier', whatsappTitle: '🚚 HANDED TO ST COURIER',   whatsappDesc: 'Your order has been handed to ST Courier Express for fast delivery.' },
  IN_TRANSIT:           { emoji: '⚡', label: 'In Transit',           whatsappTitle: '⚡ PARCEL IN TRANSIT',       whatsappDesc: 'Your parcel is moving between ST Courier hubs towards your city.' },
  OUT_FOR_DELIVERY:     { emoji: '🛵', label: 'Out for Delivery',     whatsappTitle: '🛵 OUT FOR DELIVERY TODAY', whatsappDesc: 'The ST Courier delivery agent is on the way. Please be available at your address.' },
  DELIVERED:            { emoji: '✅', label: 'Delivered',            whatsappTitle: '✅ ORDER DELIVERED!',        whatsappDesc: 'Your order was delivered successfully. Thank you for choosing Blessing Power Guide!' },
  FAILED_DELIVERY:      { emoji: '❌', label: 'Delivery Attempted',   whatsappTitle: '❌ DELIVERY ATTEMPTED',      whatsappDesc: 'Delivery was attempted but incomplete. Please contact ST Courier or reply here.' },
  CANCELLED:            { emoji: '🚫', label: 'Cancelled',            whatsappTitle: '❌ ORDER CANCELLED',         whatsappDesc: 'Your order has been cancelled. Stock is restored — you can order again anytime.' },
};

async function ensureColumns(client: any) {
  /* columns added at DB startup init */
}

// POST /api/orders/timeline — Add a new tracking event
export async function POST(request: Request) {
  // Rate limit protection
  const ip = request.headers.get('x-forwarded-for') || 'anonymous';
  const { allowed } = applyRateLimit(ip, 20, 60000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again in 1 minute.' }, { status: 429 });
  }

  // Admin Authorization Guard
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || 'Admin authorization required' }, { status: 403 });
  }

  const client = await getDbClient();
  try {
    const body = await request.json();
    const { orderId, status, hubCity, remarks, awbNumber } = body;

    if (!orderId || !status) {
      await client.end();
      return NextResponse.json({ error: 'orderId and status are required' }, { status: 400 });
    }

    if (!STAGE_META[status]) {
      await client.end();
      return NextResponse.json({ error: `Unknown status key "${status}". Valid: ${Object.keys(STAGE_META).join(', ')}` }, { status: 400 });
    }

    // Cancel must go through /api/orders/cancel (stock + coupon restore)
    if (status === 'CANCELLED') {
      await client.end();
      return NextResponse.json(
        { error: 'Use POST /api/orders/cancel to cancel orders (restores stock).' },
        { status: 400 }
      );
    }

    await ensureColumns(client);

    const existing = await client.query(
      `SELECT id, order_status, awb_number FROM orders WHERE id = $1 OR order_number = $1 LIMIT 1`,
      [orderId]
    );
    if (!existing.rows.length) {
      await client.end();
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const currentStatus = String(existing.rows[0].order_status || '').toLowerCase();
    if (currentStatus.includes('cancel')) {
      await client.end();
      return NextResponse.json(
        { error: 'Cannot update status or AWB on a cancelled order.' },
        { status: 409 }
      );
    }
    if (currentStatus.includes('awaiting confirmation')) {
      await client.end();
      return NextResponse.json(
        {
          error:
            'Customer has not confirmed yet. Wait for WhatsApp YES before packing or adding AWB. You may cancel if needed.',
        },
        { status: 409 }
      );
    }

    const eventId = `TL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const statusLabel = STAGE_META[status].label;

    // Insert timeline event
    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks, hub_city, awb_number, created_at)
       VALUES ($1, (SELECT id FROM orders WHERE id = $2 OR order_number = $2 LIMIT 1), $3, $4, $5, $6, NOW())`,
      [eventId, orderId, statusLabel, remarks || null, hubCity || null, awbNumber || null]
    );

    // Update main orders table
    if (awbNumber) {
      await client.query(
        `UPDATE orders SET order_status = $1, awb_number = $2, courier_name = 'ST Courier Express', updated_at = NOW()
         WHERE id = $3 OR order_number = $3`,
        [statusLabel, awbNumber, orderId]
      );
    } else {
      await client.query(
        `UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2 OR order_number = $2`,
        [statusLabel, orderId]
      );
    }

    // Fetch order for WhatsApp dispatch
    const orderRes = await client.query(
      `SELECT o.order_number, o.total_amount, o.awb_number, o.shipping_address,
              oi.book_title
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE o.id = $1 OR o.order_number = $1
       LIMIT 1`,
      [orderId]
    );

    await client.end();

    // Fire WhatsApp via shared notify layer
    const order = orderRes.rows[0];
    if (order) {
      try {
        let addr: any = {};
        try {
          addr = JSON.parse(order.shipping_address || '{}');
        } catch (_) {}
        const phone = addr.phone || '';
        const name = addr.name || 'Student';
        const awb = awbNumber || order.awb_number || undefined;
        const { notify, statusToNotifyEvent } = await import('@/lib/notify/send');
        const mapped = statusToNotifyEvent(status) || statusToNotifyEvent(statusLabel || '');
        if (phone && mapped) {
          await notify(mapped, {
            customerPhone: phone,
            customerName: name,
            orderId: order.order_number,
            awbNumber: awb,
          });
        }
      } catch (err: any) {
        console.error('Error firing WhatsApp in timeline route:', err.message);
      }
    }

    return NextResponse.json({ success: true, eventId, status, statusLabel });
  } catch (err: any) {
    try { await client.end(); } catch (_) {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/orders/timeline?orderId=xxx — Fetch all events for an order
export async function GET(request: Request) {
  const client = await getDbClient();
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      await client.end();
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    await ensureColumns(client);

    const res = await client.query(
      `SELECT tl.id, tl.status, tl.remarks, tl.hub_city, tl.awb_number, tl.created_at
       FROM order_timeline tl
       JOIN orders o ON tl.order_id = o.id
       WHERE o.id = $1 OR o.order_number = $1
       ORDER BY tl.created_at ASC`,
      [orderId]
    );

    await client.end();

    // Enrich with metadata
    const statusLabelToKey = Object.fromEntries(
      Object.entries(STAGE_META).map(([k, v]) => [v.label, k])
    );

    const events = res.rows.map((row: any) => {
      const stageKey = statusLabelToKey[row.status] || row.status;
      const meta = STAGE_META[stageKey];
      return {
        id: row.id,
        stageKey,
        label: meta?.label || row.status,
        emoji: meta?.emoji || '📌',
        hubCity: row.hub_city,
        awbNumber: row.awb_number,
        remarks: row.remarks,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({ success: true, orderId, events, stageMeta: STAGE_META });
  } catch (err: any) {
    try { await client.end(); } catch (_) {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
