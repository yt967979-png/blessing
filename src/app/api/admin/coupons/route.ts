import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';
import { mapAdminCoupon } from '@/lib/coupons';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    return forbiddenResponse(auth.error || 'Admin privileges required to view coupons');
  }

  try {
    const result = await queryDb(
      `SELECT 
        id, 
        code,
        title,
        show_on_hero,
        discount_type, 
        discount_value, 
        min_cart_qty, 
        min_order_amount, 
        max_discount_amount, 
        max_uses, 
        used_count, 
        is_active, 
        expires_at, 
        created_at
       FROM coupons
       ORDER BY created_at DESC`
    );

    const coupons = (result?.rows || []).map((row: any) => mapAdminCoupon(row));

    return NextResponse.json({ coupons });
  } catch (error: any) {
    console.error('[admin/coupons] GET error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load coupons' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    return forbiddenResponse(auth.error || 'Admin privileges required to create coupons');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      code,
      discountType = 'percentage',
      discountValue,
      minCartQty = 4,
      minOrderAmount = 0,
      maxDiscountAmount,
      maxUses = 100,
      expiresAt,
      isActive = true,
      title = '',
      showOnHero = false,
    } = body;

    const cleanCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode || cleanCode.length < 3) {
      return NextResponse.json({ error: 'Coupon code must be at least 3 alphanumeric characters.' }, { status: 400 });
    }

    const type = String(discountType || 'percentage').toLowerCase();
    if (type !== 'percentage' && type !== 'flat') {
      return NextResponse.json({ error: 'Discount type must be percentage or flat.' }, { status: 400 });
    }

    const val = Number(discountValue);
    if (!val || isNaN(val) || val <= 0) {
      return NextResponse.json({ error: 'Valid discount value is required.' }, { status: 400 });
    }

    if (type === 'percentage' && val > 90) {
      return NextResponse.json({ error: 'Percentage discount cannot exceed 90%.' }, { status: 400 });
    }

    const id = `cpn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const parsedExpiresAt = expiresAt ? new Date(expiresAt).toISOString() : null;

    const offerTitle = String(title || '')
      .replace(/<[^>]*>/g, '')
      .trim()
      .slice(0, 200);
    const pinHero = Boolean(showOnHero);

    if (pinHero) {
      await queryDb(`UPDATE coupons SET show_on_hero = FALSE WHERE COALESCE(show_on_hero, FALSE) = TRUE`);
    }

    const result = await queryDb(
      `INSERT INTO coupons (
        id, code, discount_type, discount_value, min_cart_qty, 
        min_order_amount, max_discount_amount, max_uses, is_active, expires_at, title, show_on_hero
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        id,
        cleanCode,
        type,
        val,
        Number(minCartQty) || 4,
        Number(minOrderAmount) || 0,
        maxDiscountAmount ? Number(maxDiscountAmount) : null,
        Number(maxUses) || 100,
        Boolean(isActive),
        parsedExpiresAt,
        offerTitle || null,
        pinHero,
      ]
    );

    const row = result?.rows?.[0];
    try {
      const { notifyCouponsChanged } = await import('@/app/api/stock/stream/route');
      void notifyCouponsChanged();
    } catch (_) {}
    return NextResponse.json({
      success: true,
      coupon: mapAdminCoupon(row),
    });
  } catch (error: any) {
    console.error('[admin/coupons] POST error:', error);
    if (error.code === '23505' || String(error.message).includes('unique')) {
      return NextResponse.json({ error: 'A coupon with this code already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to create coupon' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    return forbiddenResponse(auth.error || 'Admin privileges required to update coupons');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      id,
      code,
      title,
      discountType,
      discountValue,
      minCartQty,
      minOrderAmount,
      maxDiscountAmount,
      maxUses,
      expiresAt,
      isActive,
      showOnHero,
    } = body;

    if (!id) {
      return NextResponse.json({ error: 'Coupon ID is required.' }, { status: 400 });
    }

    const existingResult = await queryDb(`SELECT * FROM coupons WHERE id = $1`, [id]);
    if (!existingResult || (existingResult.rowCount ?? 0) === 0) {
      return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    }
    const current = existingResult.rows[0];

    const sets: string[] = [];
    const params: any[] = [];

    if (code !== undefined) {
      const cleanCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      if (!cleanCode || cleanCode.length < 3) {
        return NextResponse.json({ error: 'Coupon code must be at least 3 alphanumeric characters.' }, { status: 400 });
      }
      const duplicateCode = await queryDb(
        `SELECT id FROM coupons WHERE code = $1 AND id <> $2 LIMIT 1`,
        [cleanCode, id]
      );
      if (duplicateCode && (duplicateCode.rowCount ?? 0) > 0) {
        return NextResponse.json({ error: 'A coupon with this code already exists.' }, { status: 409 });
      }
      params.push(cleanCode);
      sets.push(`code = $${params.length}`);
    }

    if (title !== undefined) {
      const offerTitle = String(title || '')
        .replace(/<[^>]*>/g, '')
        .trim()
        .slice(0, 200);
      params.push(offerTitle || null);
      sets.push(`title = $${params.length}`);
    }

    let effectiveType = current.discount_type;
    if (discountType !== undefined) {
      const type = String(discountType || 'percentage').toLowerCase();
      if (type !== 'percentage' && type !== 'flat') {
        return NextResponse.json({ error: 'Discount type must be percentage or flat.' }, { status: 400 });
      }
      effectiveType = type;
      params.push(type);
      sets.push(`discount_type = $${params.length}`);
    }

    if (discountValue !== undefined) {
      const val = Number(discountValue);
      if (!val || isNaN(val) || val <= 0) {
        return NextResponse.json({ error: 'Valid discount value is required.' }, { status: 400 });
      }
      if (effectiveType === 'percentage' && val > 90) {
        return NextResponse.json({ error: 'Percentage discount cannot exceed 90%.' }, { status: 400 });
      }
      params.push(val);
      sets.push(`discount_value = $${params.length}`);
    }

    if (minCartQty !== undefined) {
      const qty = Math.max(1, Number(minCartQty) || 4);
      params.push(qty);
      sets.push(`min_cart_qty = $${params.length}`);
    }

    if (minOrderAmount !== undefined) {
      const amount = Math.max(0, Number(minOrderAmount) || 0);
      params.push(amount);
      sets.push(`min_order_amount = $${params.length}`);
    }

    if (maxDiscountAmount !== undefined) {
      const maxDisc = maxDiscountAmount ? Number(maxDiscountAmount) : null;
      params.push(maxDisc);
      sets.push(`max_discount_amount = $${params.length}`);
    }

    if (maxUses !== undefined) {
      const uses = Math.max(1, Number(maxUses) || 100);
      params.push(uses);
      sets.push(`max_uses = $${params.length}`);
    }

    if (expiresAt !== undefined) {
      const parsedExpiresAt = expiresAt ? new Date(expiresAt).toISOString() : null;
      params.push(parsedExpiresAt);
      sets.push(`expires_at = $${params.length}`);
    }

    if (isActive !== undefined) {
      params.push(Boolean(isActive));
      sets.push(`is_active = $${params.length}`);
    }

    if (showOnHero !== undefined) {
      const pinHero = Boolean(showOnHero);
      if (pinHero) {
        await queryDb(`UPDATE coupons SET show_on_hero = FALSE WHERE id <> $1`, [id]);
      }
      params.push(pinHero);
      sets.push(`show_on_hero = $${params.length}`);
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
    }

    params.push(id);
    const result = await queryDb(
      `UPDATE coupons SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (!result || (result.rowCount ?? 0) === 0) {
      return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    }

    try {
      const { notifyCouponsChanged } = await import('@/app/api/stock/stream/route');
      void notifyCouponsChanged();
    } catch (_) {}
    return NextResponse.json({ success: true, coupon: mapAdminCoupon(result.rows[0]) });
  } catch (error: any) {
    console.error('[admin/coupons] PATCH error:', error);
    if (error.code === '23505' || String(error.message).includes('unique')) {
      return NextResponse.json({ error: 'A coupon with this code already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message || 'Failed to update coupon' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    return forbiddenResponse(auth.error || 'Admin privileges required to delete coupons');
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Coupon ID is required.' }, { status: 400 });
    }

    // Cascade cleanups: purge past redemption locks and nullify foreign keys in orders to avoid FK violation
    await queryDb(`DELETE FROM coupon_redemptions WHERE coupon_id = $1`, [id]).catch(() => {});
    await queryDb(`UPDATE orders SET coupon_id = NULL WHERE coupon_id = $1`, [id]).catch(() => {});

    const result = await queryDb(`DELETE FROM coupons WHERE id = $1 RETURNING id`, [id]);

    if (!result || (result.rowCount ?? 0) === 0) {
      return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    }

    try {
      const { notifyCouponsChanged } = await import('@/app/api/stock/stream/route');
      void notifyCouponsChanged();
    } catch (_) {}
    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error('[admin/coupons] DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete coupon' }, { status: 500 });
  }
}
