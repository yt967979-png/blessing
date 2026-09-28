import { calculateBookPrices } from './stock';
import { deliveryFeeForCart, cartHasCombo } from './deliveryRules';

export interface CatalogBookRow {
  id: string;
  title: string;
  subject?: string;
  price?: number;
  discount_price?: number | null;
  stock?: number;
  status?: string;
  language?: string;
  [key: string]: any;
}

export interface SyncedCartItem {
  id: string;
  title: string;
  price: number;
  mrp?: number;
  qty: number;
  snapshotPrice?: number;
  inStock?: boolean;
  selectedMedium?: string | null;
  cover_image?: string;
  image?: string;
  [key: string]: any;
}

export interface SyncCartResult {
  items: SyncedCartItem[];
  changed: boolean;
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  totalQty: number;
}

/**
 * Normalizes text for fuzzy token matching (removes symbols, lowercases, cleans whitespace)
 */
function normalizeTokens(str: string): string[] {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !['the', 'and', 'for', 'std', 'standard', 'book', 'guide'].includes(t));
}

/**
 * Finds the matching book from the catalog for a given cart item.
 * 1. Exact ID match
 * 2. Exact title match (case-insensitive)
 * 3. Token-based matching (e.g. '10th' + 'tamil' or 'combo')
 */
export function matchBookForCartItem(item: any, catalogBooks: CatalogBookRow[]): CatalogBookRow | null {
  if (!catalogBooks || catalogBooks.length === 0) return null;

  const itemId = String(item.id || '').trim();
  const itemTitle = String(item.title || '').trim().toLowerCase();

  // 1. Direct ID match
  if (itemId) {
    const directMatch = catalogBooks.find((b) => String(b.id) === itemId);
    if (directMatch) return directMatch;
  }

  // 2. Exact Title match
  if (itemTitle) {
    const titleMatch = catalogBooks.find(
      (b) => String(b.title || '').trim().toLowerCase() === itemTitle
    );
    if (titleMatch) return titleMatch;
  }

  // 3. Token/Keyword Match
  const itemTokens = normalizeTokens(item.title || '');
  if (itemTokens.length > 0) {
    let bestBook: CatalogBookRow | null = null;
    let maxOverlap = 0;

    for (const book of catalogBooks) {
      const bookTokens = new Set([
        ...normalizeTokens(book.title || ''),
        ...normalizeTokens(book.subject || ''),
      ]);

      let overlap = 0;
      for (const t of itemTokens) {
        if (bookTokens.has(t)) overlap++;
      }

      if (overlap > maxOverlap && overlap >= 1) {
        maxOverlap = overlap;
        bestBook = book;
      }
    }

    if (bestBook && maxOverlap > 0) {
      return bestBook;
    }
  }

  return null;
}

/**
 * Synchronizes cart items with the live catalog books.
 * Re-prices every item, updates titles/IDs if changed, and computes fresh totals.
 */
export function syncCartItemsWithBooks(
  rawItems: any[],
  catalogBooks: CatalogBookRow[]
): SyncCartResult {
  const items: SyncedCartItem[] = [];
  let changed = false;

  for (const raw of rawItems) {
    const matchedBook = matchBookForCartItem(raw, catalogBooks);
    const originalPrice = Number(raw.price || 0);
    const qty = Math.max(1, Math.floor(Number(raw.qty || 1)));

    if (matchedBook) {
      const { price: livePrice, mrp: liveMrp } = calculateBookPrices(matchedBook);
      const isPriceDiff = Math.abs(livePrice - originalPrice) > 0.001;
      const isIdDiff = String(raw.id) !== String(matchedBook.id);
      const isTitleDiff = raw.title !== matchedBook.title;

      if (isPriceDiff || isIdDiff || isTitleDiff) {
        changed = true;
      }

      items.push({
        ...raw,
        id: String(matchedBook.id),
        title: matchedBook.title || raw.title,
        price: livePrice,
        mrp: liveMrp,
        snapshotPrice: raw.snapshotPrice !== undefined ? raw.snapshotPrice : originalPrice,
        inStock: matchedBook.status === 'published' && (matchedBook.stock === undefined || Number(matchedBook.stock) > 0),
        qty,
      });
    } else {
      // Book not found in live catalog, keep item with snapshot price
      items.push({
        ...raw,
        price: originalPrice,
        snapshotPrice: originalPrice,
        qty,
      });
    }
  }

  const subtotal = items.reduce(
    (sum, it) => sum + (Number(it.price || 0) * Number(it.qty || 1)),
    0
  );
  const totalQty = items.reduce((sum, it) => sum + Number(it.qty || 1), 0);
  const shippingFee = deliveryFeeForCart(items);
  const totalAmount = subtotal + shippingFee;

  return {
    items,
    changed,
    subtotal,
    shippingFee,
    totalAmount,
    totalQty,
  };
}

/**
 * Re-syncs all rows in the `abandoned_carts` table in Postgres against the latest `books` catalog.
 * Updates `cart_json` in place if prices, titles, or book IDs changed.
 */
export async function syncAllAbandonedCartsInDb(existingClient?: any): Promise<{ updatedCount: number; totalCount: number }> {
  const { getDbClient, releaseDbClient } = await import('@/lib/db');
  let client = existingClient;
  const mustRelease = !existingClient;

  try {
    if (!client) {
      client = await getDbClient();
      if (!client) return { updatedCount: 0, totalCount: 0 };
    }

    const [booksRes, cartsRes] = await Promise.all([
      client.query(`SELECT id, title, subject, price, discount_price, stock, status, language FROM books`),
      client.query(`SELECT id, cart_json FROM abandoned_carts`),
    ]);

    const catalogBooks: CatalogBookRow[] = booksRes.rows || [];
    const carts = cartsRes.rows || [];
    let updatedCount = 0;

    for (const row of carts) {
      let rawItems: any[] = [];
      try {
        rawItems = JSON.parse(row.cart_json || '[]');
      } catch {
        continue;
      }

      if (!Array.isArray(rawItems) || rawItems.length === 0) continue;

      const syncResult = syncCartItemsWithBooks(rawItems, catalogBooks);
      if (syncResult.changed) {
        await client.query(
          `UPDATE abandoned_carts 
           SET cart_json = $1, updated_at = NOW() 
           WHERE id = $2`,
          [JSON.stringify(syncResult.items), row.id]
        );
        updatedCount++;
      }
    }

    return { updatedCount, totalCount: carts.length };
  } catch (err: any) {
    console.error('[syncAllAbandonedCartsInDb] Failed to sync abandoned carts:', err?.message || err);
    return { updatedCount: 0, totalCount: 0 };
  } finally {
    if (mustRelease && client) {
      releaseDbClient(client);
    }
  }
}
