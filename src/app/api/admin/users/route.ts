import { NextRequest, NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { forbiddenResponse, verifyAdminRequest, verifySuperAdminRequest } from '@/lib/serverSecurity';
import { getActiveHoldsSummary, releaseStockHolds } from '@/lib/stockHold';

/** Admin: list customers + low-stock books + active stock holds */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return forbiddenResponse(admin.error);

  const { searchParams } = new URL(request.url);
  const view = searchParams.get('view') || 'users';

  try {
    if (view === 'low_stock' || view === 'stock_holds') {
      const res = await queryDb(
        `SELECT id, title, stock, status, price, cls, subject
         FROM books
         WHERE COALESCE(stock, 0) <= 5
         ORDER BY COALESCE(stock, 0) ASC, title ASC
         LIMIT 100`
      );
      const holds = await getActiveHoldsSummary(100);
      const totalHoldQty = holds.reduce((s, h) => s + h.qty, 0);

      return NextResponse.json({
        alerts: res.rows.map((b: any) => ({
          id: b.id,
          title: b.title,
          stock: Number(b.stock ?? 0),
          status: b.status,
          price: Number(b.price || 0),
          cls: b.cls,
          subject: b.subject,
        })),
        holds: {
          count: holds.length,
          totalQty: totalHoldQty,
          list: holds,
        },
      });
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

/** Admin: manual hold release OR Super Admin role modification */
export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return forbiddenResponse(admin.error);

  try {
    const body = await request.json().catch(() => ({}));

    // Action 1: Manual Stock Hold Release by Admin
    if (body.action === 'release_hold') {
      const holdGroupId = String(body.holdGroupId || body.id || '').trim();
      const razorpayOrderId = String(body.razorpayOrderId || '').trim();
      if (!holdGroupId && !razorpayOrderId) {
        return NextResponse.json({ error: 'holdGroupId or razorpayOrderId required.' }, { status: 400 });
      }

      const result = await releaseStockHolds(
        { holdGroupId: holdGroupId || undefined, razorpayOrderId: razorpayOrderId || undefined },
        'admin_manual_release'
      );

      return NextResponse.json({
        success: true,
        releasedCount: result.releasedCount,
        releasedQtyByBook: result.releasedQtyByBook,
      });
    }

    // Action 2: Super Admin only — make or remove a regular admin
    const superAdmin = await verifySuperAdminRequest(request);
    if (!superAdmin.isSuperAdmin) {
      return forbiddenResponse('Only Super Admin can make or remove admins.');
    }

    const userId = String(body.userId || '').trim();
    const newRole = String(body.role || '').trim().toLowerCase();

    if (!userId || !['admin', 'customer'].includes(newRole)) {
      return NextResponse.json({ error: 'userId and valid role (admin | customer) required.' }, { status: 400 });
    }

    // Never demote / reassign Super Admin via this endpoint (role-based, not hardcoded emails)
    const userCheck = await queryDb(
      `SELECT id, email, role FROM users WHERE id::text = $1::text LIMIT 1`,
      [userId]
    );
    if (!userCheck.rows[0]) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    const targetRole = String(userCheck.rows[0].role || '').toLowerCase();
    if (targetRole === 'super_admin') {
      return NextResponse.json({ error: 'Super Admin role cannot be changed here.' }, { status: 400 });
    }
    if (String(userCheck.rows[0].id) === String(admin.user?.userId) && newRole === 'customer') {
      return NextResponse.json({ error: 'You cannot remove your own admin access.' }, { status: 400 });
    }

    await queryDb(
      `UPDATE users SET role = $1, updated_at = NOW()
       WHERE id::text = $2::text AND COALESCE(role, 'customer') != 'super_admin'`,
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
    const status = String(body.status || '').trim().toLowerCase();

    if (!userId || !['active', 'banned', 'inactive'].includes(status)) {
      return NextResponse.json(
        { error: 'userId and valid status (active | banned | inactive) required.' },
        { status: 400 }
      );
    }

    const userCheck = await queryDb(
      `SELECT id, role FROM users WHERE id::text = $1::text LIMIT 1`,
      [userId]
    );
    if (!userCheck.rows[0]) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (String(userCheck.rows[0].role || '').toLowerCase() === 'super_admin') {
      return NextResponse.json({ error: 'Super Admin status cannot be modified.' }, { status: 400 });
    }
    const targetRole = String(userCheck.rows[0].role || '').toLowerCase();
    if (targetRole === 'admin') {
      const superAdmin = await verifySuperAdminRequest(request);
      if (!superAdmin.isSuperAdmin) {
        return forbiddenResponse('Only Super Admin can ban or unban another admin.');
      }
    }

    await queryDb(
      `UPDATE users SET status = $1, updated_at = NOW() WHERE id::text = $2::text`,
      [status, userId]
    );

    return NextResponse.json({ success: true, userId, status });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return forbiddenResponse(admin.error);

  try {
    const userId = String(new URL(request.url).searchParams.get('userId') || '').trim();
    if (!userId) {
      return NextResponse.json({ error: 'userId required.' }, { status: 400 });
    }

    const userCheck = await queryDb(
      `SELECT id, role FROM users WHERE id::text = $1::text LIMIT 1`,
      [userId]
    );
    if (!userCheck.rows[0]) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    const targetRole = String(userCheck.rows[0].role || 'customer').toLowerCase();
    if (targetRole === 'super_admin') {
      return NextResponse.json({ error: 'Super Admin cannot be deleted.' }, { status: 400 });
    }
    if (targetRole === 'admin') {
      const superAdmin = await verifySuperAdminRequest(request);
      if (!superAdmin.isSuperAdmin) {
        return forbiddenResponse('Only Super Admin can delete another admin.');
      }
    }
    if (String(userCheck.rows[0].id) === String(admin.user?.userId)) {
      return NextResponse.json({ error: 'You cannot delete your own account here.' }, { status: 400 });
    }

    await queryDb(`DELETE FROM users WHERE id::text = $1::text AND COALESCE(role, 'customer') != 'super_admin'`, [
      userId,
    ]);
    return NextResponse.json({ success: true, userId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Delete failed' }, { status: 500 });
  }
}
