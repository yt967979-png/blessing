import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET() {
  try {
    const client = await getDbClient();
    if (client) {
      const res = await client.query('SELECT * FROM orders ORDER BY createdAt DESC');
      await client.end();
      return NextResponse.json(res.rows);
    }
  } catch (err) {}

  return NextResponse.json([]);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { customerName, customerPhone, address, city, items, paymentMethod } = body;

    const orderId = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    const itemsStr = typeof items === 'string' ? items : JSON.stringify(items || []);
    const totalAmount = Array.isArray(items)
      ? items.reduce((sum: number, i: any) => sum + i.price * (i.qty || 1), 0)
      : 370;

    const client = await getDbClient();
    if (client) {
      const sql = `
        INSERT INTO orders (orderId, customerName, customerPhone, address, city, totalAmount, items, paymentMethod, paymentStatus, courierStatus)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PAID', 'Order Placed & Confirmed')
        RETURNING *
      `;
      const res = await client.query(sql, [
        orderId,
        customerName || 'Customer',
        customerPhone || '9840418228',
        address || '',
        city || 'Chennai',
        totalAmount,
        itemsStr,
        paymentMethod || 'Razorpay',
      ]);
      await client.end();
      return NextResponse.json(res.rows[0], { status: 201 });
    }

    return NextResponse.json({ orderId, totalAmount }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
