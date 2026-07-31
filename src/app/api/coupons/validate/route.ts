import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { applyRateLimitAsync, clientIp, getAuthenticatedUser } from '@/lib/serverSecurity';
import { priceCartItems } from '@/lib/orderPricing';
import {
  checkCouponEligibility,
  checkCouponCartRestrictions,
  checkUserCouponLimit,
  computeDiscountAmount,
  ensureCouponSchema,
  fetchCouponByCode,
  mapPublicCoupon,
  normalizeCouponCode,
} from '@/lib/coupons';

/** Validate coupon against cart — used at checkout before placing order */
export async function POST(request: NextRequest) {
  const rl = await applyRateLimitAsync(`coupon:${clientIp(request)}`, 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ valid: false, error: 'Too many attempts. Please wait.' }, { status: 429 });
  }

  let client: any = null;
  try {
    const body = await request.json();
    const code = normalizeCouponCode(body.code);
    const items = Array.isArray(body.items) ? body.items : [];
    const freeBookId = body.freeBookId ? String(body.freeBookId) : null;

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Enter a coupon code.' }, { status: 400 });
    }

    client = await getDbClient();
    await ensureCouponSchema(client);

    const coupon = await fetchCouponByCode(client, code);
    if (!coupon) {
      return NextResponse.json({ valid: false, error: 'Invalid coupon code.' }, { status: 404 });
    }

    const priced = await priceCartItems(client, items);
    if (!priced.ok) {
      return NextResponse.json({ valid: false, error: priced.error }, { status: priced.status });
    }

    const cartQty = priced.verifiedItems.reduce((s, i) => s + Number(i.qty || 0), 0);
    const cartBookIds = priced.verifiedItems.map((i) => String(i.id));

    const eligible = checkCouponEligibility(coupon, priced.total, cartQty);
    if (!eligible.ok) {
      return NextResponse.json({ valid: false, error: eligible.message });
    }

    const cartRules = await checkCouponCartRestrictions(client, coupon, cartBookIds);
    if (!cartRules.ok) {
      return NextResponse.json({ valid: false, error: cartRules.message });
    }

    const session = await getAuthenticatedUser(request);
    if (session?.userId) {
      const userLimit = await checkUserCouponLimit(client, coupon, session.userId);
      if (!userLimit.ok) {
        return NextResponse.json({ valid: false, error: userLimit.message });
      }
    }

    let discountAmount = 0;
    let freeBook: any = null;

    if (coupon.offer_type === 'free_book') {
      if (!freeBookId) {
        return NextResponse.json({
          valid: true,
          needsFreeBook: true,
          coupon: mapPublicCoupon(coupon),
          subtotal: priced.total,
          discountAmount: 0,
          total: priced.total,
          message: 'Select a free book to complete this offer.',
        });
      }

      const bookRes = await client.query(
        `SELECT id, title, price, discount_price, stock, status FROM books WHERE id = $1 LIMIT 1`,
        [freeBookId]
      );
      if (!bookRes.rows.length) {
        return NextResponse.json({ valid: false, error: 'Selected book not found.' }, { status: 404 });
      }
      const book = bookRes.rows[0];
      const stock = Number(book.stock ?? 0);
      if (book.status === 'out_of_stock' || stock <= 0) {
        return NextResponse.json({ valid: false, error: `"${book.title}" is out of stock.` });
      }

      const mrp = Number(book.price) || 0;
      const rawSale =
        book.discount_price == null || book.discount_price === '' ? NaN : Number(book.discount_price);
      const unitPrice =
        Number.isFinite(rawSale) && rawSale > 0 && rawSale < mrp ? rawSale : mrp;

      const cap = Number(coupon.discount_value) || 0;
      if (cap > 0 && unitPrice > cap) {
        return NextResponse.json({
          valid: false,
          error: `Free book must be ₹${cap} or less for this coupon.`,
        });
      }

      freeBook = { id: book.id, title: book.title, value: unitPrice };
      discountAmount = unitPrice;
    } else {
      discountAmount = computeDiscountAmount(coupon, priced.total);
    }

    const total = Math.max(0, priced.total - (coupon.offer_type === 'free_book' ? 0 : discountAmount));

    return NextResponse.json({
      valid: true,
      needsFreeBook: false,
      coupon: mapPublicCoupon(coupon),
      subtotal: priced.total,
      discountAmount,
      total,
      freeBook,
    });
  } catch (err: any) {
    console.error('[coupons validate]', err?.message || err);
    return NextResponse.json({ valid: false, error: 'Could not validate coupon.' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
