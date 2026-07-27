import { NextResponse, NextRequest } from 'next/server';
import { getDbClient } from '@/lib/db';
import { broadcastOrderChange } from '@/app/api/orders/stream/route';
import { verifyAdminRequest, forbiddenResponse, getAuthenticatedUser } from '@/lib/serverSecurity';

export async function GET(request: Request) {
  const client = await getDbClient();
  try {
    const { searchParams } = new URL(request.url);
    const orderNumberParam = searchParams.get('orderId');
    const userIdParam = searchParams.get('userId');
    const adminUserIdParam = searchParams.get('adminUserId');

    if (client) {
      // Admin access: verify the requesting user has role='admin' in DB
      let isAdminRequest = false;
      const session = await getAuthenticatedUser(request);
      if (session?.role === 'admin') {
        isAdminRequest = true;
      } else if (adminUserIdParam) {
        try {
          const adminCheck = await client.query(
            `SELECT id FROM users WHERE id = $1 AND role = 'admin' LIMIT 1`,
            [adminUserIdParam]
          );
          isAdminRequest = adminCheck.rows.length > 0;
        } catch (_) {}
        if (!isAdminRequest) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      }
      // Auto-heal legacy order rows where user_id was stored as name or empty
      try {
        await client.query(`
          UPDATE orders 
          SET user_id = (shipping_address->>'name')
          WHERE user_id IS NULL OR user_id = 'Customer' OR user_id = '';
        `);
      } catch (_) {}
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
      let params: any[] = [];
      let whereClauses: string[] = [];

      if (orderNumberParam) {
        params.push(orderNumberParam);
        whereClauses.push(`(o.order_number = $${params.length} OR o.id = $${params.length})`);
      }

      // Admin gets all orders; regular users match by ID, email, phone, name, or address
      if (!isAdminRequest && userIdParam) {
        params.push(userIdParam);
        const p1 = params.length;
        params.push(`%${userIdParam}%`);
        const p2 = params.length;
        whereClauses.push(`(
          o.user_id = $${p1}
          OR LOWER(o.user_id) = LOWER($${p1})
          OR o.user_id ILIKE $${p2}
          OR o.shipping_address::text ILIKE $${p2}
          OR o.user_id = (SELECT id FROM users WHERE id = $${p1} OR LOWER(email) = LOWER($${p1}) OR phone = $${p1} LIMIT 1)
          OR o.user_id = (SELECT email FROM users WHERE id = $${p1} OR LOWER(email) = LOWER($${p1}) OR phone = $${p1} LIMIT 1)
        )`);
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      query += ` GROUP BY o.id ORDER BY o.ordered_at DESC`;

      const res = await client.query(query, params);

      const mapped = res.rows.map((o: any) => {
        let addrObj: any = {};
        if (o.shipping_address) {
          if (typeof o.shipping_address === 'object') {
            addrObj = o.shipping_address;
          } else if (typeof o.shipping_address === 'string') {
            try {
              addrObj = JSON.parse(o.shipping_address);
            } catch (e) {
              addrObj = { address: o.shipping_address };
            }
          }
        }

        const awb = o.awb_number || o.shipment_id || '';
        const isOfficialAwb = awb.startsWith('STC') || (awb && !awb.startsWith('SHP-'));
        const trackingUrl = o.tracking_url || (isOfficialAwb ? `https://stcourier.com/track/shipment?docket=${awb}` : 'https://stcourier.com');

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
          shipmentId: o.shipment_id || `SHP-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-000101`,
          trackingNumber: awb,
          isOfficialAwb: isOfficialAwb,
          trackingUrl: trackingUrl,
          courierName: o.courier_name || 'ST Courier Express',
          items: Array.isArray(o.items) ? o.items : [],
          packedAt: o.packed_at ? new Date(o.packed_at).toLocaleString('en-IN') : null,
          shippedAt: o.shipped_at ? new Date(o.shipped_at).toLocaleString('en-IN') : null,
          deliveredAt: o.delivered_at ? new Date(o.delivered_at).toLocaleString('en-IN') : null,
          createdAt: new Date(o.ordered_at || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        };
      });

      return NextResponse.json(mapped);
    }
  } catch (err: any) {
    console.error('Error fetching orders from DB:', err.message);
  } finally {
    if (client) await client.end();
  }

  return NextResponse.json([]);
}

export async function POST(request: Request) {
  const client = await getDbClient();
  try {
    const body = await request.json();
    const {
      customerName, customerPhone, address, city, pincode, items,
      paymentMethod, paymentStatus, userId, couponCode,
      razorpayPaymentId, razorpayOrderId, razorpaySignature,
    } = body;

    const id = `ord-${Date.now()}`;
    const orderNumber = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const internalShipmentId = `SHP-${ymd}-${Math.floor(100000 + Math.random() * 900000)}`;

    const parsedItems = Array.isArray(items) ? items : [];
    let calculatedSubtotal = 0;
    const verifiedItems = [];

    for (const item of parsedItems) {
      let unitPrice = Number(item.price || 0);
      let title = item.title || 'Guide Book';
      if (client && item.id) {
        try {
          const dbBook = await client.query(
            `SELECT title, price, discount_price, stock, status FROM books WHERE id = $1 LIMIT 1`,
            [item.id]
          );
          if (dbBook.rows.length > 0) {
            const book = dbBook.rows[0];
            if (book.status === 'out_of_stock' || Number(book.stock) <= 0) {
              return NextResponse.json({ error: `"${book.title}" is out of stock.` }, { status: 400 });
            }
            unitPrice = Number(book.discount_price || book.price);
            title = book.title;
          }
        } catch (_) {}
      }
      const itemQty = Math.max(1, Number(item.qty || 1));
      const subtotal = unitPrice * itemQty;
      calculatedSubtotal += subtotal;
      verifiedItems.push({ id: item.id, title, price: unitPrice, qty: itemQty, subtotal });
    }

    let discountAmount = 0;
    if (couponCode && client) {
      const couponRes = await client.query(
        `SELECT * FROM coupons WHERE UPPER(code) = $1 AND status = 'active'
         AND (expiry_date IS NULL OR expiry_date > NOW()) LIMIT 1`,
        [String(couponCode).trim().toUpperCase()]
      );
      if (couponRes.rows.length > 0) {
        const c = couponRes.rows[0];
        if (calculatedSubtotal >= Number(c.minimum_amount || 0)) {
          discountAmount =
            c.discount_type === 'percentage'
              ? Math.round((calculatedSubtotal * Number(c.discount_value)) / 100)
              : Math.min(Number(c.discount_value), calculatedSubtotal);
        }
      }
    }

    const totalAmount = Math.max(0, calculatedSubtotal - discountAmount);

    const shippingAddressObj = JSON.stringify({
      name: customerName,
      phone: customerPhone,
      address: address || '',
      city: city || 'Chennai',
      pincode: pincode || '600012',
    });

    if (client) {
      const payStat = paymentStatus || (paymentMethod?.toLowerCase().includes('razorpay') ? 'Payment Confirmed' : 'Pending COD');
      const initialStatus = 'Order Placed';

      await client.query(
        `INSERT INTO orders (id, order_number, user_id, subtotal, discount, total_amount, payment_method, payment_status, order_status,
          courier_name, shipment_id, awb_number, shipping_address, razorpay_order_id, razorpay_payment_id, razorpay_signature)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ST Courier Express', $10, $10, $11, $12, $13, $14)`,
        [
          id, orderNumber, userId || customerName || 'Customer',
          calculatedSubtotal, discountAmount, totalAmount,
          paymentMethod || 'Razorpay UPI', payStat, initialStatus,
          internalShipmentId, shippingAddressObj,
          razorpayOrderId || null, razorpayPaymentId || null, razorpaySignature || null,
        ]
      );

      for (const item of verifiedItems) {
        const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await client.query(
          `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [itemId, id, item.id, item.title, item.price, item.qty, item.subtotal]
        );
      }

      if (razorpayPaymentId) {
        await client.query(
          `INSERT INTO payments (id, order_id, payment_id, transaction_id, amount, status)
           VALUES ($1, $2, $3, $4, $5, 'SUCCESS')`,
          [`pay-${Date.now()}`, id, razorpayPaymentId, razorpayOrderId || razorpayPaymentId, totalAmount]
        );
      }

      const timelineId = `tl-${Date.now()}`;
      await client.query(
        `INSERT INTO order_timeline (id, order_id, status, remarks) VALUES ($1, $2, 'Order Placed', 'Order placed by customer')`,
        [timelineId, id]
      );

      try {
        const originUrl = new URL(request.url).origin;
        fetch(`${originUrl}/api/whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: 'ORDER_PLACED',
            customerPhone: customerPhone,
            customerName: customerName,
            orderId: orderNumber,
            totalAmount: totalAmount,
            trackingNumber: internalShipmentId,
            items: verifiedItems,
          }),
        }).catch(() => {});
      } catch (_) {}

      return NextResponse.json({
        orderId: orderNumber,
        shipmentId: internalShipmentId,
        totalAmount,
        subtotal: calculatedSubtotal,
        discount: discountAmount,
        status: initialStatus,
        paymentMethod,
        paymentStatus: payStat,
      }, { status: 201 });
    }

    return NextResponse.json({ orderId: orderNumber, totalAmount }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}

