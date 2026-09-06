import { priceCartItems } from '@/lib/orderPricing';
import { validateCouponForCart, type AppliedCoupon } from '@/lib/coupons';
import { MIN_BOOKS_PER_ORDER, deliveryFeeForQty } from '@/lib/deliveryRules';

export { MIN_BOOKS_PER_ORDER, FREE_DELIVERY_AT_QTY, STANDARD_DELIVERY_FEE, deliveryFeeForQty } from '@/lib/deliveryRules';

export type CheckoutPricingResult =
  | {
      ok: true;
      subtotal: number;
      discountAmount: number;
      shippingFee: number;
      totalAmount: number;
      verifiedItems: any[];
      appliedCoupon?: AppliedCoupon | null;
    }
  | { ok: false; error: string; status: number };

/** Server-side cart + minimum quantity + shipping + coupon (usage not incremented here). */
export async function priceCheckoutOrder(
  client: any,
  opts: {
    items: any[];
    userId: string;
    couponCode?: string | null;
  }
): Promise<CheckoutPricingResult> {
  const priced = await priceCartItems(client, opts.items);
  if (!priced.ok) return priced;

  const { total: calculatedSubtotal, verifiedItems } = priced;

  const cartQty = verifiedItems.reduce((s, i) => s + Number(i.qty || 0), 0);
  if (cartQty < MIN_BOOKS_PER_ORDER) {
    return {
      ok: false,
      error: `Minimum order quantity is ${MIN_BOOKS_PER_ORDER} books. You currently have ${cartQty} book(s) in your cart.`,
      status: 400,
    };
  }

  const shippingFee = deliveryFeeForQty(cartQty);
  let discountAmount = 0;
  let appliedCoupon: AppliedCoupon | null = null;

  if (opts.couponCode && String(opts.couponCode).trim()) {
    const applied = await validateCouponForCart(client, {
      code: opts.couponCode,
      cartQty,
      subtotal: calculatedSubtotal,
      userId: opts.userId,
    });
    if (!applied.ok) return applied;
    appliedCoupon = applied.coupon;
    discountAmount = applied.coupon.discount;
  }

  const finalTotal = Math.max(0, calculatedSubtotal + shippingFee - discountAmount);

  return {
    ok: true,
    subtotal: calculatedSubtotal,
    discountAmount,
    shippingFee,
    totalAmount: finalTotal,
    verifiedItems,
    appliedCoupon,
  };
}
