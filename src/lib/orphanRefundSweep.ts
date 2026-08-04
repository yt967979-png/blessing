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

export async function refundStaleOrphanCaptures(maxAgeMinutes = 10): Promise<number> {
  let refunded = 0;
  try {
    const stale = await queryDb(
      `SELECT id, payment_id FROM payments
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

      const refund = await refundRazorpayPayment({ paymentId });
      if (refund.ok) {
        await queryDb(`UPDATE payments SET status = 'REFUNDED' WHERE id = $1`, [row.id]);
        refunded++;
        console.warn(
          `[orphan-refund] Auto-refunded stale orphan capture ${paymentId}. refundId=${refund.refundId}`
        );
      } else {
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
