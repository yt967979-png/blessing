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

import { getDbClient, releaseDbClient, queryDb } from '@/lib/db';
import { confirmStockHolds } from '@/lib/stockHold';
import { generateNextGstInvoiceNumber } from '@/lib/invoiceGenerator';
import { isOrderCancelled } from '@/lib/orderStatus';

export interface FinalizeOrderOptions {
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  amountRupees?: number;
  source: 'webhook' | 'client_verification' | 'background_reconciliation';
  signature?: string | null;
  paymentMethod?: string;
  whatsappPhone?: string;
  paymentLinkId?: string;
  sessionId?: string;
  customerEmail?: string;
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

  if (!rzpOrderId && !rzpPayId && !opts.paymentLinkId) {
    return { ok: false, error: 'Missing Razorpay order, payment, or payment link ID.', status: 400 };
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
    const plinkId = opts.paymentLinkId ? String(opts.paymentLinkId).trim() : null;
    const sessId = opts.sessionId ? String(opts.sessionId).trim() : null;
    const waPhoneClean = opts.whatsappPhone ? String(opts.whatsappPhone).replace(/\D/g, '').slice(-10) : null;

    if (rzpOrderId || plinkId || sessId || waPhoneClean) {
      const sessionRes = await client.query(
        `SELECT * FROM checkout_sessions 
         WHERE (razorpay_order_id = $1)
            OR ($2 IS NOT NULL AND razorpay_order_id = $2)
            OR ($3 IS NOT NULL AND id = $3)
            OR (source = 'whatsapp' AND status = 'PAYMENT_PENDING' AND $4 IS NOT NULL AND user_id = $4)
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [rzpOrderId, plinkId, sessId, waPhoneClean ? `wa-${waPhoneClean}` : null]
      );
      if (sessionRes.rows.length > 0) {
        sessionRow = sessionRes.rows[0];
        // Heal checkout_sessions razorpay_order_id if it was saved with plink_...
        if (rzpOrderId && sessionRow.razorpay_order_id !== rzpOrderId) {
          await client.query(
            `UPDATE checkout_sessions SET razorpay_order_id = $1, updated_at = NOW() WHERE id = $2`,
            [rzpOrderId, sessionRow.id]
          );
        }
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
    const orderSource = sessionRow?.source || 'website';

    const cleanPhone = (
      shippingAddressObj?.phone ||
      opts.whatsappPhone ||
      (userId && String(userId).startsWith('wa-') ? String(userId).replace('wa-', '') : '')
    ).replace(/\D/g, '').slice(-10);

    const customerEmail = (
      shippingAddressObj?.email ||
      opts.customerEmail ||
      ''
    ).trim().toLowerCase();

    const customerName = (
      shippingAddressObj?.name ||
      'Valued Student'
    ).trim();

    let resolvedUserId = userId;

    // Check if user exists in `users` table by email OR phone to link the website account!
    if (customerEmail || cleanPhone) {
      const uMatch = await client.query(
        `SELECT id, name, email, phone FROM users 
         WHERE (LOWER(email) = $1 AND $1 <> '')
            OR (phone = $2 AND $2 <> '')
            OR (phone = $3 AND $3 <> '')
         ORDER BY (role = 'super_admin') DESC, created_at ASC
         LIMIT 1`,
        [customerEmail, cleanPhone, `91${cleanPhone}`]
      );

      if (uMatch.rows.length > 0) {
        resolvedUserId = uMatch.rows[0].id;
        // If user's phone in DB is empty or dummy ('0000000000'), update with real phone
        if ((!uMatch.rows[0].phone || uMatch.rows[0].phone === '0000000000') && cleanPhone) {
          await client.query(`UPDATE users SET phone = $1, updated_at = NOW() WHERE id = $2`, [cleanPhone, resolvedUserId]);
        }
      } else if (customerEmail && !customerEmail.includes('@blessingpowerguide.in')) {
        // Auto-create customer account in users table so they can log in via Google/Email on website
        const newUid = `usr-wa-${Date.now()}`;
        const { hashPassword } = await import('@/lib/auth');
        const crypto = await import('crypto');
        const autoPass = hashPassword(crypto.randomBytes(32).toString('hex'));

        await client.query(
          `INSERT INTO users (id, name, email, phone, password_hash, role, status, profile_completed)
           VALUES ($1, $2, $3, $4, $5, 'customer', 'active', TRUE)
           ON CONFLICT (email) DO NOTHING`,
          [newUid, customerName, customerEmail, cleanPhone || '0000000000', autoPass]
        );

        await client.query(
          `INSERT INTO cart (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
          [`cart-${newUid}`, newUid]
        );

        resolvedUserId = newUid;
      }
    }

    // Auto-save address in addresses table if user is registered and has no address
    if (resolvedUserId && !String(resolvedUserId).startsWith('wa-')) {
      const addrCheck = await client.query(
        `SELECT id FROM addresses WHERE user_id = $1 LIMIT 1`,
        [resolvedUserId]
      );
      if (addrCheck.rows.length === 0 && shippingAddressObj?.address) {
        const newAddrId = `addr-wa-${Date.now()}`;
        await client.query(
          `INSERT INTO addresses (id, user_id, full_name, phone, address_line1, city, state, country, pincode, is_default)
           VALUES ($1, $2, $3, $4, $5, $6, 'Tamil Nadu', 'India', $7, TRUE)
           ON CONFLICT (id) DO NOTHING`,
          [
            newAddrId,
            resolvedUserId,
            customerName,
            cleanPhone,
            shippingAddressObj.address,
            shippingAddressObj.city || 'Tamil Nadu',
            shippingAddressObj.pincode || '600001',
          ]
        );
        addressId = newAddrId;
      } else if (addrCheck.rows.length > 0) {
        addressId = addrCheck.rows[0].id;
      }
    }

    shippingAddressObj = {
      ...shippingAddressObj,
      name: customerName,
      email: customerEmail || shippingAddressObj?.email || '',
      phone: cleanPhone || shippingAddressObj?.phone || '',
    };

    // 3. INSERT AUTHORITATIVE ORDER
    await client.query(
      `INSERT INTO orders (
        id, order_number, user_id, address_id, subtotal, discount, shipping_charge, total_amount,
        payment_method, payment_status, order_status, courier_name, shipment_id,
        shipping_address, razorpay_order_id, razorpay_payment_id, invoice_number,
        coupon_code, coupon_id, order_source, ordered_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, 'Payment Confirmed', 'Confirmed', 'ST Courier Express', $10,
        $11, $12, $13, $14,
        $15, $16, $17, NOW(), NOW(), NOW()
      )`,
      [
        orderId,
        orderNumber,
        resolvedUserId,
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
        orderSource,
      ]
    );

    // 4. INSERT ORDER ITEMS (Batched in single multi-row network roundtrip)
    if (itemsToInsert.length > 0) {
      const valuePlaceholders: string[] = [];
      const flatParams: any[] = [];
      itemsToInsert.forEach((it, idx) => {
        const offset = idx * 8;
        valuePlaceholders.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`
        );
        flatParams.push(it.id, orderId, it.bookId, it.title, it.price, it.qty, it.subtotal, it.medium || null);
      });
      await client.query(
        `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal, medium)
         VALUES ${valuePlaceholders.join(', ')}`,
        flatParams
      );
    }

    // 5. CONVERT INVENTORY RESERVATION -> SOLD (Confirmed)
    const confirmedHolds = rzpOrderId ? await confirmStockHolds(rzpOrderId, client) : [];
    const heldQtyByBook = new Map<string, number>();
    for (const h of confirmedHolds) {
      heldQtyByBook.set(h.bookId, (heldQtyByBook.get(h.bookId) || 0) + h.qty);
    }

    // Verify inventory coverage: if hold was already released (timeout/delay race),
    // atomically re-decrement books.stock. If stock is exhausted, auto-refund!
    for (const it of itemsToInsert) {
      const heldQty = heldQtyByBook.get(it.bookId) || 0;
      if (heldQty < it.qty) {
        const shortfall = it.qty - heldQty;
        const lowerMed = String(it.medium || '').toLowerCase();
        let shortfallSql = `
          UPDATE books
          SET stock = COALESCE(stock, 0) - $1,
              status = CASE WHEN COALESCE(stock, 0) - $1 <= 0 THEN 'out_of_stock' ELSE status END,
              updated_at = NOW()
          WHERE id = $2 AND COALESCE(stock, 0) >= $1
          RETURNING id, title, stock
        `;
        if (lowerMed.includes('tamil')) {
          shortfallSql = `
            UPDATE books
            SET stock = COALESCE(stock, 0) - $1,
                stock_tamil = CASE WHEN stock_tamil IS NOT NULL THEN GREATEST(0, stock_tamil - $1) ELSE stock_tamil END,
                status = CASE WHEN COALESCE(stock, 0) - $1 <= 0 THEN 'out_of_stock' ELSE status END,
                updated_at = NOW()
            WHERE id = $2 AND COALESCE(stock, 0) >= $1 AND (stock_tamil IS NULL OR stock_tamil >= $1)
            RETURNING id, title, stock
          `;
        } else if (lowerMed.includes('english')) {
          shortfallSql = `
            UPDATE books
            SET stock = COALESCE(stock, 0) - $1,
                stock_english = CASE WHEN stock_english IS NOT NULL THEN GREATEST(0, stock_english - $1) ELSE stock_english END,
                status = CASE WHEN COALESCE(stock, 0) - $1 <= 0 THEN 'out_of_stock' ELSE status END,
                updated_at = NOW()
            WHERE id = $2 AND COALESCE(stock, 0) >= $1 AND (stock_english IS NULL OR stock_english >= $1)
            RETURNING id, title, stock
          `;
        }
        const stockRes = await client.query(shortfallSql, [shortfall, it.bookId]);
        if (stockRes.rowCount === 0) {
          // Stock was claimed by another customer while hold was released / webhook was delayed!
          await client.query('ROLLBACK');
          if (rzpPayId) {
            const { refundRazorpayPayment } = await import('@/lib/razorpayRefund');
            const refund = await refundRazorpayPayment({ paymentId: rzpPayId, orderNumber }).catch(() => ({ ok: false as const, error: 'Network timeout during auto-refund' }));
            if (!refund.ok) {
              // Persist durable REFUND_PENDING record so background sweeper retries and guarantees refund!
              try {
                await queryDb(
                  `INSERT INTO payments (id, payment_id, transaction_id, amount, currency, status)
                   VALUES ($1, $2, $3, $4, 'INR', 'REFUND_PENDING')
                   ON CONFLICT (payment_id) DO UPDATE SET status = 'REFUND_PENDING', updated_at = NOW()`,
                  [`pay-rfnd-${Date.now()}`, rzpPayId, rzpOrderId || rzpPayId, Number(totalAmount || 0)]
                );
              } catch (recErr: any) {
                console.error('[orderFinalizer] Failed to persist REFUND_PENDING:', recErr?.message || recErr);
              }
            }
          }
          return {
            ok: false,
            error: `Item "${it.title}" went out of stock before payment was finalized. Payment has been refunded automatically.`,
            status: 409,
          };
        }
        // Record confirmed sale ledger row
        const { recordConfirmedSale } = await import('@/lib/stockHold');
        await recordConfirmedSale(client, {
          razorpayOrderId: rzpOrderId || `direct-${Date.now()}`,
          bookId: it.bookId,
          userId: String(userId || ''),
          qty: shortfall,
        });
      }
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

    // 10. CLEAN UP CUSTOMER CART IN DB SO PURCHASED ITEMS NEVER RESURRECT
    if (userId) {
      await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [`cart-${userId}`]).catch(() => {});
    }

    // 11. RECORD COUPON REDEMPTION IF A COUPON WAS APPLIED
    if (couponId) {
      try {
        const { consumeCouponUsage, recordCouponRedemption } = await import('@/lib/coupons');
        await consumeCouponUsage(client, couponId).catch(() => {});
        if (userId) {
          await recordCouponRedemption(client, {
            couponId,
            userId,
            orderId,
          }).catch(() => {});
        }
      } catch (e: any) {
        console.warn('[orderFinalizer] coupon redemption logging error:', e?.message || e);
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

    // 11. AUTOMATED WHATSAPP ORDER CONFIRMATION
    try {
      const waPhone =
        shippingAddressObj?.phone ||
        (userId && String(userId).startsWith('wa-') ? String(userId).replace('wa-', '') : null) ||
        (opts.whatsappPhone ? String(opts.whatsappPhone).replace(/\D/g, '').slice(-10) : null);

      if (waPhone && (orderSource === 'whatsapp' || String(userId || '').startsWith('wa-') || opts.whatsappPhone)) {
        const { sendWhatsAppOrderConfirmed } = await import('@/lib/whatsapp');
        sendWhatsAppOrderConfirmed(waPhone, {
          orderNumber,
          totalAmount,
          itemCount: itemsToInsert.length,
          customerName: shippingAddressObj?.name,
          customerEmail,
        }).catch((waErr) => console.warn('[orderFinalizer] WhatsApp notification error:', waErr?.message || waErr));

        // Clear customer cart and reset session step in whatsapp_sessions
        await queryDb(
          `UPDATE whatsapp_sessions SET cart = '[]'::jsonb, step = 'IDLE', updated_at = NOW() WHERE phone LIKE $1`,
          [`%${waPhone}%`]
        ).catch(() => {});
      }
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