// PATCH /api/orders — Update order status, timestamp & official ST Courier AWB docket number
export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  let client: any = null;
  try {
    const { orderId, status, awbNumber } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const db = await import('@/lib/db');
    client = await db.getDbClient();

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

    const timelineId = `tl-${Date.now()}`;
    try {
      await client.query(
        `INSERT INTO order_timeline (id, order_id, status, remarks) 
         VALUES ($1, (SELECT id FROM orders WHERE order_number = $2 OR id::text = $2 LIMIT 1), $3, $4)`,
        [timelineId, orderId, newStatus, `Admin updated status to [${newStatus}] with AWB: ${awbNumber || 'N/A'}`]
      );
    } catch (_) {}

    // Auto-dispatch WhatsApp Notification to Student
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
          const addr = typeof orderRow.shipping_address === 'string' ? JSON.parse(orderRow.shipping_address) : orderRow.shipping_address;
          phone = addr?.phone || '';
          customerName = addr?.name || 'Customer';
        } catch (_) {}

        if (phone) {
          try {
            const { sendWhatsAppMessageInProcess } = await import('@/lib/whatsapp');
            const message = `*BLESSING POWER GUIDE*\n*${newStatus.toUpperCase()}*\n\nDear *${customerName}*,\nYour order status has been updated to: *${newStatus}*.\n\n📦 *Order ID:* ${orderRow.order_number || orderId}\n🚚 *Partner:* ST Courier Express\n📍 *Docket AWB:* ${awbNumber || orderRow.awb_number || 'Pending'}\n\n👉 *Track Live:* https://blessing-production.up.railway.app/profile`;
            await sendWhatsAppMessageInProcess(phone, message);
          } catch (waErr: any) {
            console.error('In-process WhatsApp dispatch error in PATCH /api/orders:', waErr.message);
          }
        }
      }
    } catch (waErr) {
      console.error('Auto WhatsApp dispatch error:', waErr);
    }

    // Broadcast real-time SSE instant update (Firebase style)
    try {
      broadcastOrderChange({ type: 'ORDER_UPDATED', orderId, status: newStatus, awbNumber, timestamp: Date.now() });
    } catch (_) {}

    return NextResponse.json({ success: true, orderId, status: newStatus, awbNumber, trackingUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
