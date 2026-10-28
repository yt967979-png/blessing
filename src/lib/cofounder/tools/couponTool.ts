import { queryDb } from '@/lib/db';
import { recordAdminAudit } from '@/lib/adminAudit';

export interface CreateCouponParams {
  code: string;
  discountType?: 'percentage' | 'flat';
  discountValue: number;
  maxDiscountAmount?: number | null;
  minOrderAmount?: number;
  minCartQty?: number;
  maxUses?: number;
  durationDays?: number;
  title?: string;
  showOnHero?: boolean;
  expiresAt?: string | null;
}

export interface CouponToolResult {
  success: boolean;
  message: string;
  coupon?: {
    id: string;
    code: string;
    discountType: string;
    discountValue: number;
    maxDiscountAmount: number | null;
    minOrderAmount: number;
    minCartQty: number;
    isActive: boolean;
    expiresAt: string | null;
  };
  error?: string;
}

/**
 * Creates and verifies a promotional coupon directly in PostgreSQL.
 * Single source of truth: Enforces uniqueness, validates numerical constraints,
 * writes to PostgreSQL `coupons` table, and verifies database existence.
 */
export async function executeCreateCoupon(params: CreateCouponParams): Promise<CouponToolResult> {
  const cleanCode = (params.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');

  if (!cleanCode || cleanCode.length < 2) {
    return {
      success: false,
      message: 'Invalid coupon code format. Code must be at least 2 alphanumeric characters.',
      error: 'INVALID_CODE',
    };
  }

  const discountType = params.discountType === 'flat' ? 'flat' : 'percentage';
  const discountValue = Number(params.discountValue);

  if (isNaN(discountValue) || discountValue <= 0) {
    return {
      success: false,
      message: 'Discount value must be a positive number.',
      error: 'INVALID_DISCOUNT_VALUE',
    };
  }

  if (discountType === 'percentage' && discountValue > 90) {
    return {
      success: false,
      message: `Safety limit: Percentage discount of ${discountValue}% exceeds the 90% threshold.`,
      error: 'EXCESSIVE_DISCOUNT',
    };
  }

  const maxDiscount = params.maxDiscountAmount != null && !isNaN(Number(params.maxDiscountAmount))
    ? Number(params.maxDiscountAmount)
    : null;

  const minOrder = Number(params.minOrderAmount || 0);
  const minQty = params.minCartQty !== undefined ? Number(params.minCartQty) : 4;
  const maxUses = params.maxUses != null && !isNaN(Number(params.maxUses)) && Number(params.maxUses) > 0
    ? Number(params.maxUses)
    : 5000;
  const title = params.title || `Special Offer (${cleanCode})`;
  const showOnHero = Boolean(params.showOnHero);
  let expiresAt = params.expiresAt ? new Date(params.expiresAt).toISOString() : null;
  if (!expiresAt && params.durationDays && Number(params.durationDays) > 0) {
    expiresAt = new Date(Date.now() + Number(params.durationDays) * 24 * 3600 * 1000).toISOString();
  }

  try {
    // 1. Check if coupon already exists
    const existing = await queryDb(
      `SELECT id, code, discount_type, discount_value, max_discount_amount, is_active FROM coupons WHERE UPPER(code) = $1 LIMIT 1`,
      [cleanCode]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        success: false,
        message: `⚠️ Coupon **${cleanCode}** already exists in the database with a ${row.discount_value}${row.discount_type === 'percentage' ? '%' : '₹'} discount (Status: ${row.is_active ? 'Active' : 'Disabled'}). Would you like me to update or replace it?`,
        coupon: {
          id: row.id,
          code: row.code,
          discountType: row.discount_type,
          discountValue: Number(row.discount_value),
          maxDiscountAmount: row.max_discount_amount ? Number(row.max_discount_amount) : null,
          minOrderAmount: Number(row.min_order_amount || 0),
          minCartQty: Number(row.min_cart_qty || 4),
          isActive: Boolean(row.is_active),
          expiresAt: row.expires_at || null,
        },
        error: 'DUPLICATE_CODE',
      };
    }

    // 2. Insert into PostgreSQL
    const couponId = `cpn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    await queryDb(
      `INSERT INTO coupons (
        id, code, title, show_on_hero, discount_type, discount_value, min_cart_qty, min_order_amount,
        max_discount_amount, max_uses, used_count, is_active, expires_at, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, true, $11, NOW())`,
      [
        couponId,
        cleanCode,
        title,
        showOnHero,
        discountType,
        discountValue,
        minQty,
        minOrder,
        maxDiscount,
        maxUses,
        expiresAt,
      ]
    );

    // 3. VERIFY in PostgreSQL: Query back the row to prove persistence
    const verification = await queryDb(
      `SELECT id, code, discount_type, discount_value, max_discount_amount, min_order_amount, min_cart_qty, is_active, expires_at
       FROM coupons WHERE id = $1 LIMIT 1`,
      [couponId]
    );

    if (verification.rows.length === 0) {
      return {
        success: false,
        message: 'Database insert could not be verified in PostgreSQL.',
        error: 'VERIFICATION_FAILED',
      };
    }

    const verifiedRow = verification.rows[0];

    // 4. Audit Log
    recordAdminAudit({
      actorId: 'ai-cofounder',
      action: 'COUPON_CREATED_BY_COFOUNDER',
      targetType: 'coupon',
      targetId: cleanCode,
      details: {
        couponId,
        discountType,
        discountValue,
        maxDiscount,
        minQty,
      },
    }).catch(() => {});

    return {
      success: true,
      message: `Coupon **${cleanCode}** has been created and verified in PostgreSQL.`,
      coupon: {
        id: verifiedRow.id,
        code: verifiedRow.code,
        discountType: verifiedRow.discount_type,
        discountValue: Number(verifiedRow.discount_value),
        maxDiscountAmount: verifiedRow.max_discount_amount ? Number(verifiedRow.max_discount_amount) : null,
        minOrderAmount: Number(verifiedRow.min_order_amount || 0),
        minCartQty: Number(verifiedRow.min_cart_qty || 4),
        isActive: Boolean(verifiedRow.is_active),
        expiresAt: verifiedRow.expires_at || null,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to create coupon: ${err.message || 'Database error'}`,
      error: err.message,
    };
  }
}

