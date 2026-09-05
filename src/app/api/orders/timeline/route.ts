import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import {
  applyRateLimitAsync,
  verifyAdminRequest,
  getAuthenticatedUser,
  unauthorizedResponse,
} from '@/lib/serverSecurity';
import { blocksShippingActions, isOrderCancelled } from '@/lib/orderStatus';

// Stage metadata - mirrors ST Courier's real logistics stages
const STAGE_META: Record<string, { emoji: string; label: string; desc: string }> = {
  ORDER_PLACED:         { emoji: '📋', label: 'Order Confirmed',      desc: 'Thank you! Your order has been received and is being processed.' },
  PACKED:               { emoji: '📦', label: 'Packed & Sealed',      desc: 'Your books have been quality-checked, packed, and sealed for shipment.' },
  HANDED_TO_ST_COURIER: { emoji: '🚚', label: 'Handed to ST Courier', desc: 'Your order has been handed to ST Courier Express for fast delivery.' },
  IN_TRANSIT:           { emoji: '⚡', label: 'In Transit',           desc: 'Your parcel is moving between ST Courier hubs towards your city.' },
  OUT_FOR_DELIVERY:     { emoji: '🛵', label: 'Out for Delivery',     desc: 'The ST Courier delivery agent is on the way. Please be available at your address.' },
  DELIVERED:            { emoji: '✅', label: 'Delivered',            desc: 'Your order was delivered successfully. Thank you for choosing Blessing Power Guide!' },
  FAILED_DELIVERY:      { emoji: '❌', label: 'Delivery Attempted',   desc: 'Delivery was attempted but incomplete. Please contact ST Courier or the shop.' },
  CANCELLED:            { emoji: '🚫', label: 'Cancelled',            desc: 'Your order was cancelled by the shop. If you paid online, any refund returns via Razorpay to your original payment method.' },
};

// POST /api/orders/timeline — Add a new tracking event
export async function POST(request: Request) {
  // Rate limit protection
  const ip = request.headers.get('x-forwarded-for') || 'anonymous';
  const rl = await applyRateLimitAsync(`timeline:${ip}`, 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again in 1 minute.' }, { status: 429 });
  }

  // Admin Authorization Guard
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    return NextResponse.json({ error: auth.error || 'Admin authorization required' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { orderId, status, hubCity, remarks, awbNumber } = body;

    if (!orderId || !status) {
      return NextResponse.json({ error: 'orderId and status are required' }, { status: 400 });
    }

    if (!STAGE_META[status]) {
      return NextResponse.json({ error: `Unknown status key "${status}". Valid: ${Object.keys(STAGE_META).join(', ')}` }, { status: 400 });
    }

    if (status === 'CANCELLED' || isOrderCancelled(STAGE_META[status]?.label)) {
      return NextResponse.json(
        { error: 'Use POST /api/orders/cancel (admin only; Razorpay refund for paid orders).' },
        { status: 400 }
      );
    }

    const existing = await queryDb(
      `SELECT id, order_status, awb_number, shipping_address, order_number, user_id FROM orders WHERE id = $1 OR order_number = $1 LIMIT 1`,
      [orderId]
    );

    if (!existing.rows.length) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = existing.rows[0];
    if (blocksShippingActions(order.order_status)) {
      return NextResponse.json(
        {
          error: isOrderCancelled(order.order_status)
            ? 'Cannot update status or AWB on a cancelled order.'
            : 'Cannot update status or AWB — order is not confirmed yet.',
        },
        { status: 409 }
      );
    }

    const eventId = `TL-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const meta = STAGE_META[status];
    const statusLabel = meta.label;
    const awb = awbNumber || order.awb_number || '';

    // Insert timeline event
    await queryDb(
      `INSERT INTO order_timeline (id, order_id, status, remarks, hub_city, awb_number, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [eventId, order.id, statusLabel, remarks || meta.desc || null, hubCity || null, awb || null]
    );

    // Update main orders table
    if (awb) {
      await queryDb(
        `UPDATE orders SET order_status = $1, awb_number = $2, courier_name = 'ST Courier Express', updated_at = NOW()
         WHERE id = $3`,
        [statusLabel, awb, order.id]
      );
    } else {
      await queryDb(
        `UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2`,
        [statusLabel, order.id]
      );
    }

    try {
      const { broadcastOrderChange, notifyOrderChanged } = await import(
        '@/app/api/orders/stream/route'
      );
      const event = {
        type: 'ORDER_UPDATED',
        orderId: order.order_number || order.id,
        status: statusLabel,
        awbNumber: awb || null,
        userId: order.user_id ? String(order.user_id) : null,
        timestamp: Date.now(),
        source: 'admin_timeline',
      };
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch (e: any) {
      console.warn('[timeline] order broadcast failed:', e?.message || e);
    }

    return NextResponse.json({ success: true, eventId, status, statusLabel });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/orders/timeline?orderId=xxx — Fetch all events for an order
// Requires: session owner of the order OR admin (same ownership pattern as track).
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const session = await getAuthenticatedUser(request);
    const adminCheck = await verifyAdminRequest(request);
    if (!session && !adminCheck.isAdmin) {
      return unauthorizedResponse('Please login to view order timeline.');
    }

    const orderRes = await queryDb(
      `SELECT id, user_id, order_number FROM orders WHERE id = $1 OR order_number = $1 LIMIT 1`,
      [orderId]
    );
    if (!orderRes.rows.length) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const order = orderRes.rows[0];
    if (!adminCheck.isAdmin && String(session?.userId) !== String(order.user_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const res = await queryDb(
      `SELECT tl.id, tl.status, tl.remarks, tl.hub_city, tl.awb_number, tl.created_at
       FROM order_timeline tl
       WHERE tl.order_id = $1
       ORDER BY tl.created_at ASC`,
      [order.id]
    );

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

    return NextResponse.json({
      success: true,
      orderId: order.order_number || orderId,
      events,
      stageMeta: STAGE_META,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
