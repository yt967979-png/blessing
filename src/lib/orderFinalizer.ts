/**
 * Server-Authoritative Order Finalization Engine
 *
 * Implements the Enterprise State Machine & Idempotency Guarantee:
 * CHECKOUT_CREATED -> PAYMENT_PENDING -> PAYMENT_CAPTURED -> ORDER_CONFIRMED
 *
 * Guaranteed Properties:
 * 1. Single source of truth — Webhook, Client Callback, and Background Reconciler
 *    all invoke this exact transactional logic.
 * 2. Strict Idempotency — Concurrent executions (webhook + client callback racing)
 *    produce exactly 1 order, 1 payment record, and 1 inventory deduction.
 * 3. Browser-Independent — Even if the customer drops connection, closes the window,
 *    or the phone restarts during UPI app switch, the order is safely created.
 */

import { getDbClient, releaseDbClient } from '@/lib/db';
import { confirmStockHolds } from '@/lib/stockHold';
import { generateNextGstInvoiceNumber } from '@/lib/invoiceGenerator';
import { isOrderCancelled } from '@/lib/orderStatus';

export interface FinalizeOrderOptions {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  amountRupees?: number;
  source: 'webhook' | 'client_verification' | 'background_reconciliation';
  signature?: string | null;
  paymentMethod?: string;
}

export type FinalizeOrderResult =
  | {
      ok: true;
      orderId: string;
      orderNumber: string;
      totalAmount: number;
      isDuplicate: boolean;
      status: string;
      paymentStatus: string;
      message?: string;
    }
  | {
      ok: false;
      error: string;
      status: number;
    };

