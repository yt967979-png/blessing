/**
 * Heal captured Razorpay payments that never got attached to an order
 * (webhook "orphan" rows — see src/app/api/webhooks/razorpay/route.ts).
 *
 * This is the primary safety net for the money-safety gap where two
 * customers race for the same last stock: the loser's payment gets captured
 * by Razorpay, but our checkout aborts (stock 409) before an order exists.
 * POST /api/orders and the webhook both refund inline when they can, but if
 * both miss (e.g. server crash mid-request), this sweep catches it.
 *
 * Grace period avoids refunding a payment whose order is still being created
 * by an in-flight checkout request.
 */
import { queryDb } from '@/lib/db';
import { refundRazorpayPayment } from '@/lib/razorpayRefund';
import { releaseStockHolds } from '@/lib/stockHold';

export async function refundStaleOrphanCaptures(maxAgeMinutes = 10): Promise<number> {
  let refunded = 0;
  try {
    const stale = await queryDb(
      `SELECT id, payment_id, transaction_id FROM payments
       WHERE status = 'ORPHAN_CAPTURED'
         AND order_id IS NULL
         AND paid_at < NOW() - ($1::int * INTERVAL '1 minute')
       ORDER BY paid_at ASC
       LIMIT 20`,
      [maxAgeMinutes]
    );

    for (const row of stale.rows) {
      const paymentId = String(row.payment_id || '').trim();
      if (!paymentId) continue;

      // Race guard: an order may have been created for this payment_id since
      // it was first logged as an orphan (slow request that finally committed).
      const matched = await queryDb(
        `SELECT id FROM orders WHERE razorpay_payment_id = $1 LIMIT 1`,
        [paymentId]
      );
      if (matched.rows.length) {
        await queryDb(`UPDATE payments SET status = 'SUCCESS', order_id = $2 WHERE id = $1`, [
          row.id,
          matched.rows[0].id,
        ]).catch(() => {});
        continue;
      }

      // ATOMIC CLAIM: Only the single worker that successfully updates status from 'ORPHAN_CAPTURED'
      // to 'REFUNDING' is authorized to invoke the external Razorpay refund API.
      const claimed = await queryDb(
        `UPDATE payments
         SET status = 'REFUNDING', updated_at = NOW()
         WHERE id = $1 AND status = 'ORPHAN_CAPTURED'
         RETURNING id`,
        [row.id]
      );

      if (claimed.rowCount === 0) {
        // Another worker or process already claimed this orphan capture.
        continue;
      }

      const refund = await refundRazorpayPayment({ paymentId });
      if (refund.ok) {
        await queryDb(`UPDATE payments SET status = 'REFUNDED' WHERE id = $1`, [row.id]);
        const rzpOrderId = String(row.transaction_id || '').trim();
        if (rzpOrderId && rzpOrderId !== paymentId) {
          try {
            await releaseStockHolds({ razorpayOrderId: rzpOrderId, includeConfirmed: true }, 'orphan_sweep_refunded');
          } catch (e: any) {
            console.warn('[orphan-refund] releaseStockHolds failed:', e?.message || e);
          }
        }
        refunded++;
        console.warn(
          `[orphan-refund] Auto-refunded stale orphan capture ${paymentId}. refundId=${refund.refundId}`
        );
      } else {
        // Revert to ORPHAN_CAPTURED so it is not left permanently stuck in REFUNDING and can be retried.
        await queryDb(`UPDATE payments SET status = 'ORPHAN_CAPTURED' WHERE id = $1 AND status = 'REFUNDING'`, [row.id]).catch(() => {});
        console.error(
          `[orphan-refund] CRITICAL: could not auto-refund stale orphan capture ${paymentId}: ${refund.error}`
        );
      }
    }
  } catch (e: any) {
    console.warn('[orphan-refund] sweep failed:', e?.message || e);
  }
  return refunded;
}

/**
 * Auto-reconcile orders where a Razorpay refund was processed or recorded,
 * but the database order status was not finalized as 'Cancelled' (e.g. crash
 * mid-operation and admin never manually retried).
 *
 * Restores inventory stock, sets order_status = 'Cancelled', records audit logs,
 * and notifies the customer automatically.
 */
export async function reconcileUnfinalizedRefunds(): Promise<number> {
  let reconciled = 0;
  try {
    const unfinalized = await queryDb(
      `SELECT o.order_number, o.id, o.razorpay_payment_id, o.razorpay_refund_id
       FROM orders o
       WHERE o.order_status NOT ILIKE '%Cancel%'
         AND (
           (o.razorpay_refund_id IS NOT NULL AND o.razorpay_refund_id <> '')
           OR EXISTS (
             SELECT 1 FROM payments p
             WHERE (p.order_id = o.id OR p.payment_id = o.razorpay_payment_id)
               AND p.status = 'REFUNDED'
           )
         )
       LIMIT 20`
    );

    for (const row of unfinalized.rows) {
      const { executeOrderCancel } = await import('@/lib/orderCancel');
      const result = await executeOrderCancel({
        orderId: row.order_number || row.id,
        reason: 'Auto-reconciled: refund confirmed on gateway/ledger',
        actor: 'system',
      });
      if (result.ok && !result.duplicate) {
        reconciled++;
        console.log(`[reconcile-refund] Auto-reconciled & cancelled order ${row.order_number}`);
      }
    }
  } catch (e: any) {
    console.warn('[reconcile-refund] sweep failed:', e?.message || e);
  }
  return reconciled;
}

