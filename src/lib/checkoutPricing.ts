import {
  checkCouponCartRestrictions,
  checkCouponEligibility,
  checkUserCouponLimit,
  computeDiscountAmount,
  fetchCouponByCode,
  normalizeCouponCode,
  type CouponRow,
} from '@/lib/coupons';
import { priceCartItems } from '@/lib/orderPricing';

export type CheckoutPricingResult =
  | {
      ok: true;
      subtotal: number;
      discountAmount: number;
      totalAmount: number;
      verifiedItems: any[];
      appliedCouponId: string | null;
      appliedCouponCode: string | null;
      coupon: CouponRow | null;
    }
  | { ok: false; error: string; status: number };

/** Server-side cart + optional coupon total (shared by Razorpay + order create). */
export async function priceCheckoutOrder(
  client: any,
  opts: {
    items: any[];
    userId: string;
    couponCode?: string | null;
    freeBookId?: string | null;
    lockCoupon?: boolean;
  }
): Promise<CheckoutPricingResult> {
  const priced = await priceCartItems(client, opts.items);
  if (!priced.ok) return priced;

  let { total: totalAmount, verifiedItems } = priced;
  const calculatedSubtotal = totalAmount;
  let discountAmount = 0;
  let appliedCouponId: string | null = null;
  let appliedCouponCode: string | null = null;
  let coupon: CouponRow | null = null;

  const normalizedCoupon = opts.couponCode ? normalizeCouponCode(String(opts.couponCode)) : '';
  if (!normalizedCoupon) {
    return {
      ok: true,
      subtotal: calculatedSubtotal,
      discountAmount: 0,
      totalAmount,
      verifiedItems,
      appliedCouponId: null,
      appliedCouponCode: null,
      coupon: null,
    };
  }

  coupon = await fetchCouponByCode(client, normalizedCoupon);
  if (!coupon) {
    return { ok: false, error: 'Invalid coupon code.', status: 400 };
  }

  const cartQty = verifiedItems.reduce((s, i) => s + Number(i.qty || 0), 0);
  const cartBookIds = verifiedItems.map((i) => String(i.id));

  const eligible = checkCouponEligibility(coupon, calculatedSubtotal, cartQty);
  if (!eligible.ok) return { ok: false, error: eligible.message, status: 400 };

  const cartRules = await checkCouponCartRestrictions(client, coupon, cartBookIds);
  if (!cartRules.ok) return { ok: false, error: cartRules.message, status: 400 };

  const userLimit = await checkUserCouponLimit(client, coupon, opts.userId);
  if (!userLimit.ok) return { ok: false, error: userLimit.message, status: 400 };

  if (opts.lockCoupon) {
    const lockedCoupon = await client.query(
      `SELECT used_count, usage_limit FROM coupons WHERE id = $1 FOR UPDATE`,
      [coupon.id]
    );
    if (
      Number(lockedCoupon.rows[0]?.used_count || 0) >=
      Number(lockedCoupon.rows[0]?.usage_limit || 100)
    ) {
      return { ok: false, error: 'This coupon has reached its usage limit.', status: 400 };
    }
  }

  if (coupon.offer_type === 'free_book') {
    const pickId = opts.freeBookId ? String(opts.freeBookId) : '';
    if (!pickId) {
      return { ok: false, error: 'Please select your free book for this coupon.', status: 400 };
    }

    const bookRes = await client.query(
      `SELECT id, title, price, discount_price, stock, status FROM books WHERE id = $1 LIMIT 1 FOR UPDATE`,
      [pickId]
    );
    if (!bookRes.rows.length) {
      return { ok: false, error: 'Free book not found.', status: 400 };
    }
    const book = bookRes.rows[0];
    const stock = Number(book.stock ?? 0);
    if (book.status === 'out_of_stock' || stock <= 0) {
      return { ok: false, error: `"${book.title}" is out of stock.`, status: 409 };
    }

    const mrp = Number(book.price) || 0;
    const rawSale =
      book.discount_price == null || book.discount_price === '' ? NaN : Number(book.discount_price);
    const unitPrice =
      Number.isFinite(rawSale) && rawSale > 0 && rawSale < mrp ? rawSale : mrp;
    const cap = Number(coupon.discount_value) || 0;
    if (cap > 0 && unitPrice > cap) {
      return { ok: false, error: `Free book must be ₹${cap} or less.`, status: 400 };
    }

    discountAmount = unitPrice;
    verifiedItems = [
      ...verifiedItems,
      {
        id: book.id,
        title: `(FREE) ${book.title}`,
        price: 0,
        qty: 1,
        subtotal: 0,
        isFreeGift: true,
      },
    ];
  } else {
    discountAmount = computeDiscountAmount(coupon, calculatedSubtotal);
    totalAmount = Math.max(0, calculatedSubtotal - discountAmount);
  }

  appliedCouponId = coupon.id;
  appliedCouponCode = coupon.code;

  return {
    ok: true,
    subtotal: calculatedSubtotal,
    discountAmount,
    totalAmount,
    verifiedItems,
    appliedCouponId,
    appliedCouponCode,
    coupon,
  };
}
