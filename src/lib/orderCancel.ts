/**
 * Shared cancel execution — admin (and legacy system expire) only.
 * Customers cannot cancel. Paid Razorpay: refund first, then cancel.
 */
import { queryDb } from '@/lib/db';
import { paymentStatusAfterCancel, isOrderCancelled, isParcelDelivered, logOrderStateTransition } from '@/lib/orderStatus';
import { broadcastOrderChange, notifyOrderChanged } from '@/app/api/orders/stream/route';
import { notifyStockChanged } from '@/app/api/stock/stream/route';
import { needsRazorpayRefund, refundRazorpayPayment } from '@/lib/razorpayRefund';

export type CancelActor = 'customer' | 'admin' | 'system';

export type CancelResult =
  | { ok: true; orderNumber: string; duplicate?: boolean; refunded?: boolean; refundId?: string }
  | { ok: false; error: string; status?: number };

export interface CancelOrderOpts {
  orderId: string;
  reason: string;
  actor: CancelActor;
  /** Legacy — customer cancel is always rejected regardless of ownership. */
  userId?: string | null;
  /** If true, this is a return/RTO flow: allowed on Delivered/In Transit orders, marks status as 'Returned' */
  isReturn?: boolean;
  /** Option to skip refund (e.g. damaged goods return rejection or COD return) */
  refund?: boolean;
  /** Option to skip inventory restoration (e.g. damaged/destroyed goods) */
  restoreStock?: boolean;
}