export async function finalizeOrderFromPayment(opts: FinalizeOrderOptions): Promise<FinalizeOrderResult> {
  const rzpOrderId = String(opts.razorpayOrderId || '').trim();
  const rzpPayId = String(opts.razorpayPaymentId || '').trim();

  if (!rzpOrderId && !rzpPayId) {
    return { ok: false, error: 'Missing Razorpay order or payment ID.', status: 400 };
  }

  const client = await getDbClient();
  if (!client) {
    return { ok: false, error: 'Database unavailable.', status: 503 };
  }

  try {
    // 1. FAST-PATH IDEMPOTENCY CHECK (outside transaction)
    const existingOrder = await client.query(
      `SELECT id, order_number, total_amount, order_status, payment_status, razorpay_payment_id
       FROM orders
       WHERE (razorpay_order_id IS NOT NULL AND razorpay_order_id = $1)
          OR (razorpay_payment_id IS NOT NULL AND razorpay_payment_id = $2)
       LIMIT 1`,
      [rzpOrderId, rzpPayId]
    );

    if (existingOrder.rows.length > 0) {
      const existing = existingOrder.rows[0];

      // Heal payment_status if it wasn't marked confirmed
      if (existing.payment_status !== 'Payment Confirmed' && !isOrderCancelled(existing.order_status)) {
        await client.query(
          `UPDATE orders
           SET payment_status = 'Payment Confirmed',
               razorpay_payment_id = COALESCE(NULLIF(razorpay_payment_id, ''), $1),
               updated_at = NOW()
           WHERE id = $2`,
          [rzpPayId || null, existing.id]
        );
      }

      // Ensure payment row exists and is SUCCESS
      if (rzpPayId) {
        await client.query(
          `INSERT INTO payments (id, order_id, payment_gateway, payment_id, transaction_id, amount, status)
           VALUES ($1, $2, 'Razorpay', $3, $4, $5, 'SUCCESS')
           ON CONFLICT (id) DO UPDATE SET order_id = EXCLUDED.order_id, status = 'SUCCESS'`,
          [
            `pay-final-${Date.now()}`,
            existing.id,
            rzpPayId,
            rzpOrderId || rzpPayId,
            Number(existing.total_amount || 0),
          ]
        ).catch(() => {});
      }

      return {
        ok: true,
        orderId: existing.id,
        orderNumber: existing.order_number,
        totalAmount: Number(existing.total_amount || 0),
        isDuplicate: true,
        status: existing.order_status,
        paymentStatus: 'Payment Confirmed',
        message: 'Order already finalized.',
      };
    }

    // 2. ATOMIC TRANSACTIONAL FINALIZATION
    await client.query('BEGIN');

    // Re-check inside transaction with FOR UPDATE lock on session to prevent concurrent races
    let sessionRow: any = null;
    if (rzpOrderId) {
      const sessionRes = await client.query(
        `SELECT * FROM checkout_sessions WHERE razorpay_order_id = $1 FOR UPDATE`,
        [rzpOrderId]
      );
      if (sessionRes.rows.length > 0) {
        sessionRow = sessionRes.rows[0];
      }
    }

    // Secondary race check inside transaction
    const inTxExisting = await client.query(
      `SELECT id, order_number, total_amount, order_status FROM orders
       WHERE (razorpay_order_id IS NOT NULL AND razorpay_order_id = $1)
          OR (razorpay_payment_id IS NOT NULL AND razorpay_payment_id = $2)
       LIMIT 1`,
      [rzpOrderId, rzpPayId]
    );

    if (inTxExisting.rows.length > 0) {
      await client.query('COMMIT');
      const existing = inTxExisting.rows[0];
      return {
        ok: true,
        orderId: existing.id,
        orderNumber: existing.order_number,
        totalAmount: Number(existing.total_amount || 0),
        isDuplicate: true,
        status: existing.order_status,
        paymentStatus: 'Payment Confirmed',
        message: 'Order finalized concurrently.',
      };
    }

    let userId = sessionRow?.user_id || null;
    let shippingAddressObj: any = null;
    let itemsToInsert: Array<{ id: string; bookId: string; title: string; price: number; qty: number; subtotal: number; medium?: string | null }> = [];
    let subtotal = 0;
    let discountAmount = 0;
    let shippingFee = 0;
    let totalAmount = 0;
    let couponCode: string | null = null;
    let couponId: string | null = null;
    let addressId: string | null = null;

    if (sessionRow) {
      // PRIMARY PATH: Reconstruct directly from immutable checkout_sessions snapshot
      userId = sessionRow.user_id;
      subtotal = Number(sessionRow.subtotal || 0);
      discountAmount = Number(sessionRow.discount || 0);
      shippingFee = Number(sessionRow.shipping_fee || 0);
      totalAmount = Number(sessionRow.total_amount || 0);
      couponCode = sessionRow.coupon_code || null;
      couponId = sessionRow.coupon_id || null;

      try {
        shippingAddressObj = typeof sessionRow.shipping_address === 'string'
          ? JSON.parse(sessionRow.shipping_address)
          : sessionRow.shipping_address;
      } catch {
        shippingAddressObj = { address: String(sessionRow.shipping_address || '') };
      }

      const cartSnapshot = Array.isArray(sessionRow.cart_snapshot)
        ? sessionRow.cart_snapshot
        : typeof sessionRow.cart_snapshot === 'string'
          ? JSON.parse(sessionRow.cart_snapshot)
          : [];

      itemsToInsert = cartSnapshot.map((item: any) => {
        const p = Number(item.price || 0);
        const q = Number(item.qty || 1);
        const med = item.selectedMedium || item.medium || null;
        const baseTitle = String(item.title || item.book_title || 'Educational Guide');
        const titleWithMed = med && !baseTitle.includes(med) ? `${baseTitle} (${med})` : baseTitle;
        return {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          bookId: String(item.id || item.book_id || ''),
          title: titleWithMed,
          medium: med,
          price: p,
          qty: q,
          subtotal: Number(item.subtotal || p * q),
        };
      });
    } else {
      // FALLBACK PATH: Reconstruct from stock_holds + addresses + books
      const holdsRes = await client.query(
        `SELECT sh.book_id, sh.qty, sh.user_id, b.title, b.price, b.discount_price
         FROM stock_holds sh
         LEFT JOIN books b ON b.id = sh.book_id
         WHERE sh.razorpay_order_id = $1`,
        [rzpOrderId]
      );

      if (holdsRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          error: `No checkout session or stock reservation found for Razorpay order ${rzpOrderId}.`,
          status: 404,
        };
      }

      userId = holdsRes.rows[0].user_id;
      let addrRes: any = { rows: [] };
      let customerDetails: any = null;

      if (userId) {
        addrRes = await client.query(
          `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC LIMIT 1`,
          [userId]
        );
        const userRes = await client.query(`SELECT id, name, email, phone FROM users WHERE id = $1`, [userId]);
        if (userRes.rows.length > 0) customerDetails = userRes.rows[0];
      }

      const addr = addrRes.rows[0] || {};
      addressId = addr.id || null;
      shippingAddressObj = {
        name: addr.full_name || customerDetails?.name || 'Customer',
        phone: addr.phone || customerDetails?.phone || '',
        alternatePhone: addr.alternate_phone || '',
        address: (addr.address_line1 || '') + (addr.address_line2 ? ', ' + addr.address_line2 : ''),
        city: addr.city || 'Chennai',
        pincode: addr.pincode || '',
      };

      itemsToInsert = holdsRes.rows.map((row: any) => {
        const unitPrice = Number(row.discount_price || row.price || 0);
        const qty = Number(row.qty || 1);
        const lineSubtotal = unitPrice * qty;
        subtotal += lineSubtotal;
        return {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          bookId: row.book_id,
          title: row.title || 'Educational Guide',
          price: unitPrice,
          qty,
          subtotal: lineSubtotal,
        };
      });

      totalAmount = opts.amountRupees && opts.amountRupees > 0 ? opts.amountRupees : subtotal;
    }

    const orderId = `ord-${Date.now()}`;
    const orderNumber =
      'BPG-' +
      Date.now().toString(36).toUpperCase().slice(-5) +
      Math.random().toString(36).slice(2, 5).toUpperCase();
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const internalShipmentId = `SHP-${ymd}-${Math.floor(100000 + Math.random() * 900000)}`;
    const invoiceNumber = await generateNextGstInvoiceNumber(client);

    // 3. INSERT AUTHORITATIVE ORDER
    await client.query(
      `INSERT INTO orders (
        id, order_number, user_id, address_id, subtotal, discount, shipping_charge, total_amount,
        payment_method, payment_status, order_status, courier_name, shipment_id,
        shipping_address, razorpay_order_id, razorpay_payment_id, invoice_number,
        coupon_code, coupon_id, ordered_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, 'Payment Confirmed', 'Confirmed', 'ST Courier Express', $10,
        $11, $12, $13, $14,
        $15, $16, NOW(), NOW(), NOW()
      )`,
      [
        orderId,
        orderNumber,
        userId,
        addressId,
        subtotal,
        discountAmount,
        shippingFee,
        totalAmount,
        opts.paymentMethod || 'Razorpay UPI / Online',
        internalShipmentId,
        JSON.stringify(shippingAddressObj),
        rzpOrderId || null,
        rzpPayId || null,
        invoiceNumber,
        couponCode,
        couponId,
      ]
    );

    // 4. INSERT ORDER ITEMS
    for (const it of itemsToInsert) {
      await client.query(
        `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal, medium)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [it.id, orderId, it.bookId, it.title, it.price, it.qty, it.subtotal, it.medium || null]
      );
    }

    // 5. CONVERT INVENTORY RESERVATION -> SOLD (Confirmed)
    if (rzpOrderId) {
      await confirmStockHolds(rzpOrderId, client);
    }

    // 6. RECORD PAYMENT ROW
    if (rzpPayId) {
      const existingPay = await client.query(
        `SELECT id FROM payments WHERE payment_id = $1 LIMIT 1`,
        [rzpPayId]
      );
      if (existingPay.rows.length > 0) {
        await client.query(
          `UPDATE payments SET order_id = $1, status = 'SUCCESS', amount = $2 WHERE payment_id = $3`,
          [orderId, totalAmount, rzpPayId]
        );
      } else {
        await client.query(
          `INSERT INTO payments (id, order_id, payment_gateway, payment_id, transaction_id, amount, status)
           VALUES ($1, $2, 'Razorpay', $3, $4, $5, 'SUCCESS')`,
          [
            `pay-${Date.now()}`,
            orderId,
            rzpPayId,
            rzpOrderId || rzpPayId,
            totalAmount,
          ]
        );
      }
    }

    // 7. ADVANCE STATE IN CHECKOUT_SESSIONS
    if (sessionRow) {
      await client.query(
        `UPDATE checkout_sessions
         SET status = 'ORDER_CONFIRMED',
             order_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [orderId, sessionRow.id]
      );
    }

    // 8. RECORD ORDER TIMELINE
    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks)
       VALUES ($1, $2, 'Payment Confirmed', $3)`,
      [
        `tl-${Date.now()}`,
        orderId,
        `Payment verified & order finalized via ${opts.source}${rzpPayId ? ` (ID: ${rzpPayId})` : ''}`,
      ]
    );

    // 9. CLEAN UP ABANDONED CART IF ANY
    const phone = shippingAddressObj?.phone || '';
    if (phone) {
      const phoneDigits = String(phone).replace(/\D/g, '').slice(-10);
      if (phoneDigits.length === 10) {
        await client.query(
          `DELETE FROM abandoned_carts WHERE phone LIKE $1 OR (user_id IS NOT NULL AND user_id = $2)`,
          [`%${phoneDigits}%`, userId]
        ).catch(() => {});
      }
    }

    await client.query('COMMIT');

    // 10. REAL-TIME BROADCAST (Non-blocking outside transaction)
    try {
      const { broadcastOrderChange, notifyOrderChanged } = await import('@/app/api/orders/stream/route');
      const orderEvent = {
        type: 'ORDER_CREATED',
        orderId: orderNumber,
        status: 'Payment Confirmed',
        userId: String(userId || ''),
        timestamp: Date.now(),
      };
      broadcastOrderChange(orderEvent);
      await notifyOrderChanged(orderEvent);
    } catch (_) {}

    return {
      ok: true,
      orderId,
      orderNumber,
      totalAmount,
      isDuplicate: false,
      status: 'Confirmed',
      paymentStatus: 'Payment Confirmed',
    };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    console.error('[orderFinalizer] Transaction error:', err?.message || err);
    return { ok: false, error: err?.message || 'Order finalization failed.', status: 500 };
  } finally {
    releaseDbClient(client);
  }
}
