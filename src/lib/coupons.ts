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
  per_user_limit: number;
  allowed_classes: string | null;
  allowed_categories: string | null;
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
  allowedClasses: string[];
  allowedCategories: string[];
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

function parseCsvList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function serializeCsvList(values: string[] | null | undefined): string | null {
  if (!values?.length) return null;
  const cleaned = [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
  return cleaned.length ? cleaned.join(',') : null;
}

/** Match product API class/category inference from a books row. */
export function bookMetaFromRow(row: {
  title?: string;
  category_id?: string;
  department?: string;
}) {
  const isCombo =
    row.category_id === 'cat-combos' || String(row.title || '').toLowerCase().includes('combo');
  const classMatch = String(row.title || row.department || '').match(/(6th|7th|8th|9th|10th|11th|12th)/i);
  const cls = classMatch ? classMatch[0].toLowerCase() : '10th';
  const category = isCombo ? 'combo' : 'guide';
  return { cls, category };
}

export function restrictionLabel(coupon: Pick<CouponRow, 'allowed_classes' | 'allowed_categories'>) {
  const classes = parseCsvList(coupon.allowed_classes);
  const categories = parseCsvList(coupon.allowed_categories);
  const parts: string[] = [];
  if (classes.length) parts.push(`${classes.join(', ')} std`);
  if (categories.length) parts.push(categories.map((c) => (c === 'combo' ? 'combos' : 'guides')).join(', '));
  return parts.length ? parts.join(' · ') : '';
}

export function mapPublicCoupon(row: CouponRow): PublicCoupon {
  const allowedClasses = parseCsvList(row.allowed_classes);
  const allowedCategories = parseCsvList(row.allowed_categories);
  const restriction = restrictionLabel(row);
  return {
    id: row.id,
    code: row.code,
    title: row.title || row.code,
    description:
      row.description ||
      [couponConditionLabel(row), restriction].filter(Boolean).join(' · ') ||
      couponConditionLabel(row),
    offerType: (row.offer_type as CouponOfferType) || 'discount',
    discountType: (row.discount_type as CouponDiscountType) || 'percentage',
    discountValue: num(row.discount_value),
    minimumAmount: num(row.minimum_amount),
    minimumQuantity: num(row.minimum_quantity),
    conditionMode: (row.condition_mode as CouponConditionMode) || 'any',
    expiryDate: row.expiry_date ? new Date(row.expiry_date).toISOString() : null,
    label: couponOfferLabel(row),
    allowedClasses,
    allowedCategories,
  };
}

export async function checkCouponCartRestrictions(
  client: any,
  coupon: CouponRow,
  bookIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  const allowedClasses = parseCsvList(coupon.allowed_classes);
  const allowedCategories = parseCsvList(coupon.allowed_categories);
  if (allowedClasses.length === 0 && allowedCategories.length === 0) return { ok: true };
  if (bookIds.length === 0) {
    return { ok: false, message: 'Cart is empty.' };
  }

  const res = await client.query(
    `SELECT b.id, b.title, b.department, b.category_id FROM books b WHERE b.id = ANY($1)`,
    [bookIds]
  );
  const byId = new Map<string, { cls: string; category: string }>(
    res.rows.map((r: any) => [r.id as string, bookMetaFromRow(r)])
  );

  for (const id of bookIds) {
    const meta = byId.get(id);
    if (!meta) {
      return { ok: false, message: 'A cart item is no longer in the catalog.' };
    }
    if (allowedClasses.length && !allowedClasses.includes(meta.cls)) {
      return {
        ok: false,
        message: `This coupon applies to ${allowedClasses.join(', ')} standard books only.`,
      };
    }
    if (allowedCategories.length && !allowedCategories.includes(meta.category)) {
      const label = allowedCategories.includes('combo') ? 'combo packs' : 'guides';
      return {
        ok: false,
        message: `This coupon applies to ${label} only.`,
      };
    }
  }

  return { ok: true };
}

export async function getUserCouponRedemptionCount(
  client: any,
  couponId: string,
  userId: string
): Promise<number> {
  const res = await client.query(
    `SELECT COUNT(*)::int AS c FROM coupon_redemptions WHERE coupon_id = $1 AND user_id = $2`,
    [couponId, userId]
  );
  return Number(res.rows[0]?.c || 0);
}

/** Enforce once-per-user (or custom per_user_limit; 0 = unlimited per user). */
export async function checkUserCouponLimit(
  client: any,
  coupon: CouponRow,
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const limit = num(coupon.per_user_limit, 1);
  if (limit <= 0) return { ok: true };

  const usedByUser = await getUserCouponRedemptionCount(client, coupon.id, userId);
  if (usedByUser >= limit) {
    return {
      ok: false,
      message:
        limit === 1
          ? 'You have already used this coupon.'
          : `You can use this coupon at most ${limit} time(s).`,
    };
  }
  return { ok: true };
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
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_user_limit INT DEFAULT 1;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS allowed_classes TEXT;
    ALTER TABLE coupons ADD COLUMN IF NOT EXISTS allowed_categories TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id VARCHAR(255);
    CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id VARCHAR(255) PRIMARY KEY,
      coupon_id VARCHAR(255) REFERENCES coupons(id) ON DELETE SET NULL,
      user_id VARCHAR(255),
      order_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_user
      ON coupon_redemptions (coupon_id, user_id);
  `);
}
