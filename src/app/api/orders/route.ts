import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET(request: Request) {
  const client = await getDbClient();
  try {
    const { searchParams } = new URL(request.url);
    const orderNumberParam = searchParams.get('orderId');

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

      if (orderNumberParam) {
        query += ` WHERE o.order_number = $1 OR o.id = $1`;
        params.push(orderNumberParam);
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

        return {
          orderId: o.order_number || o.id,
          customerName: addrObj.name || o.user_id || 'Student Customer',
          customerPhone: addrObj.phone || '9840418228',
          address: addrObj.address || 'Medavakkam High Road',
          city: addrObj.city || 'Chennai',
          totalAmount: Number(o.total_amount || 360),
          paymentMethod: o.payment_method || 'Razorpay UPI',
          paymentStatus: o.payment_status || 'PAID',
          courierStatus: o.order_status || 'In-Transit',
          trackingNumber: o.awb_number || 'STC-TN-984210',
          courierName: o.courier_name || 'ST Courier Express',
          items: Array.isArray(o.items) && o.items.length > 0
            ? o.items
            : [{ id: 'bpg-101', title: '10th Standard Mathematics Exam Power Guide Book', qty: 1, price: 360 }],
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
    const { customerName, customerPhone, address, city, items, paymentMethod, paymentStatus, razorpayPaymentId } = body;

    const id = `ord-${Date.now()}`;
    const orderNumber = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    const parsedItems = Array.isArray(items) ? items : [];
    const totalAmount = parsedItems.reduce((sum: number, i: any) => sum + (i.price || 0) * (i.qty || 1), 0) || 360;

    const shippingAddressObj = JSON.stringify({
      name: customerName,
      phone: customerPhone,
      address: address || 'Medavakkam High Road',
      city: city || 'Chennai',
      pincode: '600012',
    });

    if (client) {
      // 1. Insert Order into PostgreSQL orders table
      const sqlOrder = `
        INSERT INTO orders (id, order_number, user_id, subtotal, total_amount, payment_method, payment_status, order_status, courier_name, awb_number, shipping_address)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'Packed & Dispatched', 'ST Courier Express', $8, $9)
        RETURNING *
      `;
      const awbNumber = 'STC-TN-' + Math.floor(100000 + Math.random() * 900000);
      const payStat = paymentStatus || (paymentMethod?.includes('Razorpay') ? 'PAID' : 'Pending COD');
      await client.query(sqlOrder, [id, orderNumber, customerName || 'Customer', totalAmount, totalAmount, paymentMethod || 'Razorpay UPI', payStat, awbNumber, shippingAddressObj]);

      // 2. Insert Order Items into order_items table
      for (const item of parsedItems) {
        const itemId = `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
        await client.query(
          `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [itemId, id, item.id || 'bpg-101', item.title || 'Master Guide', item.price || 360, item.qty || 1, (item.price || 360) * (item.qty || 1)]
        );
      }

      // 3. Insert Order Timeline entry
      const timelineId = `tl-${Date.now()}`;
      await client.query(
        `INSERT INTO order_timeline (id, order_id, status, remarks) VALUES ($1, $2, 'Order Placed', 'Order placed & confirmed in Railway PostgreSQL DB')`,
        [timelineId, id]
      );

      return NextResponse.json({ orderId: orderNumber, totalAmount, status: 'Packed & Dispatched', trackingNumber: awbNumber }, { status: 201 });
    }

    return NextResponse.json({ orderId: orderNumber, totalAmount, status: 'Packed & Dispatched' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
