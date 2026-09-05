import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { applyRateLimitAsync, clientIp, getAuthenticatedUser } from '@/lib/serverSecurity';
import { validateCouponForCart } from '@/lib/coupons';
import { priceCartItems } from '@/lib/orderPricing';

export async function POST(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) {
    return NextResponse.json({ error: 'Please login to apply a coupon.' }, { status: 401 });
  }

  const ip = clientIp(request);
  const { allowed } = await applyRateLimitAsync(`coupon-${session.userId}-${ip}`, 20, 60000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many coupon attempts. Please wait 1 minute.' }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const rawCode = String(body.code || '').trim();
    let cartQty = Number(body.cartQty || 0);
    let subtotal = Number(body.subtotal || 0);

    // Prefer DB-priced items so the preview matches Razorpay / order totals
    if (Array.isArray(body.items) && body.items.length > 0) {
      const priced = await priceCartItems(queryDb, body.items);
      if (!priced.ok) {
        return NextResponse.json({ error: priced.error }, { status: priced.status });
      }
      cartQty = priced.verifiedItems.reduce((s, i) => s + Number(i.qty || 0), 0);
      subtotal = priced.total;
    }

    const applied = await validateCouponForCart(queryDb, {
      code: rawCode,
      cartQty,
      subtotal,
      userId: session.userId,
    });

    if (!applied.ok) {
      return NextResponse.json({ error: applied.error }, { status: applied.status });
    }

    return NextResponse.json({
      ok: true,
      valid: true,
      code: applied.coupon.code,
      discountAmount: applied.coupon.discount,
      subtotal,
      message: `✓ Coupon applied: save ₹${applied.coupon.discount}`,
    });
  } catch (err: any) {
    console.error('Coupon validation error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to validate coupon' }, { status: 500 });
  }
}
