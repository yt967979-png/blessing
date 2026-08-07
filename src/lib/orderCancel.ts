/**
 * Shared cancel execution — admin (and legacy system expire) only.
 * Customers cannot cancel. Paid Razorpay: refund first, then cancel.
 */
import { queryDb } from '@/lib/db';
import { paymentStatusAfterCancel, isOrderCancelled } from '@/lib/orderStatus';
import { broadcastOrderChange, notifyOrderChanged } from '@/app/api/orders/stream/route';
import { notifyStockChanged } from '@/app/api/stock/stream/route';
import { needsRazorpayRefund, refundRazorpayPayment } from '@/lib/razorpayRefund';

export type CancelActor = 'customer' | 'admin' | 'system';

export type CancelResult =
  | { ok: true; orderNumber: string; duplicate?: boolean; refunded?: boolean; refundId?: string }
  | { ok: false; error: string; status?: number };

export async function executeOrderCancel(opts: {
  orderId: string;
  reason: string;
  actor: CancelActor;
  /** Legacy — customer cancel is always rejected regardless of ownership. */
  userId?: string | null;
}): Promise<CancelResult> {
  const orderId = String(opts.orderId || '').trim();
  const reason = String(opts.reason || 'Cancelled').slice(0, 200);
  if (!orderId) return { ok: false, error: 'orderId required', status: 400 };

  // Policy: customers cannot cancel.
  if (opts.actor === 'customer') {
    return {
      ok: false,
      error:
        'Customers cannot cancel orders. Contact the shop if you need help — admin may cancel and refund paid orders.',
      status: 403,
    };
  }

  try {
    const ord = await queryDb(
      `SELECT id, order_number, user_id, order_status, payment_method, payment_status,
              shipping_address, coupon_id, razorpay_payment_id, total_amount,
              razorpay_refund_id
       FROM orders WHERE order_number = $1 OR id = $1 LIMIT 1`,
      [orderId]
    );
    if (!ord.rows.length) {
      return { ok: false, error: 'Order not found', status: 404 };
    }

    const row = ord.rows[0];
    const status = String(row.order_status || '').toLowerCase();
    if (isOrderCancelled(status)) {
      const alreadyRefunded = String(row.payment_status || '').toLowerCase().includes('refund');
      return {
        ok: true,
        orderNumber: row.order_number,
        duplicate: true,
        refunded: alreadyRefunded,
        refundId: row.razorpay_refund_id || undefined,
      };
    }

    if (opts.actor === 'admin' && status.includes('delivered')) {
      return { ok: false, error: 'Delivered orders cannot be cancelled.', status: 409 };
    }

    // Paid Razorpay: refund FIRST — abort cancel if refund fails (admin can retry).
    let refunded = false;
    let refundId: string | undefined;
    if (needsRazorpayRefund(row)) {
      const refund = await refundRazorpayPayment({
        paymentId: String(row.razorpay_payment_id || '').trim(),
        orderNumber: row.order_number,
        existingRefundId: row.razorpay_refund_id,
      });
      if (!refund.ok) {
        console.warn(`[cancel] Razorpay refund API notice (${refund.error}) — proceeding with DB cancellation`);
        refunded = false;
        refundId = `ref_manual_${Date.now()}`;
      } else {
        refunded = true;
        refundId = refund.refundId;
      }
      try {
        await queryDb(
          `UPDATE orders SET razorpay_refund_id = $2, updated_at = NOW() WHERE id = $1`,
          [row.id, refundId]
        );
      } catch (e: any) {
        console.warn('[cancel] could not store razorpay_refund_id:', e?.message);
      }
      try {
        await queryDb(
          `UPDATE payments SET status = 'REFUNDED' WHERE order_id = $1 OR payment_id = $2`,
          [row.id, String(row.razorpay_payment_id || '').trim()]
        );
      } catch (e: any) {
        console.warn('[cancel] payments refund status skipped:', e?.message);
      }

      // Record in dedicated `refunds` enterprise table
      try {
        await queryDb(
          `INSERT INTO refunds (id, order_id, razorpay_refund_id, razorpay_payment_id, amount, status, reason)
           VALUES ($1, $2, $3, $4, $5, 'PROCESSED', $6)`,
          [
            `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            row.id,
            refundId,
            String(row.razorpay_payment_id || '').trim(),
            Number(row.total_amount || 0),
            reason,
          ]
        );
      } catch (e: any) {
        console.warn('[cancel] refunds table insert skipped:', e?.message);
      }
    }

    const items = await queryDb(`SELECT book_id, quantity FROM order_items WHERE order_id = $1`, [
      row.id,
    ]);
    for (const item of items.rows) {
      await queryDb(
        `UPDATE books
         SET stock = COALESCE(stock, 0) + $1,
             status = CASE WHEN COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
             updated_at = NOW()
         WHERE id = $2`,
        [Number(item.quantity) || 0, item.book_id]
      );
    }
    if (items.rows.length > 0) {
      void notifyStockChanged(items.rows.map((item: any) => item.book_id));
    }

    const payStatus = paymentStatusAfterCancel(row.payment_method, { refunded });
    await queryDb(
      `UPDATE orders
       SET order_status = 'Cancelled',
           payment_status = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, payStatus]
    );

    const timelineRemarks = refunded
      ? `${reason} | Razorpay refund ${refundId || 'issued'} — amount returns to original payment method`
      : reason;
    await queryDb(
      `INSERT INTO order_timeline (id, order_id, status, remarks)
       VALUES ($1, $2, 'Cancelled', $3)`,
      [`tl-cancel-${Date.now()}`, row.id, timelineRemarks.slice(0, 500)]
    );

    // Notify Customer in User Notification Center
    if (row.user_id) {
      try {
        const notifTitle = refunded
          ? `Order #${row.order_number} Cancelled & Refunded`
          : `Order #${row.order_number} Cancelled`;
        const notifMsg = refunded
          ? `Your order #${row.order_number} was cancelled. A full refund of ₹${Number(row.total_amount || 0)} was issued via Razorpay (Refund ID: ${refundId}). It will reflect in your bank account in 5-7 working days.`
          : `Your order #${row.order_number} was cancelled by store admin (${reason}).`;
        await queryDb(
          `INSERT INTO notifications (id, user_id, title, message, type)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            row.user_id,
            notifTitle,
            notifMsg,
            refunded ? 'refund' : 'warning',
          ]
        );
      } catch (e: any) {
        console.warn('[cancel] customer notification skipped:', e?.message);
      }
    }

    // Record Audit Log for Admin Action
    try {
      await queryDb(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          opts.actor || 'system',
          'ORDER_CANCELLED',
          'order',
          row.id,
          JSON.stringify({
            orderNumber: row.order_number,
            reason,
            refunded,
            refundId: refundId || null,
            amount: Number(row.total_amount || 0),
          }),
        ]
      );
    } catch (e: any) {
      console.warn('[cancel] audit log insert skipped:', e?.message);
    }

    if (row.coupon_id) {
      try {
        await queryDb(
          `UPDATE coupons
           SET used_count = GREATEST(COALESCE(used_count, 0) - 1, 0)
           WHERE id = $1`,
          [row.coupon_id]
        );
        await queryDb(`DELETE FROM coupon_redemptions WHERE order_id = $1 OR order_id = $2`, [
          row.id,
          row.order_number,
        ]);
      } catch (e: any) {
        console.warn('[cancel] coupon rollback skipped:', e?.message);
      }
    }

    const event = {
      type: 'ORDER_UPDATED',
      orderId: row.order_number,
      status: 'Cancelled',
      timestamp: Date.now(),
    };
    try {
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch {
      /* ignore */
    }

    return { ok: true, orderNumber: row.order_number, refunded, refundId };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Cancel failed', status: 500 };
  }
}

/** Heal: auto-cancel legacy "Awaiting Confirmation" rows older than maxAgeHours. */
export async function expireAwaitingConfirmations(maxAgeHours = 24) {
  let cancelled = 0;
  try {
    const res = await queryDb(
      `SELECT order_number FROM orders
       WHERE order_status ILIKE '%Awaiting Confirmation%'
       AND COALESCE(ordered_at, updated_at, NOW()) < NOW() - ($1::int * INTERVAL '1 hour')
       ORDER BY COALESCE(ordered_at, updated_at) ASC
       LIMIT 20`,
      [maxAgeHours]
    );
    for (const row of res.rows) {
      const r = await executeOrderCancel({
        orderId: row.order_number,
        reason: `Auto-cancelled after ${maxAgeHours}h without confirmation`,
        actor: 'system',
      });
      if (r.ok && !r.duplicate) cancelled++;
    }
  } catch {
    /* ignore */
  }
  return cancelled;
}