/**
 * Retrieves authoritative coupon information from PostgreSQL.
 */
export async function executeGetCoupon(code: string): Promise<CouponToolResult> {
  const cleanCode = (code || '').trim().toUpperCase();
  const res = await queryDb(
    `SELECT id, code, discount_type, discount_value, max_discount_amount, min_order_amount, min_cart_qty, max_uses, used_count, is_active, expires_at
     FROM coupons WHERE UPPER(code) = $1 LIMIT 1`,
    [cleanCode]
  );

  if (res.rows.length === 0) {
    return {
      success: false,
      message: `Coupon **${cleanCode}** was not found in the database.`,
      error: 'NOT_FOUND',
    };
  }

  const row = res.rows[0];
  return {
    success: true,
    message: `Found coupon ${cleanCode}.`,
    coupon: {
      id: row.id,
      code: row.code,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      maxDiscountAmount: row.max_discount_amount ? Number(row.max_discount_amount) : null,
      minOrderAmount: Number(row.min_order_amount || 0),
      minCartQty: Number(row.min_cart_qty || 4),
      isActive: Boolean(row.is_active),
      expiresAt: row.expires_at || null,
    },
  };
}

/**
 * Toggles a coupon's active status (deactivate or activate).
 */
export async function executeToggleCoupon(code: string, isActive: boolean): Promise<CouponToolResult> {
  const cleanCode = (code || '').trim().toUpperCase();
  const res = await queryDb(
    `UPDATE coupons SET is_active = $1 WHERE UPPER(code) = $2 RETURNING id, code, is_active, discount_value, discount_type`,
    [isActive, cleanCode]
  );

  if (res.rows.length === 0) {
    return {
      success: false,
      message: `Coupon **${cleanCode}** does not exist in the database.`,
      error: 'NOT_FOUND',
    };
  }

  const row = res.rows[0];
  return {
    success: true,
    message: `Coupon **${cleanCode}** is now ${isActive ? 'Active' : 'Deactivated'}.`,
    coupon: {
      id: row.id,
      code: row.code,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      maxDiscountAmount: null,
      minOrderAmount: 0,
      minCartQty: 4,
      isActive: Boolean(row.is_active),
      expiresAt: null,
    },
  };
}

/**
 * Permanently deletes a coupon from PostgreSQL.
 */
export async function executeDeleteCoupon(code: string): Promise<CouponToolResult> {
  const cleanCode = (code || '').trim().toUpperCase();
  const res = await queryDb(
    `DELETE FROM coupons WHERE UPPER(code) = $1 RETURNING id, code`,
    [cleanCode]
  );

  if (res.rows.length === 0) {
    return {
      success: false,
      message: `Coupon **${cleanCode}** was not found in the database.`,
      error: 'NOT_FOUND',
    };
  }

  return {
    success: true,
    message: `Coupon **${cleanCode}** has been completely deleted from the database.`,
  };
}
