/**
 * Background Payment Reconciler (Layer 3 Safety Net)
 *
 * Periodically reconciles in-flight checkout_sessions against Razorpay API.
 * Ensures that even if:
 * 1. Webhook was dropped by network
 * 2. Customer closed mobile browser after UPI payment
 * 3. Client callback never ran
 *
 * The payment is automatically detected on Razorpay, the order is created,
 * and the customer gets their books!
 */

import { queryDb } from '@/lib/db';
import { finalizeOrderFromPayment } from '@/lib/orderFinalizer';
import { releaseStockHolds } from '@/lib/stockHold';

export async function reconcilePendingCheckoutSessions(
  minAgeMinutes = 2,
  maxAgeMinutes = 30
): Promise<{ reconciled: number; expired: number; errors: number }> {
  let reconciled = 0;
  let expired = 0;
  let errors = 0;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return { reconciled: 0, expired: 0, errors: 0 };

  const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  try {
    // Find sessions in PAYMENT_PENDING between minAge and maxAge
    const pendingSessions = await queryDb(
      `SELECT cs.*
       FROM checkout_sessions cs
       WHERE cs.status = 'PAYMENT_PENDING'
         AND cs.created_at <= NOW() - ($1::int * INTERVAL '1 minute')
         AND cs.created_at >= NOW() - ($2::int * INTERVAL '1 minute')
       ORDER BY cs.created_at ASC
       LIMIT 25`,
      [minAgeMinutes, maxAgeMinutes]
    );

    for (const session of pendingSessions.rows) {
      const rzpOrderId = session.razorpay_order_id;
      if (!rzpOrderId) continue;

      // 1. Race guard: check if already fulfilled in orders
      const orderExists = await queryDb(
        `SELECT id, order_number FROM orders WHERE razorpay_order_id = $1 LIMIT 1`,
        [rzpOrderId]
      );
      if (orderExists.rows.length > 0) {
        await queryDb(
          `UPDATE checkout_sessions SET status = 'ORDER_CONFIRMED', order_id = $1, updated_at = NOW() WHERE id = $2`,
          [orderExists.rows[0].id, session.id]
        ).catch(() => {});
        continue;
      }

      try {
        // 2. Query Razorpay API for order's actual payment state
        const rzpRes = await fetch(
          `https://api.razorpay.com/v1/orders/${encodeURIComponent(rzpOrderId)}/payments`,
          {
            headers: { Authorization: authHeader },
            cache: 'no-store',
          }
        );

        if (!rzpRes.ok) {
          errors++;
          continue;
        }

        const data = await rzpRes.json();
        const payments = Array.isArray(data.items) ? data.items : [];
        const capturedPay = payments.find((p: any) => p.status === 'captured');

        if (capturedPay) {
          // PAYMENT WAS CAPTURED! Finalize order now!
          const result = await finalizeOrderFromPayment({
            razorpayOrderId: rzpOrderId,
            razorpayPaymentId: capturedPay.id,
            amountRupees: (capturedPay.amount || 0) / 100,
            source: 'background_reconciliation',
          });

          if (result.ok) {
            reconciled++;
            console.log(
              `[paymentReconciler] Auto-reconciled captured payment ${capturedPay.id} for order ${result.orderNumber}`
            );
          } else {
            console.warn(
              `[paymentReconciler] Finalization failed for captured payment ${capturedPay.id}: ${result.error}`
            );
          }
        } else {
          // If all payments failed or order is older than 20 minutes without payment
          const allFailed = payments.length > 0 && payments.every((p: any) => p.status === 'failed');
          const isStale = new Date(session.created_at).getTime() < Date.now() - 20 * 60 * 1000;

          if (allFailed || isStale) {
            // Expire session and release stock holds so inventory is freed
            await queryDb(
              `UPDATE checkout_sessions SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
              [session.id]
            );
            if (session.hold_group_id) {
              await releaseStockHolds({ holdGroupId: session.hold_group_id }, 'reconciler_session_expired');
            }
            expired++;
          }
        }
      } catch (sessionErr: any) {
        errors++;
        console.warn(`[paymentReconciler] Error checking order ${rzpOrderId}:`, sessionErr?.message || sessionErr);
      }
    }
  } catch (err: any) {
    console.error('[paymentReconciler] Sweep error:', err?.message || err);
  }

  return { reconciled, expired, errors };
}
