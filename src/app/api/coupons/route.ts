import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code')?.trim().toUpperCase();
  const subtotal = Number(searchParams.get('subtotal') || 0);
  const adminAll = searchParams.get('admin') === '1';

  const client = await getDbClient();
  try {
    if (adminAll) {
      const auth = await verifyAdminRequest(request);
      if (!auth.isAdmin) return forbiddenResponse(auth.error);
      const all = await client.query(
        `SELECT id, code, discount_type, discount_value, minimum_amount, expiry_date, usage_limit, status
         FROM coupons ORDER BY code ASC`
      );
      return NextResponse.json(all.rows);
    }

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

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const body = await request.json();
  const code = String(body.code || '').trim().toUpperCase();
  const discountType = body.discount_type === 'flat' ? 'flat' : 'percentage';
  const discountValue = Number(body.discount_value || 0);
  const minimumAmount = Number(body.minimum_amount || 0);

  if (!code || discountValue <= 0) {
    return NextResponse.json({ error: 'Code and discount value are required.' }, { status: 400 });
  }

  const client = await getDbClient();
  try {
    const id = `cpn-${Date.now()}`;
    const res = await client.query(
      `INSERT INTO coupons (id, code, discount_type, discount_value, minimum_amount, status)
       VALUES ($1, $2, $3, $4, $5, 'active')
       ON CONFLICT (code) DO UPDATE SET
         discount_type = EXCLUDED.discount_type,
         discount_value = EXCLUDED.discount_value,
         minimum_amount = EXCLUDED.minimum_amount,
         status = 'active'
       RETURNING *`,
      [id, code, discountType, discountValue, minimumAmount]
    );
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const body = await request.json();
  const id = body.id;
  if (!id) return NextResponse.json({ error: 'Coupon id required' }, { status: 400 });

  const client = await getDbClient();
  try {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (body.status !== undefined) { fields.push(`status = $${idx++}`); values.push(body.status); }
    if (body.discount_value !== undefined) { fields.push(`discount_value = $${idx++}`); values.push(Number(body.discount_value)); }
    if (body.minimum_amount !== undefined) { fields.push(`minimum_amount = $${idx++}`); values.push(Number(body.minimum_amount)); }
    if (body.discount_type !== undefined) { fields.push(`discount_type = $${idx++}`); values.push(body.discount_type); }
    if (fields.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    values.push(id);
    const res = await client.query(`UPDATE coupons SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    return NextResponse.json(res.rows[0] || { success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await client.end();
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const client = await getDbClient();
  try {
    await client.query(`DELETE FROM coupons WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    await client.end();
  }
}
