/** Client-side cart stock state — shared by CartDrawer, /cart and /checkout. */

export interface StockAwareItem {
  id: string | number;
  title: string;
  qty: number;
  inStock?: boolean;
  stock?: number;
}

export interface CatalogStockLookup {
  id: string | number;
  inStock?: boolean;
  stock?: number;
}

export interface CartItemStockState {
  /** null = stock not tracked for this book (treated as unlimited) */
  stock: number | null;
  inStock: boolean;
  /** qty in cart exceeds what's available right now */
  overLimit: boolean;
  /** qty in cart is already at the max available */
  atLimit: boolean;
  /** this item should block checkout until resolved */
  blocking: boolean;
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
  return {
    stock,
    inStock,
    overLimit,
    atLimit,
    blocking: !inStock || overLimit,
  };
}

export function anyCartItemBlocking(items: StockAwareItem[], catalog: CatalogStockLookup[]): boolean {
  return items.some((item) => getCartItemStockState(item, catalog).blocking);
}
