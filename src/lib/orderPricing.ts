import { queryDb } from '@/lib/db';
import { isBookInStock, availableStock, calculateBookPrices } from '@/lib/stock';
import { isComboItem } from '@/lib/deliveryRules';

async function execQuery(client: any, sql: string, params?: any[]): Promise<any> {
  if (typeof client === 'function') {
    return client(sql, params);
  }
  if (client && typeof client.query === 'function') {
    return client.query(sql, params);
  }
  return queryDb(sql, params);
}

/** Price cart items from DB; returns total in rupees */
export async function priceCartItems(
  client: any,
  items: any[]
): Promise<{ ok: true; total: number; verifiedItems: any[] } | { ok: false; error: string; status: number }> {
  const parsedItems = Array.isArray(items) ? items : [];
  if (parsedItems.length === 0) {
    return { ok: false, error: 'Cart is empty. Add books before checkout.', status: 400 };
  }

  let calculatedSubtotal = 0;
  const verifiedItems: any[] = [];

  for (const item of parsedItems) {
    const rawQty = Math.floor(Number(item.qty || 1));
    const itemQty = Number.isFinite(rawQty) && rawQty > 0 ? Math.min(rawQty, 999) : 1;
    if (!item.id) {
      return { ok: false, error: 'Invalid cart item.', status: 400 };
    }
    const rawMed = String(item.selectedMedium || item.medium || '').trim();
    const dbBook = await execQuery(
      client,
      `SELECT id, title, price, discount_price, stock, stock_tamil, stock_english, language, status, category_id FROM books WHERE id = $1 LIMIT 1`,
      [item.id]
    );
    if (dbBook.rows.length === 0) {
      return { ok: false, error: 'Book not found in catalog.', status: 400 };
    }
    const book = dbBook.rows[0];
    if (!isBookInStock(book)) {
      return { ok: false, error: `"${book.title}" is out of stock.`, status: 400 };
    }
    const stock = availableStock(book);
    if (itemQty > stock) {
      return { ok: false, error: `"${book.title}" — only ${stock} left in stock.`, status: 400 };
    }

    const lowerMed = rawMed.toLowerCase();
    const isMultiLang = String(book.language || '').toLowerCase().includes('both');
    if (lowerMed.includes('tamil')) {
      if (book.stock_tamil !== null && book.stock_tamil !== undefined) {
        const tStock = Math.max(0, Math.floor(Number(book.stock_tamil) || 0));
        if (itemQty > tStock) {
          return { ok: false, error: `"${book.title} (Tamil Medium)" — only ${tStock} left in stock.`, status: 400 };
        }
      } else if (isMultiLang) {
        return { ok: false, error: `"${book.title} (Tamil Medium)" is currently out of stock.`, status: 400 };
      }
    } else if (lowerMed.includes('english')) {
      if (book.stock_english !== null && book.stock_english !== undefined) {
        const eStock = Math.max(0, Math.floor(Number(book.stock_english) || 0));
        if (itemQty > eStock) {
          return { ok: false, error: `"${book.title} (English Medium)" — only ${eStock} left in stock.`, status: 400 };
        }
      } else if (isMultiLang) {
        return { ok: false, error: `"${book.title} (English Medium)" is currently out of stock.`, status: 400 };
      }
    }

    const { price: unitPrice } = calculateBookPrices(book);
    const subtotal = unitPrice * itemQty;
    calculatedSubtotal += subtotal;
    const isCombo = isComboItem(book);
    verifiedItems.push({
      id: book.id,
      title: book.title,
      price: unitPrice,
      qty: itemQty,
      selectedMedium: rawMed || null,
      medium: rawMed || null,
      category: isCombo ? 'combo' : 'guide',
      category_id: book.category_id,
      subtotal,
    });
  }

  return { ok: true, total: calculatedSubtotal, verifiedItems };
}

export async function verifyRazorpayPayment(opts: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  expectedRupees: number;
  userId?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const crypto = await import('crypto');
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret || !keyId) {
    return { ok: false, error: 'Razorpay not configured.' };
  }

  const expectedSig = crypto
    .createHmac('sha256', keySecret)
    .update(`${opts.razorpayOrderId}|${opts.razorpayPaymentId}`)
    .digest('hex');

  try {
    const a = Buffer.from(expectedSig, 'hex');
    const b = Buffer.from(String(opts.razorpaySignature), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'Payment signature mismatch.' };
    }
  } catch {
    return { ok: false, error: 'Payment signature mismatch.' };
  }

  const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  try {
    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${opts.razorpayPaymentId}`, {
      headers: { Authorization: authHeader },
      signal: AbortSignal.timeout(8000),
    });
    const payment = await payRes.json();
    if (!payRes.ok) {
      return { ok: false, error: 'Could not verify payment with Razorpay.' };
    }
    if (payment.order_id !== opts.razorpayOrderId) {
      return { ok: false, error: 'Payment order mismatch.' };
    }
    if (String(payment.currency || '').toUpperCase() !== 'INR') {
      return { ok: false, error: 'Payment currency must be INR.' };
    }
    if (payment.status !== 'captured' && payment.status !== 'authorized') {
      return { ok: false, error: `Payment not completed (status: ${payment.status}).` };
    }
    const paidPaise = Number(payment.amount || 0);
    const expectedPaise = Math.round(opts.expectedRupees * 100);
    if (paidPaise !== expectedPaise) {
      return { ok: false, error: 'Paid amount does not match order total.' };
    }

    if (opts.userId) {
      const ordRes = await fetch(`https://api.razorpay.com/v1/orders/${opts.razorpayOrderId}`, {
        headers: { Authorization: authHeader },
        signal: AbortSignal.timeout(8000),
      });
      const rzpOrder = await ordRes.json().catch(() => ({}));
      if (ordRes.ok) {
        const noteUser = String(rzpOrder?.notes?.userId || '');
        if (noteUser && noteUser !== String(opts.userId)) {
          return { ok: false, error: 'Payment does not belong to this account.' };
        }
        const orderPaise = Number(rzpOrder.amount || 0);
        if (orderPaise && orderPaise !== expectedPaise) {
          return { ok: false, error: 'Paid amount does not match Razorpay order.' };
        }
      }
    }

    return { ok: true };
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      return { ok: false, error: 'Razorpay payment verification timed out (8s). Please try again or wait for webhook reconciliation.' };
    }
    return { ok: false, error: err?.message || 'Failed to reach Razorpay payment gateway.' };
  }
}
