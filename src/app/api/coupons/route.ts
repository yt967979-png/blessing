import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim().toUpperCase();
  const subtotal = Number(searchParams.get('subtotal') || 0);

  const client = await getDbClient();
  try {
    if (code) {
      const res = await client.query(
        `SELECT code, discount_type, discount_value, minimum_amount
         FROM coupons
         WHERE UPPER(code) = $1
           AND status = 'active'
           AND (expiry_date IS NULL OR expiry_date > NOW())
           AND (usage_limit IS NULL OR usage_limit > 0)
         LIMIT 1`,
        [code]
      );
      if (res.rows.length === 0) {
        return NextResponse.json({ valid: false, error: 'Invalid or expired coupon code.' }, { status: 400 });
      }
      const coupon = res.rows[0];
      if (subtotal > 0 && Number(coupon.minimum_amount) > subtotal) {
        return NextResponse.json(
          { valid: false, error: `Minimum order amount is ₹${Number(coupon.minimum_amount)}.` },
          { status: 400 }
        );
      }
      const percent = coupon.discount_type === 'percentage' ? Number(coupon.discount_value) : null;
      const flat = coupon.discount_type === 'flat' ? Number(coupon.discount_value) : null;
      const discountAmount =
        percent !== null
          ? Math.round((subtotal * percent) / 100)
          : flat !== null
            ? Math.min(flat, subtotal)
            : 0;

      return NextResponse.json({
        valid: true,
        code: coupon.code,
        percent: percent ?? Math.round(subtotal > 0 ? (discountAmount / subtotal) * 100 : 0),
        discountAmount,
      });
    }

    const all = await client.query(
      `SELECT code, discount_type, discount_value, minimum_amount
       FROM coupons
       WHERE status = 'active'
         AND (expiry_date IS NULL OR expiry_date > NOW())
       ORDER BY discount_value DESC`
    );
    return NextResponse.json(all.rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
