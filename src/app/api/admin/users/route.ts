import { NextRequest, NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { forbiddenResponse, verifyAdminRequest, verifySuperAdminRequest } from '@/lib/serverSecurity';
import { getActiveHoldsSummary } from '@/lib/stockHold';

/** Admin: list customers + low-stock books */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return forbiddenResponse(admin.error);

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') || 'users';

  try {
    if (view === 'low_stock') {
      const res = await queryDb(
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

    // Units currently reserved for in-progress Razorpay checkouts (paid orders
    // already moved these to 'confirmed' and are excluded — this is only the
    // "someone is on the payment sheet right now" bucket).
    if (view === 'stock_holds') {
      const holds = await getActiveHoldsSummary(100);
      const totalQty = holds.reduce((s, h) => s + h.qty, 0);
      return NextResponse.json({ holds, totalQty, count: holds.length });
    }

    const res = await queryDb(
      `SELECT u.id, u.name, u.email, u.phone, u.role, u.status, u.created_at,
              COUNT(DISTINCT o.id) FILTER (
                WHERE o.id IS NOT NULL AND COALESCE(o.order_status, '') NOT ILIKE '%cancel%'
              )::int AS order_count,
              COALESCE(SUM(o.total_amount) FILTER (
                WHERE COALESCE(o.order_status, '') NOT ILIKE '%cancel%'
              ), 0)::numeric AS total_spent
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       WHERE COALESCE(u.role, 'customer') != 'super_admin'
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
        role: u.role || 'customer',
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
  }
}

/** Admin: Promote user to Admin or Revoke Admin role */
export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return forbiddenResponse(admin.error);

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId || '').trim();
    const newRole = String(body.role || '').trim().toLowerCase();

    if (!userId || !['admin', 'customer'].includes(newRole)) {
      return NextResponse.json({ error: 'userId and valid role (admin | customer) required.' }, { status: 400 });
    }

    await queryDb(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id::text = $2::text AND COALESCE(role, 'customer') != 'super_admin'`,
      [newRole, userId]
    );

    return NextResponse.json({ success: true, userId, role: newRole });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return forbiddenResponse(admin.error);

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body.userId || '').trim();
    const status = String(body.status || '').trim();
    if (!userId || !['active', 'banned'].includes(status)) {
      return NextResponse.json({ error: 'userId and status (active|banned) required.' }, { status: 400 });
    }

    await queryDb(`UPDATE users SET status = $1 WHERE id::text = $2::text AND COALESCE(role, 'customer') != 'super_admin'`, [
      status,
      userId,
    ]);
    return NextResponse.json({ success: true, userId, status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/** Admin: Permanently delete user from database */
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return forbiddenResponse(admin.error);

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required for deletion.' }, { status: 400 });
  }

  try {
    await queryDb(`DELETE FROM users WHERE id::text = $1::text AND COALESCE(role, 'customer') != 'super_admin'`, [userId]);
    return NextResponse.json({ success: true, userId });
  } catch (err: any) {
    console.error('[admin/users DELETE]', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Delete user failed.' }, { status: 500 });
  }
}
