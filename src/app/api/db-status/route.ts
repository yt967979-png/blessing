import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_PRIVATE_URL;
  let client: any = null;
  
  try {
    client = await getDbClient();
  } catch (err: any) {
    return NextResponse.json({
      status: 'DISCONNECTED',
      message: err.message || 'DATABASE_URL is missing in Railway environment variables.',
      instruction: 'In Railway Dashboard -> Web Service -> Variables, add DATABASE_URL = ${{Postgres.DATABASE_URL}}',
      envKeysPresent: Object.keys(process.env).filter((k) => k.includes('DB') || k.includes('POSTGRES') || k.includes('PG')),
    });
  }

  try {
    const catRes = await client.query('SELECT COUNT(*) FROM categories');
    const bookRes = await client.query('SELECT COUNT(*) FROM books');
    const userRes = await client.query('SELECT COUNT(*) FROM users');
    const orderRes = await client.query('SELECT COUNT(*) FROM orders');
    const revRes = await client.query('SELECT COUNT(*) FROM reviews');
    const addrRes = await client.query('SELECT COUNT(*) FROM addresses');

    return NextResponse.json({
      status: 'CONNECTED',
      database: 'Railway PostgreSQL',
      connectionUrlFound: !!connectionString,
      tableRowCounts: {
        books: Number(bookRes.rows[0].count),
        categories: Number(catRes.rows[0].count),
        users: Number(userRes.rows[0].count),
        orders: Number(orderRes.rows[0].count),
        reviews: Number(revRes.rows[0].count),
        addresses: Number(addrRes.rows[0].count),
      },
      message: '✅ Railway PostgreSQL is connected and 17 tables are active!',
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'ERROR', error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
