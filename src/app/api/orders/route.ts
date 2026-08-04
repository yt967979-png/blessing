import { NextResponse, NextRequest } from 'next/server';
import { getDbClient } from '@/lib/db';
import { broadcastOrderChange, notifyOrderChanged } from '@/app/api/orders/stream/route';
import {
  verifyAdminRequest,
  forbiddenResponse,
  getAuthenticatedUser,
  unauthorizedResponse,
  applyRateLimitAsync,
  clientIp,
} from '@/lib/serverSecurity';
import { verifyRazorpayPayment } from '@/lib/orderPricing';
import { priceCheckoutOrder } from '@/lib/checkoutPricing';
import { blocksShippingActions, isOrderCancelled } from '@/lib/orderStatus';
import { refundRazorpayPayment } from '@/lib/razorpayRefund';

/**
 * Money-safety net: payment is captured by Razorpay client-side BEFORE this
 * route runs. If we've verified that capture but then can't complete the
 * order (stock lost the race, DB error, etc.), the money must not sit
 * captured with nothing to show for it — refund immediately and tell the
 * customer plainly. Idempotent: refundRazorpayPayment no-ops if Razorpay
 * already shows the payment refunded (e.g. a retry, or webhook got there first).
 */
async function refundOrphanedCapture(
  client: any,
  opts: { paymentId: string; orderNumberAttempt?: string; amountRupees: number; reason: string }
): Promise<{ refunded: boolean; refundId?: string; error?: string }> {
  const refund = await refundRazorpayPayment({
    paymentId: opts.paymentId,
    orderNumber: opts.orderNumberAttempt,
  });

  // Audit trail so admin can reconcile — mirrors the webhook's ORPHAN_CAPTURED
  // bookkeeping, but resolved immediately here since we already know the outcome.
  try {
    const existing = await client.query(`SELECT id FROM payments WHERE payment_id = $1 LIMIT 1`, [
      opts.paymentId,
    ]);
    const status = refund.ok ? 'REFUNDED' : 'ORPHAN_CAPTURED';
    if (existing.rows.length) {
      await client.query(`UPDATE payments SET status = $2 WHERE payment_id = $1`, [
        opts.paymentId,
        status,
      ]);
    } else {
      await client.query(
        `INSERT INTO payments (id, order_id, payment_id, transaction_id, amount, status)
         VALUES ($1, NULL, $2, $2, $3, $4)`,
        [`pay-orphan-${Date.now()}`, opts.paymentId, opts.amountRupees, status]
      );
    }
  } catch (e: any) {
    console.error('[orders] could not record orphan payment audit row:', e?.message || e);
  }

  if (refund.ok) {
    console.warn(
      `[orders] Auto-refunded captured payment ${opts.paymentId} after checkout failure (${opts.reason}). refundId=${refund.refundId}`
    );
    return { refunded: true, refundId: refund.refundId };
  }

  console.error(
    `[orders] CRITICAL: could not auto-refund captured payment ${opts.paymentId} after checkout failure (${opts.reason}): ${refund.error}`
  );
  return { refunded: false, error: refund.error };
}
function mapOrderRow(o: any) {
  let addrObj: any = {};
  if (o.shipping_address) {
    if (typeof o.shipping_address === 'object') {
      addrObj = o.shipping_address;
    } else if (typeof o.shipping_address === 'string') {
      try {
        addrObj = JSON.parse(o.shipping_address);
      } catch {
        addrObj = { address: o.shipping_address };
      }
    }
  }

  const awb = o.awb_number || o.shipment_id || '';
  const isOfficialAwb = awb.startsWith('STC') || (awb && !awb.startsWith('SHP-'));
  const trackingUrl =
    o.tracking_url || (isOfficialAwb ? `https://stcourier.com/track/shipment?docket=${awb}` : 'https://stcourier.com');

  return {
    id: o.id,
    orderId: o.order_number || o.id,
    customerName: addrObj.name || o.user_id || 'Customer',
    customerPhone: addrObj.phone || '',
    customerAltPhone: addrObj.alternatePhone || addrObj.alternate_phone || '',
    address: addrObj.address || '',
    city: addrObj.city || '',
    pincode: addrObj.pincode || '',
    state: addrObj.state || 'Tamil Nadu',
    totalAmount: Number(o.total_amount || 0),
    paymentMethod: o.payment_method || 'Razorpay',
    paymentStatus: o.payment_status || 'Pending',
    courierStatus: o.order_status || 'Order Placed',
    orderStatus: o.order_status || 'Order Placed',
    isCancelled: isOrderCancelled(o.order_status),
    shipmentId: o.shipment_id || `SHP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-000101`,
    trackingNumber: awb,
    isOfficialAwb,
    trackingUrl,
    courierName: o.courier_name || 'ST Courier Express',
    items: Array.isArray(o.items) ? o.items : [],
    packedAt: o.packed_at ? new Date(o.packed_at).toLocaleString('en-IN') : null,
    shippedAt: o.shipped_at ? new Date(o.shipped_at).toLocaleString('en-IN') : null,
    deliveredAt: o.delivered_at ? new Date(o.delivered_at).toLocaleString('en-IN') : null,
    createdAt: new Date(o.ordered_at || Date.now()).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  };
}

