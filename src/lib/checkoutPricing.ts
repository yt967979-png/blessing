import { priceCartItems } from '@/lib/orderPricing';
import { validateCouponForCart, type AppliedCoupon } from '@/lib/coupons';

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
  if (cartQty < 4) {
    return {
      ok: false,
      error: `Minimum order quantity is 4 books. You currently have ${cartQty} book(s) in your cart.`,
      status: 400,
    };
  }

  const shippingFee = cartQty >= 5 ? 0 : 150;
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
