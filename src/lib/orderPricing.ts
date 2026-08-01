import { queryDb } from '@/lib/db';

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
    const itemQty = Math.max(1, Number(item.qty || 1));
    if (!item.id) {
      return { ok: false, error: 'Invalid cart item.', status: 400 };
    }
    const dbBook = await execQuery(
      client,
      `SELECT id, title, price, discount_price, stock, status FROM books WHERE id = $1 LIMIT 1`,
      [item.id]
    );
    if (dbBook.rows.length === 0) {
      return { ok: false, error: 'Book not found in catalog.', status: 400 };
    }
    const book = dbBook.rows[0];
    const stock = Number(book.stock ?? 0);
    if (book.status === 'out_of_stock' || stock <= 0) {
      return { ok: false, error: `"${book.title}" is out of stock.`, status: 400 };
    }
    if (itemQty > stock) {
      return { ok: false, error: `"${book.title}" — only ${stock} left in stock.`, status: 400 };
    }
    const mrp = Number(book.price) || 0;
    const rawSale =
      book.discount_price == null || book.discount_price === ''
        ? NaN
        : Number(book.discount_price);
    const unitPrice =
      Number.isFinite(rawSale) && rawSale > 0 && rawSale < mrp ? rawSale : mrp;
    const subtotal = unitPrice * itemQty;
    calculatedSubtotal += subtotal;
    verifiedItems.push({
      id: book.id,
      title: book.title,
      price: unitPrice,
      qty: itemQty,
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
  const payRes = await fetch(`https://api.razorpay.com/v1/payments/${opts.razorpayPaymentId}`, {
    headers: { Authorization: authHeader },
  });
  const payment = await payRes.json();
  if (!payRes.ok) {
    return { ok: false, error: 'Could not verify payment with Razorpay.' };
  }
  if (payment.order_id !== opts.razorpayOrderId) {
    return { ok: false, error: 'Payment order mismatch.' };
  }
  if (payment.status !== 'captured' && payment.status !== 'authorized') {
    return { ok: false, error: `Payment not completed (status: ${payment.status}).` };
  }
  const paidPaise = Number(payment.amount || 0);
  const expectedPaise = Math.round(opts.expectedRupees * 100);
  if (paidPaise !== expectedPaise) {
    return { ok: false, error: 'Paid amount does not match order total.' };
  }
  return { ok: true };
}
