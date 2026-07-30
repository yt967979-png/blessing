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
import { priceCartItems, verifyRazorpayPayment } from '@/lib/orderPricing';
import { priceCheckoutOrder } from '@/lib/checkoutPricing';
import { ensureCouponSchema } from '@/lib/coupons';

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
    address: addrObj.address || '',
    city: addrObj.city || '',
    pincode: addrObj.pincode || '',
    state: addrObj.state || 'Tamil Nadu',
    totalAmount: Number(o.total_amount || 0),
    paymentMethod: o.payment_method || 'Razorpay',
    paymentStatus: o.payment_status || 'Payment Confirmed',
    courierStatus: o.order_status || 'Order Placed',
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

  const client = await getDbClient();
  try {
    const { searchParams } = new URL(request.url);
    const orderNumberParam = searchParams.get('orderId');
    const isAdminRequest = session.role === 'admin';

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
    const res = await client.query(query, params);
    return NextResponse.json(res.rows.map(mapOrderRow));
  } catch (err: any) {
    console.error('Error fetching orders from DB:', err.message);
    return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
  } finally {
    if (client) await client.end();
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
  try {
    const body = await request.json();
    const {
      customerName,
      customerPhone,
      address,
      city,
      pincode,
      items,
      paymentMethod,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      couponCode,
      freeBookId,
      idempotencyKey,
    } = body;

    const userId = session.userId;
    const isRazorpay = String(paymentMethod || '').toLowerCase().includes('razorpay');

    await client.query('BEGIN');
    await ensureCouponSchema(client);

    const checkout = await priceCheckoutOrder(client, {
      items,
      userId,
      couponCode: couponCode || null,
      freeBookId: freeBookId || null,
      lockCoupon: true,
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
      appliedCouponId,
      appliedCouponCode,
      coupon,
    } = checkout;

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
      const cartFingerprint = verifiedItems
        .map((i: { id: string; qty: number }) => `${i.id}:${i.qty}`)
        .sort()
        .join('|');
      const dupCod = await client.query(
        `SELECT o.order_number, o.total_amount
         FROM orders o
         WHERE o.user_id = $1
           AND COALESCE(o.ordered_at, o.created_at) > NOW() - INTERVAL '5 minutes'
           AND ABS(o.total_amount - $2) < 0.01
           AND (o.payment_method ILIKE '%cod%' OR o.payment_method ILIKE '%cash%')
           AND (
             SELECT COALESCE(string_agg(oi.book_id || ':' || oi.quantity::text, '|' ORDER BY oi.book_id), '')
             FROM order_items oi WHERE oi.order_id = o.id
           ) = $3
         ORDER BY COALESCE(o.ordered_at, o.created_at) DESC
         LIMIT 1`,
        [userId, totalAmount, cartFingerprint]
      );
      if (dupCod.rows.length) {
        await client.query('ROLLBACK');
        const existing = dupCod.rows[0];
        return NextResponse.json({
          orderId: existing.order_number,
          duplicate: true,
          totalAmount: Number(existing.total_amount || totalAmount),
          message: 'Duplicate order blocked — returning your existing order.',
        });
      }
    }

    if (appliedCouponId && coupon) {
      await client.query(`UPDATE coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE id = $1`, [
        appliedCouponId,
      ]);
    }

    if (isRazorpay) {
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
    }

    const payStat = isRazorpay ? 'Payment Confirmed' : 'Pending COD';
    const id = `ord-${Date.now()}`;
    const orderNumber = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const internalShipmentId = `SHP-${ymd}-${Math.floor(100000 + Math.random() * 900000)}`;
    const initialStatus = 'Order Placed';

    const shippingAddressObj = JSON.stringify({
      name: customerName,
      phone: customerPhone,
      address: address || '',
      city: city || 'Chennai',
      pincode: pincode || '600012',
    });

    await client.query(
      `INSERT INTO orders (id, order_number, user_id, subtotal, discount, total_amount, payment_method, payment_status, order_status,
        courier_name, shipment_id, awb_number, shipping_address, razorpay_order_id, razorpay_payment_id, razorpay_signature, coupon_code, coupon_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ST Courier Express', $10, NULL, $11, $12, $13, $14, $15, $16, $17)`,
      [
        id,
        orderNumber,
        userId,
        calculatedSubtotal,
        discountAmount,
        totalAmount,
        paymentMethod || (isRazorpay ? 'Razorpay UPI' : 'Cash on Delivery (COD)'),
        payStat,
        initialStatus,
        internalShipmentId,
        shippingAddressObj,
        razorpayOrderId || null,
        razorpayPaymentId || null,
        razorpaySignature || null,
        appliedCouponCode,
        appliedCouponId,
        idemKey,
      ]
    );

    if (appliedCouponId) {
      await client.query(
        `INSERT INTO coupon_redemptions (id, coupon_id, user_id, order_id) VALUES ($1, $2, $3, $4)`,
        [`red-${Date.now()}`, appliedCouponId, userId, id]
      );
    }

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
         RETURNING id`,
        [item.qty, item.id]
      );
      if (stockRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { error: `"${item.title}" went out of stock. Please refresh your cart.` },
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
      `INSERT INTO order_timeline (id, order_id, status, remarks) VALUES ($1, $2, 'Order Placed', 'Order placed by customer')`,
      [`tl-${Date.now()}`, id]
    );

    await client.query('COMMIT');

    const event = { type: 'ORDER_UPDATED', orderId: orderNumber, status: initialStatus, timestamp: Date.now() };
    try {
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch (_) {}

    try {
      const originUrl = new URL(request.url).origin;
      fetch(`${originUrl}/api/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: 'ORDER_PLACED',
          customerPhone,
          customerName,
          orderId: orderNumber,
          totalAmount,
          trackingNumber: null,
          items: verifiedItems,
        }),
      }).catch(() => {});
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
    const { orderId, status, awbNumber, skipWhatsApp } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    client = await getDbClient();

    const newStatus = status || 'Handed to ST Courier';
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

    if (!skipWhatsApp) {
      try {
        const orderRes = await client.query(
          `SELECT order_number, user_id, shipping_address, awb_number, tracking_url FROM orders WHERE order_number = $1 OR id::text = $1 LIMIT 1`,
          [orderId]
        );
        if (orderRes.rows.length > 0) {
          const orderRow = orderRes.rows[0];
          let phone = '';
          let customerName = 'Customer';
          try {
            const addr =
              typeof orderRow.shipping_address === 'string'
                ? JSON.parse(orderRow.shipping_address)
                : orderRow.shipping_address;
            phone = addr?.phone || '';
            customerName = addr?.name || 'Customer';
          } catch (_) {}

          if (phone) {
            try {
              const { sendWhatsAppMessageInProcess } = await import('@/lib/whatsapp');
              const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessing-production.up.railway.app';
              const message = `*BLESSING POWER GUIDE*\n*${newStatus.toUpperCase()}*\n\nDear *${customerName}*,\nYour order status has been updated to: *${newStatus}*.\n\n📦 *Order ID:* ${orderRow.order_number || orderId}\n🚚 *Partner:* ST Courier Express\n📍 *Docket AWB:* ${awbNumber || orderRow.awb_number || 'Pending'}\n\n👉 *Track Live:* ${siteUrl}/track?orderId=${encodeURIComponent(orderRow.order_number || orderId)}`;
              await sendWhatsAppMessageInProcess(phone, message);
            } catch (waErr: any) {
              console.error('In-process WhatsApp dispatch error in PATCH /api/orders:', waErr.message);
            }
          }
        }
      } catch (waErr) {
        console.error('Auto WhatsApp dispatch error:', waErr);
      }
    }

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
