import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { getAuthenticatedUser, applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { isBookInStock, availableStock, displayStock, calculateBookPrices } from '@/lib/stock';
import {
  isComboItem,
  deliveryFeeForQty,
  effectiveBookCount,
  cartHasCombo,
  isMoqSatisfied,
  booksUntilMinOrder,
  booksUntilFreeDelivery,
} from '@/lib/deliveryRules';

interface CartValidateItem {
  id?: string | number;
  qty?: number;
  title?: string;
  selectedMedium?: string;
}

interface BookStockRow {
  id: string | number;
  title: string;
  stock: number | null;
  stock_tamil?: number | null;
  stock_english?: number | null;
  status: string | null;
  price: number | string | null;
  discount_price: number | string | null;
  category_id?: string | null;
  combo_subjects?: any;
  language?: string | null;
}

/**
 * Live cart stock check — polled by the cart drawer / cart page / checkout so
 * the client can clamp quantities, update prices, and block out-of-stock items before payment.
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

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON payload: malformed syntax' },
      { status: 400 }
    );
  }

  try {
    const items: CartValidateItem[] = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ items: [], checkedAt: Date.now() });
    }

    const ids = Array.from(new Set(items.map((i) => String(i?.id ?? '')).filter(Boolean)));
    if (ids.length === 0) {
      return NextResponse.json({ items: [], checkedAt: Date.now() });
    }

    const res = await queryDb(
      `SELECT id, title, price, discount_price, stock, stock_tamil, stock_english, status, category_id, combo_subjects, language FROM books WHERE id = ANY($1)`,
      [ids]
    );
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
          price: 0,
          mrp: 0,
          discount: 0,
        };
      }

      const bookLang = String(book.language || 'Both').trim();
      const lowerLang = bookLang.toLowerCase();
      const requestedMedium = String(i?.selectedMedium || '').trim();
      const lowerMedium = requestedMedium.toLowerCase();

      let mediumInvalid = false;
      if (
        requestedMedium &&
        lowerLang !== 'both' &&
        !lowerLang.includes('both') &&
        !(lowerLang.includes('tamil') && lowerLang.includes('english'))
      ) {
        if (lowerLang.includes('tamil') && lowerMedium.includes('english')) {
          mediumInvalid = true;
        } else if (lowerLang.includes('english') && lowerMedium.includes('tamil')) {
          mediumInvalid = true;
        }
      }

      if (mediumInvalid) {
        return {
          id,
          title: book.title,
          requestedQty,
          availableStock: 0,
          inStock: false,
          allowedQty: 0,
          removed: true,
          mediumInvalid: true,
          message: `"${book.title}" is no longer published in ${requestedMedium} — removed from cart`,
          price: 0,
          mrp: 0,
          discount: 0,
        };
      }

      let avail = availableStock(book);
      let isSoldOutMedium = false;

      if (lowerMedium.includes('tamil') && book.stock_tamil !== null && book.stock_tamil !== undefined) {
        const tStock = Math.max(0, Number(book.stock_tamil));
        avail = Math.min(avail, tStock);
        if (tStock <= 0) isSoldOutMedium = true;
      } else if (lowerMedium.includes('english') && book.stock_english !== null && book.stock_english !== undefined) {
        const eStock = Math.max(0, Number(book.stock_english));
        avail = Math.min(avail, eStock);
        if (eStock <= 0) isSoldOutMedium = true;
      }

      if (isSoldOutMedium) {
        return {
          id,
          title: book.title,
          requestedQty,
          availableStock: 0,
          inStock: false,
          allowedQty: 0,
          removed: true,
          mediumInvalid: true,
          message: `"${book.title}" (${requestedMedium}) is currently sold out — removed from cart`,
          price: 0,
          mrp: 0,
          discount: 0,
        };
      }

      const inStock = isBookInStock(book) && avail > 0;
      const allowedQty = Math.min(requestedQty, avail);
      let message: string | null = null;
      if (!inStock) {
        message = `"${book.title}" is out of stock`;
      } else if (allowedQty < requestedQty) {
        message = `Only ${avail} of "${book.title}" available`;
      }

      const { price: livePrice, mrp, discount: liveDiscount } = calculateBookPrices(book);

      const isCombo = isComboItem(book);

      return {
        id,
        title: book.title,
        category: isCombo ? 'combo' : 'guide',
        category_id: book.category_id,
        requestedQty,
        availableStock: displayStock(avail),
        inStock,
        allowedQty,
        removed: false,
        message,
        price: livePrice,
        mrp,
        discount: liveDiscount,
      };
    });
 
    const mappedForRules = results.map((r) => ({
      ...r,
      qty: r.allowedQty,
    }));
    const hasCombo = cartHasCombo(mappedForRules);
    const effQty = effectiveBookCount(mappedForRules);
    const deliveryFee = deliveryFeeForQty(effQty, hasCombo);
    const minOrderSatisfied = isMoqSatisfied(mappedForRules);
    const remainingToMinOrder = booksUntilMinOrder(mappedForRules);
    const remainingToFreeDelivery = booksUntilFreeDelivery(mappedForRules);
    const subtotal = results.reduce((sum, r) => sum + r.price * r.allowedQty, 0);
    const total = subtotal + deliveryFee;

    return NextResponse.json({
      items: results,
      subtotal,
      deliveryFee,
      total,
      hasCombo,
      effectiveQty: effQty,
      isMinOrderSatisfied: minOrderSatisfied,
      booksUntilMinOrder: remainingToMinOrder,
      booksUntilFreeDelivery: remainingToFreeDelivery,
      hasFreeDelivery: deliveryFee === 0,
      checkedAt: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stock check failed';
    console.error('POST /api/cart/validate failed:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
