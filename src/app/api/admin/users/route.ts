import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { forbiddenResponse, verifyAdminRequest } from '@/lib/serverSecurity';

/** Admin: list customers + low-stock books */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') || 'users';

  let client: any = null;
  try {
    client = await getDbClient();

    if (view === 'low_stock') {
      const res = await client.query(
        `SELECT id, title, stock, status, price
         FROM books
         WHERE COALESCE(stock, 0) <= 5
         ORDER BY COALESCE(stock, 0) ASC, title ASC
         LIMIT 100`
      );
      return NextResponse.json({
        alerts: res.rows.map((b: any) => ({
          id: b.id,
          title: b.title,
          stock: Number(b.stock ?? 0),
          status: b.status,
          price: Number(b.price || 0),
        })),
      });
    }

    const res = await client.query(
      `SELECT u.id, u.name, u.email, u.phone, u.status, u.created_at,
              COUNT(DISTINCT o.id)::int AS order_count,
              COALESCE(SUM(o.total_amount), 0)::numeric AS total_spent
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       WHERE COALESCE(u.role, 'customer') != 'admin'
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT 500`
    );

    return NextResponse.json(
      res.rows.map((u: any) => ({
        id: u.id,
        name: u.name || '—',
        email: u.email || '—',
        phone: u.phone || '—',
        status: u.status || 'active',
        orderCount: Number(u.order_count || 0),
        totalSpent: Number(u.total_spent || 0),
        createdAt: u.created_at
          ? new Date(u.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })
          : '—',
      }))
    );
  } catch (err: any) {
    console.error('[admin/users GET]', err?.message || err);
    return NextResponse.json({ error: 'Could not load data.' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return forbiddenResponse();

  let client: any = null;
  try {
    const body = await request.json();
    const userId = String(body.userId || '').trim();
    const status = String(body.status || '').trim();
    if (!userId || !['active', 'banned'].includes(status)) {
      return NextResponse.json({ error: 'userId and status (active|banned) required.' }, { status: 400 });
    }

    client = await getDbClient();
    await client.query(`UPDATE users SET status = $1 WHERE id = $2 AND COALESCE(role, 'customer') != 'admin'`, [
      status,
      userId,
    ]);
    return NextResponse.json({ success: true, userId, status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
