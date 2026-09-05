import { queryDb } from '@/lib/db';
import { isOrderCancelled } from '@/lib/orderStatus';

export type AppliedCoupon = {
  id: string;
  code: string;
  discount: number;
};

export type HeroCouponOffer = {
  title: string;
  code: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  maxUses: number;
  usedCount: number;
  remaining: number;
};

export function mapHeroCoupon(row: any): HeroCouponOffer | null {
  if (!row) return null;
  const maxUses = Number(row.max_uses || 0);
  const usedCount = Number(row.used_count || 0);
  const remaining = maxUses > 0 ? Math.max(0, maxUses - usedCount) : 0;
  if (maxUses > 0 && remaining <= 0) return null;
  const discountType = String(row.discount_type) === 'flat' ? 'flat' : 'percentage';
  const title = String(row.title || '').trim() || 'Special offer';
  return {
    title: title.slice(0, 200),
    code: String(row.code || '').toUpperCase(),
    discountType,
    discountValue: Number(row.discount_value || 0),
    maxUses,
    usedCount,
    remaining: maxUses > 0 ? remaining : 0,
  };
}

export function mapAdminCoupon(row: any) {
  return {
    id: row.id,
    code: row.code,
    title: row.title ? String(row.title) : '',
    showOnHero: Boolean(row.show_on_hero),
    discountType: row.discount_type,
    discountValue: Number(row.discount_value),
    minCartQty: Number(row.min_cart_qty || 4),
    minOrderAmount: Number(row.min_order_amount || 0),
    maxDiscountAmount: row.max_discount_amount != null ? Number(row.max_discount_amount) : null,
    maxUses: Number(row.max_uses || 0),
    usedCount: Number(row.used_count || 0),
    isActive: Boolean(row.is_active),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

export type CouponApplyResult =
  | { ok: true; coupon: AppliedCoupon }
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

function computeDiscount(coupon: any, subtotal: number): number {
  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = Math.round((subtotal * Number(coupon.discount_value)) / 100);
    if (coupon.max_discount_amount && discount > Number(coupon.max_discount_amount)) {
      discount = Number(coupon.max_discount_amount);
    }
  } else if (coupon.discount_type === 'flat') {
    discount = Math.min(subtotal, Number(coupon.discount_value));
  } else {
    return 0;
  }
  return Math.max(0, Math.floor(discount));
}

async function userAlreadyUsedCoupon(client: any, couponId: string, userId: string): Promise<boolean> {
  if (!userId) return false;
  const byRedemption = await execQuery(
    client,
    `SELECT 1 FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2 LIMIT 1`,
    [couponId, userId]
  ).catch(() => ({ rows: [] }));
  if (byRedemption.rows?.length) return true;

  const byOrder = await execQuery(
    client,
    `SELECT order_status FROM orders
     WHERE user_id = $1 AND coupon_id = $2
     ORDER BY created_at DESC NULLS LAST
     LIMIT 8`,
    [userId, couponId]
  ).catch(() => ({ rows: [] }));
  return (byOrder.rows || []).some((row: any) => !isOrderCancelled(row.order_status));
}

/** Validate a code against cart qty/subtotal. Does not increment usage. */
export async function validateCouponForCart(
  client: any,
  opts: { code: string; cartQty: number; subtotal: number; userId?: string | null }
): Promise<CouponApplyResult> {
  const rawCode = String(opts.code || '').trim().toUpperCase();
  if (!rawCode) {
    return { ok: false, error: 'Please enter a coupon code.', status: 400 };
  }

  const cRes = await execQuery(
    client,
    `SELECT id, code, discount_type, discount_value, min_cart_qty, min_order_amount,
            max_discount_amount, max_uses, used_count, is_active, expires_at
     FROM coupons
     WHERE UPPER(code) = $1
     LIMIT 1`,
    [rawCode]
  );

  if (!cRes.rows?.length) {
    return { ok: false, error: 'Invalid coupon code. Please check for typos.', status: 404 };
  }

  const c = cRes.rows[0];
  if (!c.is_active) {
    return { ok: false, error: 'This coupon code is no longer active.', status: 400 };
  }
  if (c.expires_at && new Date(c.expires_at) < new Date()) {
    return { ok: false, error: 'This coupon has expired.', status: 400 };
  }
  const maxUses = Number(c.max_uses || 0);
  const used = Number(c.used_count || 0);
  if (maxUses > 0 && used >= maxUses) {
    return { ok: false, error: 'This coupon has reached its maximum redemptions.', status: 400 };
  }
  if (opts.userId && (await userAlreadyUsedCoupon(client, String(c.id), String(opts.userId)))) {
    return {
      ok: false,
      error: 'You have already used this coupon. Each customer can use it once.',
      status: 400,
    };
  }
  const minQty = Number(c.min_cart_qty || 4);
  if (opts.cartQty < minQty) {
    return {
      ok: false,
      error: `Coupon "${c.code}" requires at least ${minQty} books in cart. (Current: ${opts.cartQty})`,
      status: 400,
    };
  }
  const minOrder = Number(c.min_order_amount || 0);
  if (opts.subtotal < minOrder) {
    return {
      ok: false,
      error: `Coupon "${c.code}" requires a minimum cart value of ₹${minOrder}.`,
      status: 400,
    };
  }

  const discount = computeDiscount(c, opts.subtotal);
  if (discount <= 0) {
    return { ok: false, error: 'This coupon does not reduce this cart.', status: 400 };
  }

  return {
    ok: true,
    coupon: { id: String(c.id), code: String(c.code), discount },
  };
}

/** Increment used_count inside the order transaction. Fails if the last use was taken. */
export async function consumeCouponUsage(client: any, couponId: string): Promise<boolean> {
  const res = await execQuery(
    client,
    `UPDATE coupons
     SET used_count = COALESCE(used_count, 0) + 1
     WHERE id = $1
       AND COALESCE(is_active, FALSE) = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR max_uses <= 0 OR COALESCE(used_count, 0) < max_uses)
     RETURNING id`,
    [couponId]
  );
  return Array.isArray(res.rows) ? res.rows.length > 0 : Number(res.rowCount || 0) > 0;
}

/** Lock this coupon to this customer for this paid order (one account = one use). */
export async function recordCouponRedemption(
  client: any,
  opts: { couponId: string; userId: string; orderId: string }
): Promise<boolean> {
  try {
    const res = await execQuery(
      client,
      `INSERT INTO coupon_redemptions (id, coupon_id, user_id, order_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [`crd-${opts.orderId}`, opts.couponId, opts.userId, opts.orderId]
    );
    if (Array.isArray(res.rows) ? res.rows.length > 0 : Number(res.rowCount || 0) > 0) {
      return true;
    }
    const exists = await execQuery(
      client,
      `SELECT 1 FROM coupon_redemptions WHERE order_id = $1 LIMIT 1`,
      [opts.orderId]
    );
    return Boolean(exists.rows?.length);
  } catch (err: any) {
    if (err?.code === '23505') return false;
    throw err;
  }
}
