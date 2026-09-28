/**
 * Single source of truth for book stock/availability.
 * Used server-side by the catalog API, checkout pricing, order placement,
 * and the cart-validate endpoint so every layer agrees on what "in stock" means.
 */

export interface StockRow {
  status?: unknown;
  stock?: unknown;
  language?: unknown;
  stock_tamil?: unknown;
  stock_english?: unknown;
  stockTamil?: unknown;
  stockEnglish?: unknown;
  is_coming_soon?: unknown;
  isComingSoon?: unknown;
}

const DISABLED_STATUSES = new Set(['out_of_stock', 'draft', 'archived', 'inactive', 'coming_soon']);

/** Is this book purchasable right now? */
export function isBookInStock(row: StockRow): boolean {
  if (row.is_coming_soon || row.isComingSoon) return false;
  const status = String(row.status || '').toLowerCase().trim();
  if (DISABLED_STATUSES.has(status)) return false;

  const lang = String(row.language || '').toLowerCase().trim();
  const isMulti = lang.includes('both') || (lang.includes('tamil') && lang.includes('english'));
  if (isMulti) {
    const rawT = row.stock_tamil ?? row.stockTamil;
    const rawE = row.stock_english ?? row.stockEnglish;
    const hasT = rawT !== undefined && rawT !== null && rawT !== '';
    const hasE = rawE !== undefined && rawE !== null && rawE !== '';
    if (hasT || hasE) {
      const tQty = hasT ? Math.max(0, Number(rawT) || 0) : 0;
      const eQty = hasE ? Math.max(0, Number(rawE) || 0) : 0;
      if (tQty <= 0 && eQty <= 0) return false;
    }
  }

  if (row.stock !== undefined && row.stock !== null && row.stock !== '') {
    return Number(row.stock) > 0;
  }
  return status === 'published' || status === 'active' || status === '';
}

/**
 * Purchasable quantity right now. Books without a tracked `stock` value
 * (legacy rows) are treated as unlimited as long as status allows sale.
 */
export function availableStock(row: StockRow): number {
  if (!isBookInStock(row)) return 0;
  if (row.stock === undefined || row.stock === null || row.stock === '') {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(0, Math.floor(Number(row.stock) || 0));
}

/** Clamp a requested qty to what's actually purchasable (0 when unavailable). */
export function clampQtyToStock(requestedQty: number, row: StockRow): number {
  const avail = availableStock(row);
  const qty = Math.max(0, Math.floor(Number(requestedQty) || 0));
  return Math.min(qty, avail);
}

/** Cap the "unlimited" sentinel before sending stock numbers to a client. */
export function displayStock(avail: number): number {
  return Math.min(avail, 999_999);
}

/**
 * Single source of truth for calculating book selling price, MRP, and discount percentage.
 * Correctly handles:
 *  - Exact rupee sale price (e.g., 280 or test prices like 0.2 for 20 paise)
 *  - Fallback to MRP when discount is invalid, negative, or >= MRP
 */
export function calculateBookPrices(d: { price?: unknown; discount_price?: unknown }): {
  price: number;
  mrp: number;
  discount: number;
} {
  const mrp = Number(d.price) || 0;
  const rawSale =
    d.discount_price == null || d.discount_price === '' ? NaN : Number(d.discount_price);

  const hasSale = Number.isFinite(rawSale) && rawSale > 0 && rawSale < mrp;
  const price = hasSale ? rawSale : mrp;
  const discount = hasSale && mrp > 0 ? Math.max(0, Math.min(99, Math.round(((mrp - price) / mrp) * 100))) : 0;
  return { price, mrp, discount };
}
