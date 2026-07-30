import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';
import { ensureCouponSchema } from '@/lib/coupons';

/** Admin: who used which coupon */
export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return forbiddenResponse(admin.error);

  let client: any = null;
  try {
    client = await getDbClient();
    await ensureCouponSchema(client);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit') || 50)));

    const res = await client.query(
      `SELECT
         r.id,
         r.created_at,
         r.order_id,
         c.code AS coupon_code,
         c.title AS coupon_title,
         u.name AS user_name,
         u.email AS user_email,
         u.phone AS user_phone,
         o.order_number,
         o.total_amount,
         o.order_status
       FROM coupon_redemptions r
       LEFT JOIN coupons c ON c.id = r.coupon_id
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN orders o ON o.id = r.order_id
       ORDER BY r.created_at DESC
       LIMIT $1`,
      [limit]
    );

    return NextResponse.json(
      res.rows.map((row: any) => ({
        id: row.id,
        usedAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        couponCode: row.coupon_code,
        couponTitle: row.coupon_title,
        userName: row.user_name,
        userEmail: row.user_email,
        userPhone: row.user_phone,
        orderId: row.order_number || row.order_id,
        orderTotal: Number(row.total_amount) || 0,
        orderStatus: row.order_status || null,
        cancelled: String(row.order_status || '').toLowerCase().includes('cancel'),
      }))
    );
  } catch (err: any) {
    console.error('[coupons redemptions]', err?.message || err);
    return NextResponse.json({ error: 'Could not load redemptions' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
