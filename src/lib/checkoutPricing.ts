import { queryDb } from '@/lib/db';
import { priceCartItems } from '@/lib/orderPricing';

export type CheckoutPricingResult =
  | {
      ok: true;
      subtotal: number;
      discountAmount: number;
      shippingFee: number;
      totalAmount: number;
      verifiedItems: any[];
      appliedCoupon?: {
        code: string;
        discount: number;
      } | null;
    }
  | { ok: false; error: string; status: number };

async function execQuery(client: any, sql: string, params?: any[]): Promise<any> {
  if (typeof client === 'function') {
    return client(sql, params);
  }
  if (client && typeof client.query === 'function') {
    return client.query(sql, params);
  }
  return queryDb(sql, params);
}

/** Server-side cart + minimum quantity check + shipping fee + coupon validation. */
export async function priceCheckoutOrder(
  client: any,
  opts: {
    items: any[];
    userId: string;
    couponCode?: string | null;
  }
): Promise<CheckoutPricingResult> {
  void opts.userId;

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
  let appliedCoupon: { code: string; discount: number } | null = null;

  if (opts.couponCode && String(opts.couponCode).trim()) {
    const rawCode = String(opts.couponCode).trim().toUpperCase();
    const cRes = await execQuery(
      client,
      `SELECT id, code, discount_type, discount_value, min_cart_qty, min_order_amount,
              max_discount_amount, max_uses, used_count, is_active, expires_at
       FROM coupons
       WHERE UPPER(code) = $1
       LIMIT 1`,
      [rawCode]
    );

    if (cRes.rows && cRes.rows.length > 0) {
      const c = cRes.rows[0];
      const active = c.is_active && (!c.expires_at || new Date(c.expires_at) >= new Date());
      const meetsQty = cartQty >= (c.min_cart_qty || 4);
      const meetsMin = calculatedSubtotal >= (Number(c.min_order_amount) || 0);

      if (active && meetsQty && meetsMin) {
        if (c.discount_type === 'percentage') {
          discountAmount = Math.round((calculatedSubtotal * Number(c.discount_value)) / 100);
          if (c.max_discount_amount && discountAmount > Number(c.max_discount_amount)) {
            discountAmount = Number(c.max_discount_amount);
          }
        } else {
          discountAmount = Math.min(calculatedSubtotal, Number(c.discount_value));
        }
        appliedCoupon = { code: c.code, discount: discountAmount };
      }
    }
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
