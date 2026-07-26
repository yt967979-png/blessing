import { NextResponse, NextRequest } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET(request: Request) {
  const client = await getDbClient();
  try {
    const { searchParams } = new URL(request.url);
    const orderNumberParam = searchParams.get('orderId');
    const userIdParam = searchParams.get('userId');

    if (client) {
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

      if (userIdParam) {
        params.push(userIdParam);
        whereClauses.push(`(o.user_id = $${params.length} OR o.user_id = (SELECT email FROM users WHERE id = $${params.length} LIMIT 1))`);
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

        const awb = o.awb_number || '';
        const trackingUrl = o.tracking_url || (awb ? `https://stcourier.com/track/shipment?docket=${awb}` : 'https://stcourier.com');

        return {
          orderId: o.order_number || o.id,
          customerName: addrObj.name || o.user_id || 'Customer',
          customerPhone: addrObj.phone || '',
          address: addrObj.address || '',
          city: addrObj.city || '',
          pincode: addrObj.pincode || '',
          state: addrObj.state || 'Tamil Nadu',
          totalAmount: Number(o.total_amount || 0),
          paymentMethod: o.payment_method || 'Razorpay',
          paymentStatus: o.payment_status || 'Pending',
          courierStatus: o.order_status || 'Order Placed',
          trackingNumber: awb,
          trackingUrl: trackingUrl,
          courierName: o.courier_name || 'ST Courier Express',
          items: Array.isArray(o.items) ? o.items : [],
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
    const { customerName, customerPhone, address, city, items, paymentMethod, paymentStatus, userId } = body;

    const id = `ord-${Date.now()}`;
    const orderNumber = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    const parsedItems = Array.isArray(items) ? items : [];
    // Server-side Price Verification against Railway PostgreSQL DB to prevent client tampering
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
      // 1. Insert Order into PostgreSQL orders table (status: 'Order Placed')
      const sqlOrder = `
        INSERT INTO orders (id, order_number, user_id, subtotal, total_amount, payment_method, payment_status, order_status, courier_name, shipping_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ST Courier Express', $9)
        RETURNING *
      `;
      const payStat = paymentStatus || (paymentMethod?.toLowerCase().includes('razorpay') ? 'PAID' : 'Pending COD');
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
        shippingAddressObj,
      ]);

      // 2. Insert Order Items into order_items table
      for (const item of verifiedItems) {
        const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await client.query(
          `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [itemId, id, item.id, item.title, item.price, item.qty, item.subtotal]
        );
      }

      // 3. Insert Order Timeline entry
      const timelineId = `tl-${Date.now()}`;
      await client.query(
        `INSERT INTO order_timeline (id, order_id, status, remarks) VALUES ($1, $2, 'Order Placed', 'Order placed by customer in Railway PostgreSQL DB')`,
        [timelineId, id]
      );

      return NextResponse.json({
        orderId: orderNumber,
        totalAmount,
        status: initialStatus,
        paymentMethod,
        paymentStatus: payStat,
      }, { status: 201 });
    }

    return NextResponse.json({ orderId: orderNumber, totalAmount, status: 'Order Placed' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}

// PATCH /api/orders — Admin accepts order & updates order status + AWB docket number
export async function PATCH(request: NextRequest) {
  let client: any = null;
  try {
    const { orderId, status, awbNumber } = await request.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const db = await import('@/lib/db');
    client = await db.getDbClient();

    const newStatus = status || 'Shipped via ST Courier';
    const trackingUrl = awbNumber ? `https://stcourier.com/track/shipment?docket=${awbNumber}` : null;

    await client.query(
      `UPDATE orders 
       SET order_status = $1, 
           awb_number = COALESCE($2, awb_number), 
           tracking_url = COALESCE($3, tracking_url), 
           updated_at = NOW() 
       WHERE order_number = $4 OR id = $4`,
      [newStatus, awbNumber || null, trackingUrl, orderId]
    );

    // Add timeline event
    const timelineId = `tl-${Date.now()}`;
    try {
      await client.query(
        `INSERT INTO order_timeline (id, order_id, status, remarks) 
         VALUES ($1, (SELECT id FROM orders WHERE order_number = $2 OR id::text = $2 LIMIT 1), $3, $4)`,
        [timelineId, orderId, newStatus, `Admin assigned AWB: ${awbNumber || 'N/A'} & set status: ${newStatus}`]
      );
    } catch (_) {}

    return NextResponse.json({ success: true, orderId, status: newStatus, awbNumber, trackingUrl });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
