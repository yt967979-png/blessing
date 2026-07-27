import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'faq';

  const client = await getDbClient();
  try {
    if (type === 'settings') {
      const res = await client.query(`SELECT * FROM settings WHERE id = 'main' LIMIT 1`);
      return NextResponse.json(res.rows[0] || {});
    }

    const res = await client.query(
      `SELECT id, question, answer, display_order
       FROM faqs
       WHERE status = 'active'
       ORDER BY display_order ASC, created_at ASC`
    );
    return NextResponse.json(res.rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
