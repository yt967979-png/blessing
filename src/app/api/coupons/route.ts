import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';
import {
  ensureCouponSchema,
  isCouponExpired,
  mapPublicCoupon,
  normalizeCouponCode,
  type CouponDiscountType,
  type CouponOfferType,
  type CouponConditionMode,
} from '@/lib/coupons';

function mapAdminCoupon(row: any) {
  return {
    id: row.id,
    code: row.code,
    title: row.title || '',
    description: row.description || '',
    discountType: row.discount_type || 'percentage',
    discountValue: Number(row.discount_value) || 0,
    minimumAmount: Number(row.minimum_amount) || 0,
    minimumQuantity: Number(row.minimum_quantity) || 0,
    offerType: row.offer_type || 'discount',
    conditionMode: row.condition_mode || 'any',
    expiryDate: row.expiry_date ? new Date(row.expiry_date).toISOString() : null,
    usageLimit: Number(row.usage_limit) || 100,
    usedCount: Number(row.used_count) || 0,
    showInHero: row.show_in_hero !== false,
    status: row.status || 'active',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

/** Public: hero coupons. Admin: full list with ?admin=1 */
export async function GET(request: NextRequest) {
  let client: any = null;
  try {
    client = await getDbClient();
    await ensureCouponSchema(client);

    const { searchParams } = new URL(request.url);
    const isAdmin = searchParams.get('admin') === '1';

    if (isAdmin) {
      const admin = await verifyAdminRequest(request);
      if (!admin) return forbiddenResponse();

      const res = await client.query(`SELECT * FROM coupons ORDER BY created_at DESC NULLS LAST, code ASC`);
      return NextResponse.json(res.rows.map(mapAdminCoupon));
    }

    const res = await client.query(
      `SELECT * FROM coupons
       WHERE status = 'active'
         AND show_in_hero = true
         AND (expiry_date IS NULL OR expiry_date > NOW())
         AND COALESCE(used_count, 0) < COALESCE(usage_limit, 100)
       ORDER BY expiry_date ASC NULLS LAST, code ASC`
    );

    return NextResponse.json(
      res.rows.map(mapPublicCoupon),
      { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120' } }
    );
  } catch (err: any) {
    console.error('[coupons GET]', err?.message || err);
    return NextResponse.json({ error: 'Could not load coupons' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

/** Admin: create coupon */
export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return forbiddenResponse();

  let client: any = null;
  try {
    const body = await request.json();
    const code = normalizeCouponCode(body.code);
    if (!code || code.length < 3) {
      return NextResponse.json({ error: 'Coupon code must be at least 3 characters.' }, { status: 400 });
    }

    const offerType = (body.offerType || 'discount') as CouponOfferType;
    const discountType = (body.discountType || 'percentage') as CouponDiscountType;
    const discountValue = Math.max(0, Number(body.discountValue) || 0);
    if (offerType === 'discount' && discountValue <= 0) {
      return NextResponse.json({ error: 'Discount value must be greater than 0.' }, { status: 400 });
    }
    if (offerType === 'discount' && discountType === 'percentage' && discountValue > 100) {
      return NextResponse.json({ error: 'Percentage discount cannot exceed 100%.' }, { status: 400 });
    }

    client = await getDbClient();
    await ensureCouponSchema(client);

    const id = `cpn-${Date.now()}`;
    const expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;
    if (expiryDate && Number.isNaN(expiryDate.getTime())) {
      return NextResponse.json({ error: 'Invalid expiry date.' }, { status: 400 });
    }
    if (expiryDate && isCouponExpired(expiryDate)) {
      return NextResponse.json({ error: 'Expiry date must be in the future.' }, { status: 400 });
    }

    await client.query(
      `INSERT INTO coupons (
        id, code, title, description, discount_type, discount_value,
        minimum_amount, minimum_quantity, offer_type, condition_mode,
        expiry_date, usage_limit, used_count, show_in_hero, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14)`,
      [
        id,
        code,
        String(body.title || code).slice(0, 255),
        String(body.description || '').slice(0, 2000),
        discountType,
        discountValue,
        Math.max(0, Number(body.minimumAmount) || 0),
        Math.max(0, Number(body.minimumQuantity) || 0),
        offerType,
        (body.conditionMode || 'any') as CouponConditionMode,
        expiryDate,
        Math.max(1, Number(body.usageLimit) || 100),
        body.showInHero !== false,
        body.status === 'inactive' ? 'inactive' : 'active',
      ]
    );

    const created = await client.query(`SELECT * FROM coupons WHERE id = $1`, [id]);
    return NextResponse.json(mapAdminCoupon(created.rows[0]), { status: 201 });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Coupon code already exists.' }, { status: 409 });
    }
    console.error('[coupons POST]', err?.message || err);
    return NextResponse.json({ error: 'Could not create coupon' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

/** Admin: update coupon */
export async function PATCH(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return forbiddenResponse();

  let client: any = null;
  try {
    const body = await request.json();
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'Coupon id required.' }, { status: 400 });

    client = await getDbClient();
    await ensureCouponSchema(client);

    const existing = await client.query(`SELECT id FROM coupons WHERE id = $1`, [id]);
    if (!existing.rows.length) {
      return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    }

    const expiryDate =
      body.expiryDate === null || body.expiryDate === ''
        ? null
        : body.expiryDate
          ? new Date(body.expiryDate)
          : undefined;

    await client.query(
      `UPDATE coupons SET
        code = COALESCE($2, code),
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        discount_type = COALESCE($5, discount_type),
        discount_value = COALESCE($6, discount_value),
        minimum_amount = COALESCE($7, minimum_amount),
        minimum_quantity = COALESCE($8, minimum_quantity),
        offer_type = COALESCE($9, offer_type),
        condition_mode = COALESCE($10, condition_mode),
        expiry_date = CASE WHEN $11::text = 'KEEP' THEN expiry_date ELSE $12 END,
        usage_limit = COALESCE($13, usage_limit),
        show_in_hero = COALESCE($14, show_in_hero),
        status = COALESCE($15, status)
       WHERE id = $1`,
      [
        id,
        body.code ? normalizeCouponCode(body.code) : null,
        body.title != null ? String(body.title).slice(0, 255) : null,
        body.description != null ? String(body.description).slice(0, 2000) : null,
        body.discountType || null,
        body.discountValue != null ? Math.max(0, Number(body.discountValue)) : null,
        body.minimumAmount != null ? Math.max(0, Number(body.minimumAmount)) : null,
        body.minimumQuantity != null ? Math.max(0, Number(body.minimumQuantity)) : null,
        body.offerType || null,
        body.conditionMode || null,
        expiryDate === undefined ? 'KEEP' : 'SET',
        expiryDate === undefined ? null : expiryDate,
        body.usageLimit != null ? Math.max(1, Number(body.usageLimit)) : null,
        body.showInHero != null ? Boolean(body.showInHero) : null,
        body.status || null,
      ]
    );

    const updated = await client.query(`SELECT * FROM coupons WHERE id = $1`, [id]);
    return NextResponse.json(mapAdminCoupon(updated.rows[0]));
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Coupon code already exists.' }, { status: 409 });
    }
    console.error('[coupons PATCH]', err?.message || err);
    return NextResponse.json({ error: 'Could not update coupon' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

/** Admin: delete coupon */
export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Coupon id required.' }, { status: 400 });

  let client: any = null;
  try {
    client = await getDbClient();
    await client.query(`DELETE FROM coupons WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[coupons DELETE]', err?.message || err);
    return NextResponse.json({ error: 'Could not delete coupon' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
