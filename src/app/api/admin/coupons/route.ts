import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required to view coupons');
  }

  try {
    const result = await queryDb(
      `SELECT 
        id, 
        code, 
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

    const coupons = (result?.rows || []).map((row: any) => ({
      id: row.id,
      code: row.code,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      minCartQty: Number(row.min_cart_qty || 4),
      minOrderAmount: Number(row.min_order_amount || 0),
      maxDiscountAmount: row.max_discount_amount != null ? Number(row.max_discount_amount) : null,
      maxUses: Number(row.max_uses || 10000),
      usedCount: Number(row.used_count || 0),
      isActive: Boolean(row.is_active),
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    }));

    return NextResponse.json({ coupons });
  } catch (error: any) {
    console.error('[admin/coupons] GET error:', error);
    return NextResponse.json({ error: error.message || 'Failed to load coupons' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required to create coupons');
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
      maxUses = 1000,
      expiresAt,
      isActive = true,
    } = body;

    const cleanCode = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!cleanCode || cleanCode.length < 3) {
      return NextResponse.json({ error: 'Coupon code must be at least 3 alphanumeric characters.' }, { status: 400 });
    }

    const val = Number(discountValue);
    if (!val || isNaN(val) || val <= 0) {
      return NextResponse.json({ error: 'Valid discount value is required.' }, { status: 400 });
    }

    if (discountType === 'percentage' && val > 90) {
      return NextResponse.json({ error: 'Percentage discount cannot exceed 90%.' }, { status: 400 });
    }

    const id = `cpn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const parsedExpiresAt = expiresAt ? new Date(expiresAt).toISOString() : null;

    const result = await queryDb(
      `INSERT INTO coupons (
        id, code, discount_type, discount_value, min_cart_qty, 
        min_order_amount, max_discount_amount, max_uses, is_active, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        id,
        cleanCode,
        discountType,
        val,
        Number(minCartQty) || 4,
        Number(minOrderAmount) || 0,
        maxDiscountAmount ? Number(maxDiscountAmount) : null,
        Number(maxUses) || 1000,
        Boolean(isActive),
        parsedExpiresAt,
      ]
    );

    const row = result?.rows?.[0];
    return NextResponse.json({
      success: true,
      coupon: {
        id: row.id,
        code: row.code,
        discountType: row.discount_type,
        discountValue: Number(row.discount_value),
        minCartQty: Number(row.min_cart_qty),
        minOrderAmount: Number(row.min_order_amount),
        maxDiscountAmount: row.max_discount_amount ? Number(row.max_discount_amount) : null,
        maxUses: Number(row.max_uses),
        usedCount: Number(row.used_count || 0),
        isActive: Boolean(row.is_active),
        expiresAt: row.expires_at,
      },
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
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required to update coupons');
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { id, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: 'Coupon ID is required.' }, { status: 400 });
    }

    const result = await queryDb(
      `UPDATE coupons 
       SET is_active = $1 
       WHERE id = $2 
       RETURNING *`,
      [Boolean(isActive), id]
    );

    if (!result || result.rowCount === 0) {
      return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, coupon: result.rows[0] });
  } catch (error: any) {
    console.error('[admin/coupons] PATCH error:', error);
    return NextResponse.json({ error: error.message || 'Failed to update coupon' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required to delete coupons');
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Coupon ID is required.' }, { status: 400 });
    }

    const result = await queryDb(`DELETE FROM coupons WHERE id = $1 RETURNING id`, [id]);

    if (!result || result.rowCount === 0) {
      return NextResponse.json({ error: 'Coupon not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (error: any) {
    console.error('[admin/coupons] DELETE error:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete coupon' }, { status: 500 });
  }
}
