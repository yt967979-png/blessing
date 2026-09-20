/**
 * Single source of truth for book stock/availability.
 * Used server-side by the catalog API, checkout pricing, order placement,
 * and the cart-validate endpoint so every layer agrees on what "in stock" means.
 */

export interface StockRow {
  status?: unknown;
  stock?: unknown;
}

const DISABLED_STATUSES = new Set(['out_of_stock', 'draft', 'archived', 'inactive']);

/** Is this book purchasable right now? */
export function isBookInStock(row: StockRow): boolean {
  const status = String(row.status || '').toLowerCase().trim();
  if (DISABLED_STATUSES.has(status)) return false;
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
 *  - Normal rupee discount price (e.g., MRP 350, discount_price 280 -> ₹280)
 *  - Accidental fractional decimal input (e.g., 0.2 meaning 20% off -> 350 * 0.8 = ₹280)
 *  - Fallback to MRP when discount is invalid, negative, or >= MRP
 */
export function calculateBookPrices(d: { price?: unknown; discount_price?: unknown }): {
  price: number;
  mrp: number;
  discount: number;
} {
  const mrp = Math.max(0, Math.round(Number(d.price) || 0));
  const rawSale =
    d.discount_price == null || d.discount_price === '' ? NaN : Number(d.discount_price);

  // If rawSale is between 0 and 1 (e.g. 0.2), treat as fractional discount percentage (20% off -> 350 * 0.8 = 280)
  const effectiveSale =
    Number.isFinite(rawSale) && rawSale > 0 && rawSale < 1 && mrp > 0
      ? Math.round(mrp * (1 - rawSale))
      : Number.isFinite(rawSale)
      ? Math.round(rawSale)
      : NaN;

  const hasSale = Number.isFinite(effectiveSale) && effectiveSale >= 1 && effectiveSale < mrp;
  const price = hasSale ? effectiveSale : mrp;
  const discount = hasSale && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
  return { price, mrp, discount };
}