export async function executeOrderCancel(opts: CancelOrderOpts): Promise<CancelResult> {
  const orderId = String(opts.orderId || '').trim();
  const reason = String(opts.reason || (opts.isReturn ? 'Returned' : 'Cancelled')).slice(0, 200);
  if (!orderId) return { ok: false, error: 'orderId required', status: 400 };

  const isReturn = Boolean(opts.isReturn);
  const targetStatus = isReturn ? 'Returned' : 'Cancelled';

  // Policy: customers cannot cancel or mark return directly without admin.
  if (opts.actor === 'customer') {
    return {
      ok: false,
      error: isReturn
        ? 'Customers cannot mark orders as returned. Please contact the bookstore support team.'
        : 'Customers cannot cancel orders. Contact the shop if you need help — admin may cancel and refund paid orders.',
      status: 403,
    };
  }

  try {
    const ord = await queryDb(
      `SELECT id, order_number, user_id, order_status, payment_method, payment_status,
              shipping_address, coupon_id, razorpay_payment_id, total_amount,
              razorpay_refund_id, razorpay_order_id, awb_number
       FROM orders WHERE order_number = $1 OR id = $1 LIMIT 1`,
      [orderId]
    );
    if (!ord.rows.length) {
      return { ok: false, error: 'Order not found', status: 404 };
    }

    const row = ord.rows[0];
    const status = String(row.order_status || '').toLowerCase();

    // Strict Policy: NO RETURNS accepted for books once ordered/dispatched.
    if (isReturn) {
      return {
        ok: false,
        error: 'Books are strictly non-returnable. No returns or return-refunds are accepted once dispatched or delivered.',
        status: 400,
      };
    }

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

    // Strict Policy: REFUND ONLY BEFORE AWB ASSIGNMENT.
    // Assigning an AWB indicates parcel is handed over to ST Courier.
    // Once AWB is assigned or order is in transit/delivered, NO CANCELLATION AND NO REFUND.
    const awb = String(row.awb_number || '').trim();
    const hasAwb = Boolean(awb && !awb.startsWith('SHP-') && !awb.toLowerCase().includes('pending'));
    const isDispatched =
      status.includes('transit') ||
      status.includes('handed') ||
      status.includes('delivery') ||
      status.includes('delivered') ||
      status.includes('rto');

    if (opts.actor !== 'system' && (hasAwb || isDispatched)) {
      return {
        ok: false,
        error: `Cannot cancel or refund order #${row.order_number}: ST Courier AWB has already been assigned (${awb || 'Handed to ST Courier'}). Once handed to ST Courier, orders cannot be cancelled or refunded.`,
        status: 409,
      };
    }

    // Paid Razorpay: refund FIRST — abort cancel if refund fails (admin can retry).
    let refunded = false;
    let refundId: string | undefined;
    let razorpayRefundStatus: string | undefined;
    const shouldRefund = opts.refund !== false && needsRazorpayRefund(row);

    if (shouldRefund) {
      // ── ATOMIC CAS CLAIM: Transition to REFUNDING to lock against concurrent double-refund clicks
      // Lease timeout (3 minutes): If a previous attempt crashed or timed out, the lock is reclaimable.
      const claimRefund = await queryDb(
        `UPDATE orders 
         SET payment_status = 'REFUNDING', updated_at = NOW()
         WHERE id = $1 
           AND (
             (payment_status != 'REFUNDING' AND payment_status NOT ILIKE '%refund%')
             OR (payment_status = 'REFUNDING' AND updated_at < NOW() - INTERVAL '3 minutes')
           )
         RETURNING id`,
        [row.id]
      );

      if (claimRefund.rowCount === 0) {
        const checkCurrent = await queryDb(
          `SELECT payment_status, razorpay_refund_id, updated_at FROM orders WHERE id = $1`,
          [row.id]
        );
        const currentPs = String(checkCurrent.rows[0]?.payment_status || '');
        if (currentPs === 'REFUNDING') {
          return {
            ok: false,
            error: 'A refund operation for this order is currently in progress. Please wait a moment.',
            status: 409,
          };
        }
        if (currentPs.toLowerCase().includes('refund')) {
          return {
            ok: true,
            orderNumber: row.order_number,
            duplicate: true,
            refunded: true,
            refundId: checkCurrent.rows[0]?.razorpay_refund_id || undefined,
          };
        }
      }

      let refund: any;
      try {
        refund = await refundRazorpayPayment({
          paymentId: String(row.razorpay_payment_id || '').trim(),
          orderNumber: row.order_number,
          existingRefundId: row.razorpay_refund_id,
        });
      } catch (refundExc: any) {
        // Uncaught network error / timeout — revert from REFUNDING to REFUND_FAILED so admin can retry
        await queryDb(
          `UPDATE orders SET payment_status = 'REFUND_FAILED', updated_at = NOW() WHERE id = $1`,
          [row.id]
        ).catch(() => {});
        return {
          ok: false,
          error: refundExc?.message || 'Razorpay refund request timed out. Status marked REFUND_FAILED — please retry.',
          status: 502,
        };
      }

      if (!refund.ok) {
        // Mark as REFUND_FAILED so admin can see the failure and retry
        await queryDb(
          `UPDATE orders SET payment_status = 'REFUND_FAILED', updated_at = NOW() WHERE id = $1`,
          [row.id]
        ).catch(() => {});
        await queryDb(
          `UPDATE payments SET status = 'REFUND_FAILED' WHERE order_id = $1 OR payment_id = $2`,
          [row.id, String(row.razorpay_payment_id || '').trim()]
        ).catch(() => {});

        return {
          ok: false,
          error: refund.error || 'Razorpay refund failed. Operation aborted — fix payment then retry.',
          status: 502,
        };
      }

      refunded = true;
      refundId = refund.refundId;
      razorpayRefundStatus = refund.razorpayStatus || (refund.alreadyRefunded ? 'processed' : 'processed');

      try {
        await queryDb(
          `UPDATE orders SET payment_status = 'Refunded', razorpay_refund_id = $2, updated_at = NOW() WHERE id = $1`,
          [row.id, refundId]
        );
      } catch (e: any) {
        console.warn('[cancel/return] could not store razorpay_refund_id:', e?.message);
      }
      try {
        await queryDb(
          `UPDATE payments SET status = 'REFUNDED' WHERE order_id = $1 OR payment_id = $2`,
          [row.id, String(row.razorpay_payment_id || '').trim()]
        );
      } catch (e: any) {
        console.warn('[cancel/return] payments refund status skipped:', e?.message);
      }

      // Record in dedicated `refunds` enterprise table
      try {
        const dbRefundStatus =
          String(razorpayRefundStatus || '').toLowerCase() === 'pending' ? 'PENDING' : 'PROCESSED';
        await queryDb(
          `INSERT INTO refunds (id, order_id, razorpay_refund_id, razorpay_payment_id, amount, status, reason)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            row.id,
            refundId,
            String(row.razorpay_payment_id || '').trim(),
            Number(row.total_amount || 0),
            dbRefundStatus,
            reason,
          ]
        );
      } catch (e: any) {
        console.warn('[cancel/return] refunds table insert skipped:', e?.message);
      }
    }

    const payStatus = isReturn
      ? (refunded ? 'Refunded' : (row.payment_status || 'Returned'))
      : paymentStatusAfterCancel(row.payment_method, { refunded });

    await queryDb(
      `UPDATE orders
       SET order_status = $2,
           payment_status = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, targetStatus, payStatus]
    );

    const timelineRemarks = refunded
      ? `${reason} | Razorpay refund ${refundId || 'issued'} — amount returns to original payment method`
      : reason;
    await queryDb(
      `INSERT INTO order_timeline (id, order_id, status, remarks)
       VALUES ($1, $2, $3, $4)`,
      [`tl-${isReturn ? 'return' : 'cancel'}-${Date.now()}`, row.id, targetStatus, timelineRemarks.slice(0, 500)]
    );

    // Notify Customer in User Notification Center
    if (row.user_id) {
      try {
        const notifTitle = isReturn
          ? (refunded ? `Order #${row.order_number} Returned & Refunded` : `Order #${row.order_number} Returned`)
          : (refunded ? `Order #${row.order_number} Cancelled & Refunded` : `Order #${row.order_number} Cancelled`);
        const notifMsg = refunded
          ? `Your order #${row.order_number} ${isReturn ? 'return was processed' : 'was cancelled'}. Razorpay refund of ₹${Number(row.total_amount || 0)} succeeded (ID: ${refundId}). Money usually reaches your UPI/card in 5–7 working days.`
          : `Your order #${row.order_number} was ${isReturn ? 'marked as returned' : 'cancelled by store admin'} (${reason}).`;
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
        console.warn('[cancel/return] customer notification skipped:', e?.message);
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
          isReturn ? 'ORDER_RETURNED' : 'ORDER_CANCELLED',
          'order',
          row.id,
          JSON.stringify({
            orderNumber: row.order_number,
            reason,
            refunded,
            refundId: refundId || null,
            amount: Number(row.total_amount || 0),
            isReturn,
          }),
        ]
      );
    } catch (e: any) {
      console.warn('[cancel/return] audit log insert skipped:', e?.message);
    }

    // Coupon usage rollback on cancel or return
    if (row.coupon_id) {
      try {
        const { releaseCouponUsage } = await import('@/lib/coupons');
        await releaseCouponUsage(null, {
          couponId: row.coupon_id,
          orderId: row.id,
          orderNumber: row.order_number,
          userId: row.user_id,
        });
      } catch (e: any) {
        console.warn('[cancel/return] coupon rollback skipped:', e?.message);
      }
    }

    // Inventory restoration on cancel/return:
    if (opts.restoreStock !== false) {
      let releasedViaHolds = false;
      // Stock holds are only relevant for unfulfilled / cancelled orders where holds still exist
      if (row.razorpay_order_id && !isReturn) {
        try {
          const { releaseStockHolds } = await import('@/lib/stockHold');
          const res = await releaseStockHolds(
            { razorpayOrderId: row.razorpay_order_id, includeConfirmed: true },
            `cancel:${reason}`.slice(0, 100)
          );
          if (res.releasedCount > 0) {
            releasedViaHolds = true;
          }
        } catch (e: any) {
          console.warn('[cancel] releaseStockHolds failed:', e?.message || e);
        }
      }

      // If no holds were flipped (e.g. returns, legacy orders, COD), restore directly from order_items with medium awareness
      if (!releasedViaHolds) {
        try {
          const itemsRes = await queryDb(
            `SELECT book_id, quantity, medium FROM order_items WHERE order_id = $1`,
            [row.id]
          );
          const bookIdsToNotify: string[] = [];
          for (const it of itemsRes.rows || []) {
            const bId = it.book_id;
            const qty = Number(it.quantity) || 1;
            const med = String(it.medium || '').toLowerCase();
            let restoreSql = `
              UPDATE books
              SET stock = COALESCE(stock, 0) + $1,
                  status = CASE WHEN status = 'out_of_stock' AND COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
                  updated_at = NOW()
              WHERE id = $2
            `;
            if (med.includes('tamil')) {
              restoreSql = `
                UPDATE books
                SET stock = COALESCE(stock, 0) + $1,
                    stock_tamil = CASE WHEN stock_tamil IS NOT NULL THEN stock_tamil + $1 ELSE stock_tamil END,
                    status = CASE WHEN status = 'out_of_stock' AND COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
                    updated_at = NOW()
                WHERE id = $2
              `;
            } else if (med.includes('english')) {
              restoreSql = `
                UPDATE books
                SET stock = COALESCE(stock, 0) + $1,
                    stock_english = CASE WHEN stock_english IS NOT NULL THEN stock_english + $1 ELSE stock_english END,
                    status = CASE WHEN status = 'out_of_stock' AND COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
                    updated_at = NOW()
                WHERE id = $2
              `;
            }
            await queryDb(restoreSql, [qty, bId]);
            bookIdsToNotify.push(bId);
          }
          if (bookIdsToNotify.length > 0) {
            try {
              await notifyStockChanged(bookIdsToNotify);
            } catch (_) {}
          }
        } catch (e: any) {
          console.warn('[cancel/return] order_items stock restoration failed:', e?.message || e);
        }
      }
    }

    const event = {
      type: 'ORDER_UPDATED',
      orderId: row.order_number,
      status: targetStatus,
      userId: row.user_id ? String(row.user_id) : null,
      timestamp: Date.now(),
    };
    try {
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch {
      /* ignore */
    }

    logOrderStateTransition({
      orderNumber: row.order_number,
      fromStatus: status,
      toStatus: targetStatus,
      actor: opts.actor || 'admin',
      amount: Number(row.total_amount || 0),
      details: { reason, refunded, refundId: refundId || null, isReturn },
    });

    return { ok: true, orderNumber: row.order_number, refunded, refundId };
  } catch (err: any) {
    return { ok: false, error: err?.message || `${targetStatus} failed`, status: 500 };
  }
}

/**
 * Execute return for a delivered, in-transit, or RTO order.
 * Restores inventory from order_items with bilingual medium awareness and refunds prepaid customer.
 */
export async function executeOrderReturn(opts: {
  orderId: string;
  reason?: string;
  actor: 'admin' | 'system';
  refund?: boolean;
  restoreStock?: boolean;
}): Promise<CancelResult> {
  return executeOrderCancel({
    orderId: opts.orderId,
    reason: opts.reason || 'Returned by customer / RTO',
    actor: opts.actor,
    isReturn: true,
    refund: opts.refund,
    restoreStock: opts.restoreStock,
  });
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
