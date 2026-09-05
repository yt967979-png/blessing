import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';

export async function POST(request: Request) {
  const ip = clientIp(request);
  const { allowed } = await applyRateLimitAsync(`coupon-${ip}`, 20, 60000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many coupon attempts. Please wait 1 minute.' }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const rawCode = String(body.code || '').trim().toUpperCase();
    const cartQty = Number(body.cartQty || 0);
    const subtotal = Number(body.subtotal || 0);

    if (!rawCode) {
      return NextResponse.json({ error: 'Please enter a coupon code.' }, { status: 400 });
    }

    const res = await queryDb(
      `SELECT id, code, discount_type, discount_value, min_cart_qty, min_order_amount,
              max_discount_amount, max_uses, used_count, is_active, expires_at
       FROM coupons
       WHERE UPPER(code) = $1
       LIMIT 1`,
      [rawCode]
    );

    if (!res.rows.length) {
      return NextResponse.json({ error: 'Invalid coupon code. Please check for typos.' }, { status: 404 });
    }

    const coupon = res.rows[0];

    if (!coupon.is_active) {
      return NextResponse.json({ error: 'This coupon code is no longer active.' }, { status: 400 });
    }

    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This coupon has expired.' }, { status: 400 });
    }

    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
      return NextResponse.json({ error: 'This coupon has reached its maximum redemptions.' }, { status: 400 });
    }

    if (cartQty < (coupon.min_cart_qty || 4)) {
      return NextResponse.json(
        {
          error: `Coupon "${coupon.code}" requires at least ${coupon.min_cart_qty || 4} books in cart. (Current: ${cartQty})`,
        },
        { status: 400 }
      );
    }

    if (subtotal < (Number(coupon.min_order_amount) || 0)) {
      return NextResponse.json(
        {
          error: `Coupon "${coupon.code}" requires a minimum cart value of ₹${coupon.min_order_amount}.`,
        },
        { status: 400 }
      );
    }

    let discount = 0;
    if (coupon.discount_type === 'percentage') {
      discount = Math.round((subtotal * Number(coupon.discount_value)) / 100);
      if (coupon.max_discount_amount && discount > Number(coupon.max_discount_amount)) {
        discount = Number(coupon.max_discount_amount);
      }
    } else {
      discount = Math.min(subtotal, Number(coupon.discount_value));
    }

    return NextResponse.json({
      ok: true,
      valid: true,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: Number(coupon.discount_value),
      discountAmount: discount,
      message:
        coupon.discount_type === 'percentage'
          ? `✓ Coupon applied: ${coupon.discount_value}% OFF (Save ₹${discount})`
          : `✓ Coupon applied: Flat ₹${discount} OFF`,
    });
  } catch (err: any) {
    console.error('Coupon validation error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to validate coupon' }, { status: 500 });
  }
}
