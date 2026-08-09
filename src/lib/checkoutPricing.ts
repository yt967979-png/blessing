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

/** Server-side cart + minimum quantity check + shipping fee. No coupons. */
export async function priceCheckoutOrder(
  client: any,
  opts: {
    items: any[];
    userId: string;
  }
): Promise<CheckoutPricingResult> {
  void opts.userId;
  void execQuery;

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
  const finalTotal = Math.max(0, calculatedSubtotal + shippingFee);

  return {
    ok: true,
    subtotal: calculatedSubtotal,
    discountAmount: 0,
    shippingFee,
    totalAmount: finalTotal,
    verifiedItems,
  };
}