export async function GET(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) {
    return unauthorizedResponse('Please login to view orders.');
  }

  try {
    const { searchParams } = new URL(request.url);
    const orderNumberParam = searchParams.get('orderId');
    const adminCheck = await verifyAdminRequest(request);
    const isAdminRequest = adminCheck.isAdmin;

    let query = `
      SELECT o.*,
             COALESCE(
               json_agg(
                 json_build_object(
                   'id', oi.book_id,
                   'title', oi.book_title,
                   'price', oi.book_price,
                   'qty', oi.quantity,
                   'subtotal', oi.subtotal
                 )
               ) FILTER (WHERE oi.id IS NOT NULL), '[]'
             ) as items
      FROM orders o
      LEFT JOIN order_items oi ON o.id = oi.order_id
    `;
    const params: any[] = [];
    const whereClauses: string[] = [];

    if (orderNumberParam) {
      params.push(orderNumberParam);
      whereClauses.push(`(o.order_number = $${params.length} OR o.id = $${params.length})`);
    }

    if (!isAdminRequest) {
      params.push(session.userId);
      whereClauses.push(`o.user_id = $${params.length}`);
    }

    if (whereClauses.length === 0 && !isAdminRequest) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Non-admin without filters still scoped to self above; admin with no filters gets all
    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    } else if (!isAdminRequest) {
      return NextResponse.json([]);
    }

    query += ` GROUP BY o.id ORDER BY o.ordered_at DESC`;
    const { queryDb } = await import('@/lib/db');
    const res = await queryDb(query, params);
    return NextResponse.json(res.rows.map(mapOrderRow));
  } catch (err: any) {
    console.error('Error fetching orders from DB:', err.message);
    return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) {
    return unauthorizedResponse('Please sign in with Google to place an order.');
  }

  const rl = await applyRateLimitAsync(`orders:${session.userId}:${clientIp(request)}`, 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many orders. Please wait a minute.' }, { status: 429 });
  }

  const client = await getDbClient();
  // Hoisted out of the try block so the catch handler can still see them —
  // needed to know whether a captured payment must be refunded on failure.
  let paymentAlreadyVerified = false;
  let capturedPaymentId: string | null = null;
  let capturedAmountForRefund = 0;
  let capturedOrderNumber = '';
  try {
    const body = await request.json();
    const {
      customerName,
      customerPhone,
      alternatePhone,
      address,
      city,
      pincode,
      items,
      paymentMethod,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      idempotencyKey,
    } = body;
    capturedPaymentId = razorpayPaymentId || null;

    const userId = session.userId;
    const isRazorpay = String(paymentMethod || '').toLowerCase().includes('razorpay');

    await client.query('BEGIN');

    const checkout = await priceCheckoutOrder(client, {
      items,
      userId,
    });

    if (!checkout.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: checkout.error }, { status: checkout.status });
    }

    const {
      subtotal: calculatedSubtotal,
      discountAmount,
      totalAmount,
      verifiedItems,
    } = checkout;
    capturedAmountForRefund = totalAmount;

    const idemKey = String(idempotencyKey || '').trim().slice(0, 80) || null;

    if (idemKey) {
      const byKey = await client.query(
        `SELECT order_number, total_amount FROM orders WHERE idempotency_key = $1 LIMIT 1`,
        [idemKey]
      );
      if (byKey.rows.length) {
        await client.query('ROLLBACK');
        const existing = byKey.rows[0];
        return NextResponse.json({
          orderId: existing.order_number,
          duplicate: true,
          totalAmount: Number(existing.total_amount || totalAmount),
          message: 'Order already placed.',
        });
      }
    }

    if (!isRazorpay) {
      await client.query('ROLLBACK');
      return NextResponse.json(
        { error: 'Only Razorpay online payments are accepted. Cash on Delivery is disabled.' },
        { status: 400 }
      );
    }

    if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Payment details required for online checkout.' }, { status: 400 });
    }

    const dupPay = await client.query(
      `SELECT order_number, id, total_amount FROM orders WHERE razorpay_payment_id = $1 LIMIT 1`,
      [razorpayPaymentId]
    );
    if (dupPay.rows.length) {
      await client.query('ROLLBACK');
      const existing = dupPay.rows[0];
      return NextResponse.json({
        orderId: existing.order_number,
        duplicate: true,
        totalAmount: Number(existing.total_amount || totalAmount),
        message: 'Payment already processed — returning your existing order.',
      });
    }

    const verified = await verifyRazorpayPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      expectedRupees: totalAmount,
    });
    if (!verified.ok) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: verified.error }, { status: 400 });
    }
    // From here on, Razorpay has confirmed the money is captured. Any failure
    // past this point MUST refund — never let a confirmed capture sit orphaned.
    paymentAlreadyVerified = true;

    const payStat = 'Payment Confirmed';
    const id = `ord-${Date.now()}`;
    const orderNumber = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    capturedOrderNumber = orderNumber;
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const internalShipmentId = `SHP-${ymd}-${Math.floor(100000 + Math.random() * 900000)}`;
    const initialStatus = 'Confirmed';

    const shippingAddressObj = JSON.stringify({
      name: customerName,
      phone: customerPhone,
      alternatePhone: String(alternatePhone || '').replace(/\D/g, '').slice(-10) || '',
      address: address || '',
      city: city || 'Chennai',
      pincode: pincode || '600012',
    });

    await client.query(
      `INSERT INTO orders (id, order_number, user_id, subtotal, discount, total_amount, payment_method, payment_status, order_status,
        courier_name, shipment_id, awb_number, shipping_address, razorpay_order_id, razorpay_payment_id, razorpay_signature, coupon_code, coupon_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ST Courier Express', $10, NULL, $11, $12, $13, $14, NULL, NULL, $15)`,
      [
        id,
        orderNumber,
        userId,
        calculatedSubtotal,
        discountAmount,
        totalAmount,
        paymentMethod || 'Razorpay UPI',
        payStat,
        initialStatus,
        internalShipmentId,
        shippingAddressObj,
        razorpayOrderId || null,
        razorpayPaymentId || null,
        razorpaySignature || null,
        idemKey,
      ]
    );

    for (const item of verifiedItems) {
      const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      await client.query(
        `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [itemId, id, item.id, item.title, item.price, item.qty, item.subtotal]
      );

      const stockRes = await client.query(
        `UPDATE books
         SET stock = COALESCE(stock, 0) - $1,
             status = CASE WHEN COALESCE(stock, 0) - $1 <= 0 THEN 'out_of_stock' ELSE status END,
             updated_at = NOW()
         WHERE id = $2 AND COALESCE(stock, 0) >= $1
         RETURNING id, title, stock`,
        [item.qty, item.id]
      );
      if (stockRes.rowCount === 0) {
        await client.query('ROLLBACK');
        // Someone else's order won this stock race after our payment was
        // already captured — refund immediately, don't let money sit taken.
        const refund = await refundOrphanedCapture(client, {
          paymentId: razorpayPaymentId,
          orderNumberAttempt: orderNumber,
          amountRupees: totalAmount,
          reason: `stock conflict on "${item.title}"`,
        });
        const message = refund.refunded
          ? `"${item.title}" went out of stock while your payment was processing. Your payment of ₹${totalAmount} has been refunded automatically — it will reflect in your original payment method within 5-7 business days.`
          : `"${item.title}" went out of stock while your payment was processing. We could not auto-refund immediately — our team has been notified and will refund your payment of ₹${totalAmount} within 24 hours. Please contact us with payment ID ${razorpayPaymentId} if you don't see it.`;
        return NextResponse.json(
          { error: message, refunded: refund.refunded, refundId: refund.refundId },
          { status: 409 }
        );
      }
    }

    if (razorpayPaymentId) {
      await client.query(
        `INSERT INTO payments (id, order_id, payment_id, transaction_id, amount, status)
         VALUES ($1, $2, $3, $4, $5, 'SUCCESS')`,
        [`pay-${Date.now()}`, id, razorpayPaymentId, razorpayOrderId || razorpayPaymentId, totalAmount]
      );
    }

    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks) VALUES ($1, $2, 'Confirmed', 'Order placed successfully')`,
      [`tl-${Date.now()}`, id]
    );

    await client.query('COMMIT');

    try {
      const phoneDigits = String(customerPhone || '').replace(/\D/g, '').slice(-10);
      if (phoneDigits.length === 10) {
        await client.query(
          `UPDATE abandoned_carts SET reminded = TRUE, updated_at = NOW() WHERE id = $1`,
          [`ac-${phoneDigits}`]
        ).catch(() => {});
      }
    } catch {
      /* table may not exist yet */
    }

    const event = {
      type: 'ORDER_CREATED',
      orderId: orderNumber,
      status: initialStatus,
      timestamp: Date.now(),
    };
    try {
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch (_) {}

    return NextResponse.json(
      {
        orderId: orderNumber,
        shipmentId: internalShipmentId,
        totalAmount,
        subtotal: calculatedSubtotal,
        discount: discountAmount,
        status: initialStatus,
        paymentMethod,
        paymentStatus: payStat,
      },
      { status: 201 }
    );
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}

    // Payment was verified as captured before this exception hit — refund
    // rather than leaving the customer paid with no order.
    if (paymentAlreadyVerified && capturedPaymentId) {
      const refund = await refundOrphanedCapture(client, {
        paymentId: capturedPaymentId,
        orderNumberAttempt: capturedOrderNumber,
        amountRupees: capturedAmountForRefund,
        reason: `order creation error: ${err?.message || 'unknown'}`,
      });
      const message = refund.refunded
        ? 'We could not complete your order due to a system error, but your payment has been refunded automatically — it will reflect in your original payment method within 5-7 business days.'
        : `We could not complete your order due to a system error. We could not auto-refund immediately — our team has been notified and will refund you within 24 hours. Please contact us with payment ID ${capturedPaymentId} if needed.`;
      return NextResponse.json(
        { error: message, refunded: refund.refunded, refundId: refund.refundId },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: err.message || 'Order failed' }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  let client: any = null;
  try {
    const { orderId, status, awbNumber } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    client = await getDbClient();

    const existing = await client.query(
      `SELECT order_status FROM orders WHERE order_number = $1 OR id = $1 LIMIT 1`,
      [orderId]
    );
    if (!existing.rows.length) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    const currentStatus = existing.rows[0].order_status;
    if (blocksShippingActions(currentStatus)) {
      return NextResponse.json(
        {
          error: isOrderCancelled(currentStatus)
            ? 'Cannot update status or AWB on a cancelled order.'
            : 'Cannot update status or AWB — order is not confirmed yet.',
        },
        { status: 409 }
      );
    }

    const newStatus = status || 'Handed to ST Courier';
    if (isOrderCancelled(newStatus)) {
      return NextResponse.json(
        { error: 'Use POST /api/orders/cancel (admin only; Razorpay refund for paid orders).' },
        { status: 400 }
      );
    }
    const isOfficial = awbNumber && (awbNumber.startsWith('STC') || !awbNumber.startsWith('SHP-'));
    const trackingUrl = isOfficial ? `https://stcourier.com/track/shipment?docket=${awbNumber}` : 'https://stcourier.com';

    let timestampUpdate = '';
    if (newStatus === 'Packed') {
      timestampUpdate = ', packed_at = NOW()';
    } else if (newStatus === 'Handed to ST Courier' || newStatus === 'In Transit') {
      timestampUpdate = ', shipped_at = NOW()';
    } else if (newStatus === 'Delivered') {
      timestampUpdate = ', delivered_at = NOW()';
    }

    await client.query(
      `UPDATE orders 
       SET order_status = $1, 
           awb_number = COALESCE($2, awb_number), 
           tracking_url = COALESCE($3, tracking_url), 
           updated_at = NOW() ${timestampUpdate}
       WHERE order_number = $4 OR id = $4`,
      [newStatus, awbNumber || null, trackingUrl, orderId]
    );

    try {
      await client.query(
        `INSERT INTO order_timeline (id, order_id, status, remarks) 
         VALUES ($1, (SELECT id FROM orders WHERE order_number = $2 OR id::text = $2 LIMIT 1), $3, $4)`,
        [
          `tl-${Date.now()}`,
          orderId,
          newStatus,
          `Admin updated status to [${newStatus}] with AWB: ${awbNumber || 'N/A'}`,
        ]
      );
    } catch (_) {}

    const event = { type: 'ORDER_UPDATED', orderId, status: newStatus, awbNumber, timestamp: Date.now() };
    try {
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch (_) {}

    return NextResponse.json({ success: true, orderId, status: newStatus, awbNumber, trackingUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
