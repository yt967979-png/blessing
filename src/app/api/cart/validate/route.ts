import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { getAuthenticatedUser, applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { isBookInStock, availableStock, displayStock } from '@/lib/stock';

interface CartValidateItem {
  id?: string | number;
  qty?: number;
  title?: string;
}

interface BookStockRow {
  id: string | number;
  title: string;
  stock: number | null;
  status: string | null;
}

/**
 * Live cart stock check — polled by the cart drawer / cart page / checkout so
 * the client can clamp quantities and block out-of-stock items before payment.
 * This is advisory for the UI; the authoritative guard is still the DB-level
 * stock decrement in POST /api/orders and the pricing check in priceCheckoutOrder.
 */
export async function POST(request: Request) {
  const session = await getAuthenticatedUser(request).catch(() => null);
  const rl = await applyRateLimitAsync(
    `cart-validate:${session?.userId || clientIp(request)}`,
    60,
    60_000
  );
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const items: CartValidateItem[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ items: [], checkedAt: Date.now() });
    }

    const ids = Array.from(new Set(items.map((i) => String(i?.id ?? '')).filter(Boolean)));
    if (ids.length === 0) {
      return NextResponse.json({ items: [], checkedAt: Date.now() });
    }

    const res = await queryDb(`SELECT id, title, stock, status FROM books WHERE id = ANY($1)`, [ids]);
    const byId = new Map<string, BookStockRow>(
      res.rows.map((r: BookStockRow) => [String(r.id), r])
    );

    const results = items.map((i) => {
      const id = String(i?.id ?? '');
      const requestedQty = Math.max(0, Math.floor(Number(i?.qty) || 0));
      const fallbackTitle = String(i?.title || 'Item');
      const book = byId.get(id);

      if (!book) {
        return {
          id,
          title: fallbackTitle,
          requestedQty,
          availableStock: 0,
          inStock: false,
          allowedQty: 0,
          removed: true,
          message: `"${fallbackTitle}" is no longer available`,
        };
      }

      const inStock = isBookInStock(book);
      const avail = availableStock(book);
      const allowedQty = Math.min(requestedQty, avail);
      let message: string | null = null;
      if (!inStock) {
        message = `"${book.title}" is out of stock`;
      } else if (allowedQty < requestedQty) {
        message = `Only ${avail} of "${book.title}" available`;
      }

      return {
        id,
        title: book.title,
        requestedQty,
        availableStock: displayStock(avail),
        inStock,
        allowedQty,
        removed: false,
        message,
      };
    });

    return NextResponse.json({ items: results, checkedAt: Date.now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stock check failed';
    console.error('POST /api/cart/validate failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
