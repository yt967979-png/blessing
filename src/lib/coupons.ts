import { queryDb } from '@/lib/db';

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
  allowedClasses: string[];
  allowedCategories: string[];
  perUserLimit: number;
  badge: string;
}

async function execQuery(client: any, sql: string, params?: any[]): Promise<any> {
  if (typeof client === 'function') {
    return client(sql, params);
  }
  if (client && typeof client.query === 'function') {
    return client.query(sql, params);
  }
  return queryDb(sql, params);
}

function num(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function parseCsvList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

export function serializeCsvList(input: unknown): string {
  if (Array.isArray(input)) {
    return input.map(String).map((s) => s.trim()).filter(Boolean).join(',');
  }
  if (typeof input === 'string') {
    return input.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean).join(',');
  }
  return '';
}

export function couponOfferLabel(row: CouponRow): string {
  if (row.offer_type === 'free_book') return 'Free Book';
  return row.discount_type === 'percentage' ? `${row.discount_value}% OFF` : `₹${row.discount_value} OFF`;
}

export function couponConditionLabel(row: CouponRow): string {
  const mode = row.condition_mode || 'any';
  const minAmt = num(row.minimum_amount);
  const minQty = num(row.minimum_quantity);
  if (mode === 'amount') return `Min ₹${minAmt}`;
  if (mode === 'quantity') return `Min ${minQty} books`;
  if (mode === 'all') return `Min ₹${minAmt} & ${minQty} books`;
  return `Min ₹${minAmt} or ${minQty} books`;
}

export function restrictionLabel(row: CouponRow): string {
  const classes = parseCsvList(row.allowed_classes);
  const cats = parseCsvList(row.allowed_categories);
  const parts: string[] = [];
  if (classes.length) parts.push(classes.join(', ') + ' std');
  if (cats.length) parts.push(cats.join(', '));
  return parts.length ? parts.join(' | ') : 'All books';
}

export function normalizeCouponCode(code: unknown): string {
  return String(code || '')
    .trim()
    .toUpperCase();
}

export function isCouponExpired(expiry: string | Date | null): boolean {
  if (!expiry) return false;
  const t = new Date(expiry).getTime();
  return Number.isFinite(t) && t < Date.now();
}

export function bookMetaFromRow(row: any): { cls: string; category: string } {
  const dept = String(row.department || row.category_id || '').toLowerCase();
  const title = String(row.title || '').toLowerCase();

  let cls = '';
  if (dept.includes('10th') || title.includes('10th')) cls = '10th';
  else if (dept.includes('12th') || title.includes('12th')) cls = '12th';
  else if (dept.includes('11th') || title.includes('11th')) cls = '11th';

  let category = 'guide';
  if (dept.includes('combo') || title.includes('combo') || title.includes('pack')) {
    category = 'combo';
  }

  return { cls, category };
}

export function mapPublicCoupon(row: CouponRow): PublicCoupon {
  const offerType = (row.offer_type as CouponOfferType) || 'discount';
  const discountType = (row.discount_type as CouponDiscountType) || 'fixed';
  const val = num(row.discount_value);
  let badge = 'Special Offer';

  if (offerType === 'free_book') {
    badge = val > 0 ? `Free Book (up to ₹${val})` : 'Free Book';
  } else if (discountType === 'percentage') {
    badge = `${val}% OFF`;
  } else {
    badge = `₹${val} OFF`;
  }

  return {
    id: row.id,
    code: String(row.code || '').toUpperCase(),
    title: row.title || `${badge} Offer`,
    description:
      row.description ||
      (offerType === 'free_book'
        ? 'Get a free guide with eligible books'
        : `Save ${badge} on your order`),
    offerType,
    discountType,
    discountValue: val,
    minimumAmount: num(row.minimum_amount),
    minimumQuantity: num(row.minimum_quantity),
    conditionMode: (row.condition_mode as CouponConditionMode) || 'any',
    expiryDate: row.expiry_date ? new Date(row.expiry_date).toISOString() : null,
    allowedClasses: parseCsvList(row.allowed_classes),
    allowedCategories: parseCsvList(row.allowed_categories),
    perUserLimit: num(row.per_user_limit, 1),
    badge,
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

  const res = await execQuery(
    client,
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
  const res = await execQuery(
    client,
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
  const res = await execQuery(client, `SELECT * FROM coupons WHERE UPPER(code) = $1 LIMIT 1`, [normalized]);
  return res.rows[0] || null;
}

export async function ensureCouponSchema(client: any) {
  await execQuery(client, `
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
