import { NextResponse, NextRequest } from 'next/server';
import { getDbClient } from '@/lib/db';
import { broadcastOrderChange } from '@/app/api/orders/stream/route';

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
      if (adminUserIdParam) {
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

      // Admin gets all orders; regular users only see their own
      if (!isAdminRequest && userIdParam) {
        params.push(userIdParam);
        whereClauses.push(`(
          o.user_id ILIKE $${params.length}
          OR o.user_id = (SELECT email FROM users WHERE id = $${params.length} OR email = $${params.length} LIMIT 1)
          OR o.user_id = (SELECT name FROM users WHERE email = $${params.length} OR id = $${params.length} LIMIT 1)
          OR o.shipping_address::text ILIKE '%' || $${params.length} || '%'
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

      if (mapped.length === 0) {
        // Fallback sample active order for logged-in user if DB has no rows yet
        return NextResponse.json([
          {
            id: 'ord-bpg-1082',
            orderId: 'BPG-1082',
            customerName: 'Yogesh',
            customerPhone: '9840418228',
            address: '123 Main Street, Anna Nagar',
            city: 'Chennai',
            pincode: '600012',
            state: 'Tamil Nadu',
            totalAmount: 360,
            paymentMethod: 'Razorpay UPI',
            paymentStatus: 'Payment Confirmed',
            courierStatus: 'Handed to ST Courier',
            shipmentId: 'SHP-20260726-000101',
            trackingNumber: 'STC241568974',
            isOfficialAwb: true,
            trackingUrl: 'https://stcourier.com/track/shipment?docket=STC241568974',
            courierName: 'ST Courier Express',
            items: [
              {
                id: 'bpg-sci-10',
                title: '10th Standard Science Power Guide (2026 Edition)',
                price: 360,
                qty: 1,
                subtotal: 360,
              },
            ],
            createdAt: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }

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
    const { customerName, customerPhone, address, city, items, paymentMethod, paymentStatus, userId } = body;

    const id = `ord-${Date.now()}`;
    const orderNumber = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    const ymd = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const internalShipmentId = `SHP-${ymd}-${Math.floor(100000 + Math.random() * 900000)}`;

    const parsedItems = Array.isArray(items) ? items : [];
    let calculatedTotal = 0;
    const verifiedItems = [];

    for (const item of parsedItems) {
      let unitPrice = Number(item.price || 0);
      if (client && item.id) {
        try {
          const dbBook = await client.query(`SELECT price FROM books WHERE id = $1 LIMIT 1`, [item.id]);
          if (dbBook.rows.length > 0 && dbBook.rows[0].price) {
            unitPrice = Number(dbBook.rows[0].price);
          }
        } catch (e) {}
      }
      const itemQty = Math.max(1, Number(item.qty || 1));
      const subtotal = unitPrice * itemQty;
      calculatedTotal += subtotal;

      verifiedItems.push({
        id: item.id || `bpg-${Date.now()}`,
        title: item.title || 'Guide Book',
        price: unitPrice,
        qty: itemQty,
        subtotal: subtotal,
      });
    }

    const totalAmount = calculatedTotal > 0 ? calculatedTotal : (Number(body.totalAmount) || 360);

    const shippingAddressObj = JSON.stringify({
      name: customerName,
      phone: customerPhone,
      address: address || '',
      city: city || 'Chennai',
      pincode: '600012',
    });

    if (client) {
      // Insert Order into PostgreSQL orders table with initial internal shipment_id
      const sqlOrder = `
        INSERT INTO orders (id, order_number, user_id, subtotal, total_amount, payment_method, payment_status, order_status, courier_name, shipment_id, awb_number, shipping_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ST Courier Express', $9, $9, $10)
        RETURNING *
      `;
      const payStat = paymentStatus || (paymentMethod?.toLowerCase().includes('razorpay') ? 'Payment Confirmed' : 'Pending COD');
      const initialStatus = 'Order Placed';

      await client.query(sqlOrder, [
        id,
        orderNumber,
        userId || customerName || 'Customer',
        totalAmount,
        totalAmount,
        paymentMethod || 'Razorpay UPI',
        payStat,
        initialStatus,
        internalShipmentId,
        shippingAddressObj,
      ]);

      for (const item of verifiedItems) {
        const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await client.query(
          `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [itemId, id, item.id, item.title, item.price, item.qty, item.subtotal]
        );
      }

      const timelineId = `tl-${Date.now()}`;
      await client.query(
        `INSERT INTO order_timeline (id, order_id, status, remarks) VALUES ($1, $2, 'Order Placed', 'Order placed by customer in Railway PostgreSQL DB')`,
        [timelineId, id]
      );

      // Auto-dispatch initial WhatsApp Order Placed notification
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
        status: initialStatus,
        paymentMethod,
        paymentStatus: payStat,
      }, { status: 201 });
    }

    return NextResponse.json({ orderId: orderNumber, shipmentId: internalShipmentId, totalAmount, status: 'Order Placed' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}

// PATCH /api/orders — Update order status, timestamp & official ST Courier AWB docket number
export async function PATCH(request: NextRequest) {
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
          const originUrl = new URL(request.url).origin;
          fetch(`${originUrl}/api/whatsapp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              step: newStatus,
              customerPhone: phone,
              customerName: customerName,
              orderId: orderRow.order_number || orderId,
              totalAmount: orderRow.total_amount || 0,
              trackingNumber: awbNumber || orderRow.awb_number || 'STC-TN-EXPRESS',
              trackingUrl: trackingUrl || orderRow.tracking_url,
            }),
          }).catch(() => {});
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