/**
 * Automatically re-processes dead-lettered webhook events from failed_webhook_events
 * using exponential backoff (2 min, 4 min, 8 min, 16 min).
 * Retries up to 5 times before marking 'dead_letter'.
 */
export async function retryFailedWebhookEvents(): Promise<{ replayed: number; resolved: number }> {
  let replayed = 0;
  let resolved = 0;
  try {
    const candidates = await queryDb(
      `SELECT id, event_id, event_type, payload, retry_count
       FROM failed_webhook_events
       WHERE status = 'pending'
         AND retry_count < 5
         AND updated_at < NOW() - (POWER(2, retry_count) * INTERVAL '2 minutes')
       ORDER BY updated_at ASC
       LIMIT 10`
    );

    for (const row of candidates.rows) {
      replayed++;
      const event = row.payload;
      const eventType = String(row.event_type || '');

      let success = false;
      try {
        if (eventType === 'payment.captured' || eventType === 'order.paid' || eventType === 'payment.authorized') {
          const entity = event?.payload?.payment?.entity || event?.payload?.order?.entity;
          const payId = String(entity?.id || entity?.payment_id || '').trim();
          const rzpOrdId = String(entity?.order_id || '').trim();

          if (rzpOrdId) {
            const { confirmStockHolds } = await import('@/lib/stockHold');
            await confirmStockHolds(rzpOrdId);
          }

          if (payId) {
            const ord = await queryDb(
              `SELECT id FROM orders WHERE razorpay_payment_id = $1 OR razorpay_order_id = $2 LIMIT 1`,
              [payId, rzpOrdId || null]
            );
            if (ord.rows.length) {
              await queryDb(
                `UPDATE orders SET payment_status = 'Payment Confirmed', updated_at = NOW() WHERE id = $1`,
                [ord.rows[0].id]
              );
            }
          }
          success = true;
        } else if (eventType.includes('refund')) {
          const refundEntity = event?.payload?.refund?.entity || event?.payload?.payment?.entity;
          const refundPayId = String(refundEntity?.payment_id || '').trim();
          const refundOrdId = String(refundEntity?.order_id || '').trim();

          let targetOrderNumber: string | null = null;
          if (refundPayId) {
            const byPay = await queryDb(
              `SELECT order_number, order_status FROM orders WHERE razorpay_payment_id = $1 LIMIT 1`,
              [refundPayId]
            );
            if (byPay.rows.length) targetOrderNumber = byPay.rows[0].order_number;
          }
          if (!targetOrderNumber && refundOrdId) {
            const byOrd = await queryDb(
              `SELECT order_number, order_status FROM orders WHERE razorpay_order_id = $1 LIMIT 1`,
              [refundOrdId]
            );
            if (byOrd.rows.length) targetOrderNumber = byOrd.rows[0].order_number;
          }

          if (targetOrderNumber) {
            const { executeOrderCancel } = await import('@/lib/orderCancel');
            await executeOrderCancel({
              orderId: targetOrderNumber,
              reason: 'Replayed from dead-letter webhook queue',
              actor: 'system',
            });
          }
          success = true;
        } else if (eventType === 'payment.failed') {
          const failedEntity = event?.payload?.payment?.entity;
          const failedOrderId = String(failedEntity?.order_id || '').trim();
          if (failedOrderId) {
            const { releaseStockHolds } = await import('@/lib/stockHold');
            await releaseStockHolds({ razorpayOrderId: failedOrderId }, 'dead_letter_replayed');
          }
          success = true;
        } else {
          // Unknown / unhandled event type — mark resolved so it stops cycling
          success = true;
        }
      } catch (replayErr: any) {
        console.warn(`[dead-letter-replay] retry failed for ${row.id}:`, replayErr?.message || replayErr);
      }

      if (success) {
        resolved++;
        await queryDb(
          `UPDATE failed_webhook_events SET status = 'resolved', updated_at = NOW() WHERE id = $1`,
          [row.id]
        );
      } else {
        const nextRetry = (row.retry_count || 0) + 1;
        const newStatus = nextRetry >= 5 ? 'dead_letter' : 'pending';
        await queryDb(
          `UPDATE failed_webhook_events SET retry_count = $1, status = $2, updated_at = NOW() WHERE id = $3`,
          [nextRetry, newStatus, row.id]
        );
      }
    }
  } catch (e: any) {
    console.warn('[dead-letter-replay] sweep error:', e?.message || e);
  }
  return { replayed, resolved };
}
