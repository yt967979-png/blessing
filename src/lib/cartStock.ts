/** Client-side cart stock state — shared by CartDrawer, /cart and /checkout. */

export interface StockAwareItem {
  id: string | number;
  title: string;
  qty: number;
  inStock?: boolean;
  stock?: number;
  selectedMedium?: string;
  language?: string;
}

export interface CatalogStockLookup {
  id: string | number;
  inStock?: boolean;
  stock?: number;
  language?: string;
}

export interface CartItemStockState {
  /** null = stock not tracked for this book (treated as unlimited) */
  stock: number | null;
  inStock: boolean;
  /** qty in cart exceeds what's available right now */
  overLimit: boolean;
  /** qty in cart is already at the max available */
  atLimit: boolean;
  /** the medium in cart is no longer published for this book */
  mediumInvalid: boolean;
  /** this item should block checkout until resolved */
  blocking: boolean;
}

/** Check if the selected medium is published for the book's current language configuration */
export function isMediumCompatible(
  selectedMedium: string | undefined | null,
  bookLanguage: string | undefined | null
): boolean {
  if (!selectedMedium || !bookLanguage) return true;
  const lang = String(bookLanguage).trim().toLowerCase();
  if (lang === 'both' || (lang.includes('tamil') && lang.includes('english'))) {
    return true;
  }
  const med = String(selectedMedium).trim().toLowerCase();
  if (lang.includes('tamil') && med.includes('english')) {
    return false;
  }
  if (lang.includes('english') && med.includes('tamil')) {
    return false;
  }
  return true;
}

/** Prefer live catalog data (polled) over the possibly-stale snapshot stored in the cart item. */
export function getCartItemStockState(
  item: StockAwareItem,
  catalog: CatalogStockLookup[]
): CartItemStockState {
  const live = catalog.find((p) => String(p.id) === String(item.id));
  const source = live || item;
  const stock = typeof source.stock === 'number' ? source.stock : null;
  const inStock = source.inStock !== false;
  const overLimit = inStock && stock !== null && item.qty > stock;
  const atLimit = inStock && stock !== null && item.qty >= stock;
  const activeLang = live?.language !== undefined ? live.language : item.language;
  const mediumInvalid = !isMediumCompatible(item.selectedMedium, activeLang);

  return {
    stock,
    inStock: inStock && !mediumInvalid,
    overLimit,
    atLimit,
    mediumInvalid,
    blocking: !inStock || overLimit || mediumInvalid,
  };
}

export function anyCartItemBlocking(items: StockAwareItem[], catalog: CatalogStockLookup[]): boolean {
  return items.some((item) => getCartItemStockState(item, catalog).blocking);
}
