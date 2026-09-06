export const MIN_BOOKS_PER_ORDER = 4;
export const FREE_DELIVERY_AT_QTY = 5;
export const STANDARD_DELIVERY_FEE = 150;

export function deliveryFeeForQty(bookQty: number): number {
  const q = Math.max(0, Number(bookQty) || 0);
  if (q <= 0) return 0;
  return q >= FREE_DELIVERY_AT_QTY ? 0 : STANDARD_DELIVERY_FEE;
}
