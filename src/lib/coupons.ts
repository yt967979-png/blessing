export type CouponOfferType = 'discount' | 'free_book';
export type CouponDiscountType = 'percentage' | 'fixed';
export type CouponConditionMode = 'any' | 'all' | 'amount' | 'quantity';

export interface CouponRow {
  id: string;
  code: string;
  title: string | null;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  minimum_amount: number;
  minimum_quantity: number;
  offer_type: CouponOfferType;
  condition_mode: CouponConditionMode;
  expiry_date: string | Date | null;
  usage_limit: number;
  used_count: number;
  show_in_hero: boolean;
  status: string;
}

export interface PublicCoupon {
  id: string;
  code: string;
  title: string;
  description: string;
  offerType: CouponOfferType;
  discountType: CouponDiscountType;
  discountValue: number;
  minimumAmount: number;
  minimumQuantity: number;
  conditionMode: CouponConditionMode;
  expiryDate: string | null;
  label: string;
}

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeCouponCode(code: string) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isCouponExpired(expiry: string | Date | null | undefined) {
  if (!expiry) return false;
  return new Date(expiry).getTime() < Date.now();
}

export function couponOfferLabel(c: Pick<CouponRow, 'offer_type' | 'discount_type' | 'discount_value'>) {
  if (c.offer_type === 'free_book') {
    const cap = num(c.discount_value);
    return cap > 0 ? `Pick any book FREE (up to ₹${cap})` : 'Pick any book you like — FREE';
  }
  if (c.discount_type === 'percentage') return `${num(c.discount_value)}% OFF`;
  return `₹${num(c.discount_value)} OFF`;
}

export function couponConditionLabel(c: Pick<CouponRow, 'minimum_amount' | 'minimum_quantity' | 'condition_mode'>) {
  const minAmt = num(c.minimum_amount);
  const minQty = num(c.minimum_quantity);
  const parts: string[] = [];
  if (minAmt > 0) parts.push(`cart ₹${minAmt}+`);
  if (minQty > 0) parts.push(`${minQty}+ books`);
  if (parts.length === 0) return 'No minimum';
  if (c.condition_mode === 'all' && parts.length > 1) return parts.join(' & ');
  if (c.condition_mode === 'amount' && minAmt > 0) return `Min order ₹${minAmt}`;
  if (c.condition_mode === 'quantity' && minQty > 0) return `Min ${minQty} books`;
  return parts.join(' or ');
}

export function mapPublicCoupon(row: CouponRow): PublicCoupon {
  return {
    id: row.id,
    code: row.code,
    title: row.title || row.code,
    description: row.description || couponConditionLabel(row),
    offerType: (row.offer_type as CouponOfferType) || 'discount',
    discountType: (row.discount_type as CouponDiscountType) || 'percentage',
    discountValue: num(row.discount_value),
    minimumAmount: num(row.minimum_amount),
    minimumQuantity: num(row.minimum_quantity),
    conditionMode: (row.condition_mode as CouponConditionMode) || 'any',
    expiryDate: row.expiry_date ? new Date(row.expiry_date).toISOString() : null,
    label: couponOfferLabel(row),
  };
}

export function checkCouponEligibility(
  coupon: CouponRow,
  cartSubtotal: number,
  cartQty: number
): { ok: true } | { ok: false; message: string } {
  if (String(coupon.status || '').toLowerCase() !== 'active') {
    return { ok: false, message: 'This coupon is not active.' };
  }
  if (isCouponExpired(coupon.expiry_date)) {
    return { ok: false, message: 'This coupon has expired.' };
  }
  if (num(coupon.used_count) >= num(coupon.usage_limit, 100)) {
    return { ok: false, message: 'This coupon has reached its usage limit.' };
  }

  const minAmt = num(coupon.minimum_amount);
  const minQty = num(coupon.minimum_quantity);
  const amountOk = minAmt <= 0 || cartSubtotal >= minAmt;
  const qtyOk = minQty <= 0 || cartQty >= minQty;
  const mode = (coupon.condition_mode as CouponConditionMode) || 'any';

  if (mode === 'all') {
    if (minAmt > 0 && !amountOk) {
      return { ok: false, message: `Minimum order amount is ₹${minAmt}.` };
    }
    if (minQty > 0 && !qtyOk) {
      return { ok: false, message: `Minimum ${minQty} books required in cart.` };
    }
  } else if (mode === 'amount') {
    if (!amountOk) return { ok: false, message: `Minimum order amount is ₹${minAmt}.` };
  } else if (mode === 'quantity') {
    if (!qtyOk) return { ok: false, message: `Minimum ${minQty} books required in cart.` };
  } else {
    if ((minAmt > 0 || minQty > 0) && !amountOk && !qtyOk) {
      if (minAmt > 0 && minQty > 0) {
        return {
          ok: false,
          message: `Need cart ₹${minAmt}+ or at least ${minQty} books.`,
        };
      }
      if (minAmt > 0) return { ok: false, message: `Minimum order amount is ₹${minAmt}.` };
      if (minQty > 0) return { ok: false, message: `Minimum ${minQty} books required.` };
    }
  }

  return { ok: true };
}

export function computeDiscountAmount(coupon: CouponRow, cartSubtotal: number) {
  if (coupon.offer_type === 'free_book') return 0;
  const subtotal = Math.max(0, cartSubtotal);
  let discount = 0;
  if (coupon.discount_type === 'percentage') {
    discount = Math.round((subtotal * num(coupon.discount_value)) / 100);
  } else {
    discount = num(coupon.discount_value);
  }
  return Math.min(Math.max(0, discount), subtotal);
}

export async function fetchCouponByCode(client: any, code: string): Promise<CouponRow | null> {
  const normalized = normalizeCouponCode(code);
  if (!normalized) return null;
  const res = await client.query(`SELECT * FROM coupons WHERE UPPER(code) = $1 LIMIT 1`, [normalized]);
  return res.rows[0] || null;
}

export async function ensureCouponSchema(client: any) {
  await client.query(`
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS title VARCHAR(255);
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description TEXT;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS minimum_quantity INT DEFAULT 0;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS offer_type VARCHAR(30) DEFAULT 'discount';
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS condition_mode VARCHAR(20) DEFAULT 'any';
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INT DEFAULT 0;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS show_in_hero BOOLEAN DEFAULT true;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id VARCHAR(255);
    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id VARCHAR(255) PRIMARY KEY,
      coupon_id VARCHAR(255) REFERENCES coupons(id) ON DELETE SET NULL,
      user_id VARCHAR(255),
      order_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
