export const MIN_BOOKS_PER_ORDER = Math.max(4, Number(process.env.NEXT_PUBLIC_MIN_BOOKS_PER_ORDER || 4));
export const FREE_DELIVERY_AT_QTY = 5;
export const STANDARD_DELIVERY_FEE = 150;
export const COMBO_BOOK_EQUIVALENT = 5; // 1 combo pack represents 5 guide subjects

/** Checks if an item belongs to the Combo Pack category or contains 5-in-1 guides */
export function isComboItem(item: any): boolean {
  if (!item) return false;
  if (item.category === 'combo') return true;
  if (item.category_id === 'cat-combos') return true;
  const title = String(item.title || '').toLowerCase();
  return (
    title.includes('combo') ||
    title.includes('5 in 1') ||
    title.includes('5-in-1') ||
    title.includes('6 in 1') ||
    title.includes('6-in-1') ||
    title.includes('7 in 1') ||
    title.includes('7-in-1') ||
    title.includes('all in one') ||
    title.includes('all-in-one') ||
    title.includes('full set')
  );
}

/** Returns true if any active item in the cart is a Combo Pack */
export function cartHasCombo(items: any[] | null | undefined): boolean {
  if (!Array.isArray(items)) return false;
  return items.some((item) => Number(item.qty || 0) > 0 && isComboItem(item));
}

/**
 * Calculates effective book count for shipping / MOQ purposes.
 * Each combo pack counts as 5 guides since it bundles 5 full subjects (price of 5 guides).
 */
export function effectiveBookCount(items: any[] | null | undefined): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const qty = Math.max(0, Number(item.qty || 0));
    if (qty <= 0) return sum;
    if (isComboItem(item)) {
      return sum + qty * COMBO_BOOK_EQUIVALENT;
    }
    return sum + qty;
  }, 0);
}

/**
 * Calculates delivery fee:
 * - If cart has any combo pack -> ₹0 (FREE DELIVERY)
 * - If bookQty >= 5 -> ₹0 (FREE DELIVERY)
 * - If bookQty > 0 -> ₹150 flat delivery fee
 * - If bookQty <= 0 -> 0
 */
export function deliveryFeeForQty(bookQty: number, hasCombo: boolean = false): number {
  if (hasCombo) return 0;
  const q = Math.max(0, Number(bookQty) || 0);
  if (q <= 0) return 0;
  return q >= FREE_DELIVERY_AT_QTY ? 0 : STANDARD_DELIVERY_FEE;
}

/** Calculates delivery fee directly from a cart items array */
export function deliveryFeeForCart(items: any[] | null | undefined): number {
  if (!Array.isArray(items) || items.length === 0) return 0;
  if (cartHasCombo(items)) return 0;
  const eff = effectiveBookCount(items);
  return deliveryFeeForQty(eff, false);
}

/** Checks if minimum order quantity requirement is met (1 combo pack satisfies MOQ) */
export function isMoqSatisfied(itemsOrQty: any[] | number): boolean {
  if (typeof itemsOrQty === 'number') {
    return itemsOrQty >= MIN_BOOKS_PER_ORDER;
  }
  if (!Array.isArray(itemsOrQty) || itemsOrQty.length === 0) return false;
  if (cartHasCombo(itemsOrQty)) return true;
  return effectiveBookCount(itemsOrQty) >= MIN_BOOKS_PER_ORDER;
}

/** Returns remaining books needed to reach Minimum Order Quantity */
export function booksUntilMinOrder(itemsOrQty: any[] | number): number {
  if (typeof itemsOrQty === 'number') {
    return Math.max(0, MIN_BOOKS_PER_ORDER - Math.max(0, Number(itemsOrQty) || 0));
  }
  if (!Array.isArray(itemsOrQty) || itemsOrQty.length === 0) return MIN_BOOKS_PER_ORDER;
  if (cartHasCombo(itemsOrQty)) return 0;
  return Math.max(0, MIN_BOOKS_PER_ORDER - effectiveBookCount(itemsOrQty));
}

/** Human-readable checkout / cart alert message for MOQ */
export function minOrderCheckoutMessage(itemsOrQty: any[] | number): string | null {
  const need = booksUntilMinOrder(itemsOrQty);
  if (need <= 0) return null;
  return `Minimum ${MIN_BOOKS_PER_ORDER} books per order. Add ${need} more to checkout (or add 1 Combo Pack for instant Free Delivery).`;
}
