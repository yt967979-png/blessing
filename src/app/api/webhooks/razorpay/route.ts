import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { isOrderCancelled } from '@/lib/orderStatus';
import { refundRazorpayPayment } from '@/lib/razorpayRefund';
import { confirmStockHolds, releaseStockHolds } from '@/lib/stockHold';
import { recordSystemError } from '@/lib/errorMonitor';
import { finalizeOrderFromPayment } from '@/lib/orderFinalizer';

/**
 * Grace window before an orphan capture (payment succeeded, no matching order
 * found yet) is treated as safe to auto-refund. Place-order runs synchronously
 * right after the client's Razorpay success callback, so a genuine in-flight
 * order normally lands within seconds — refunding instantly here would risk
 * cancelling money for an order that's about to be created. Only payments
 * that are still orphaned once they're older than this are refunded.
 */
const ORPHAN_REFUND_GRACE_MS = 5 * 60 * 1000;

/**
 * Razorpay webhooks — confirms capture / heals payment_status.
 *
 * Production: set RAZORPAY_WEBHOOK_SECRET from Razorpay Dashboard →
 * Settings → Webhooks (signing secret). Signature header: X-Razorpay-Signature
 * = HMAC-SHA256(raw body, webhook secret).
 *
 * Place-order remains idempotent on razorpay_payment_id; this route reduces
 * paid-but-no-order risk by marking matching pending orders Paid and logging orphans.
 */

export const runtime = 'nodejs';

function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(String(signature || ''), 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function paymentEntity(payload: any): any | null {
  return (
    payload?.payload?.payment?.entity ||
    payload?.payload?.order?.entity ||
    null
  );
}

export async function POST(request: Request) {
  const webhookSecret = String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    console.warn(
      '[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not set — rejecting. Add the signing secret from Razorpay Dashboard → Webhooks.'
    );
    return NextResponse.json(
      {
        error:
          'Webhook secret not configured. Set RAZORPAY_WEBHOOK_SECRET in /etc/blessing.env (from Razorpay Dashboard → Webhooks).',
      },
      { status: 503 }
    );
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-razorpay-signature') || '';
  if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
    console.warn('[razorpay-webhook] SECURITY ALERT: Invalid webhook signature received');
    void recordSystemError({
      endpoint: '/api/webhooks/razorpay',
      status: 400,
      message: 'Invalid Razorpay webhook signature header received',
      isWebhookFailure: true,
    });
    try {
      const { queryDb } = await import('@/lib/db');
      await queryDb(
        `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details)
         VALUES ($1, 'system', 'WEBHOOK_SIGNATURE_MISMATCH', 'webhook', $2, $3)`,
        [
          `audit-sig-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          signature.slice(0, 16) || 'none',
          JSON.stringify({
            ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
            signatureHeaderLength: signature.length,
            bodyLength: rawBody.length,
            timestamp: new Date().toISOString(),
          }),
        ]
      ).catch(() => {});
    } catch (_) {}
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const eventName = String(event?.event || '');
  const isCapture =
    eventName === 'payment.captured' ||
    eventName === 'order.paid' ||
    eventName === 'payment.authorized';
  const isFailure = eventName === 'payment.failed';
  const isRefund =
    eventName === 'refund.processed' ||
    eventName === 'refund.created' ||
    eventName === 'refund.speed_changed' ||
    eventName === 'payment.refunded';

  if (!isCapture && !isFailure && !isRefund) {
    return NextResponse.json({ ok: true, ignored: eventName || 'unknown' });
  }

  if (isFailure) {
    // Definitive "did not pay" signal — release the reservation immediately
    // instead of waiting for the TTL sweeper. Idempotent (no-ops if the hold
    // is already released/confirmed).
    const failedEntity = event?.payload?.payment?.entity || null;
    const failedOrderId = String(failedEntity?.order_id || '').trim();
    if (failedOrderId) {
      void recordSystemError({
        endpoint: '/api/webhooks/razorpay',
        status: 400,
        message: `Payment failed for Razorpay order ${failedOrderId}: ${failedEntity?.error_description || 'Card/UPI declined by bank'}`,
        isPaymentFailure: true,
      });
      try {
        const result = await releaseStockHolds({ razorpayOrderId: failedOrderId }, 'payment_failed_webhook');
        return NextResponse.json({
          ok: true,
          action: result.releasedCount > 0 ? 'released_on_failure' : 'noop_already_settled',
          razorpayOrderId: failedOrderId,
        });
      } catch (err: any) {
        console.error('[razorpay-webhook] release on failure error:', err?.message || err);
        return NextResponse.json({ error: 'Release failed' }, { status: 500 });
      }
    }
    return NextResponse.json({ ok: true, note: 'payment.failed with no order id' });
  }

  const entity = paymentEntity(event);
  const paymentId = String(entity?.id || entity?.payment_id || '').trim();
  const razorpayOrderId = String(
    entity?.order_id || (eventName === 'order.paid' ? entity?.id : '') || ''
  ).trim();
  const amountPaise = Number(entity?.amount || 0);
  const amountRupees = amountPaise > 0 ? amountPaise / 100 : 0;

  // order.paid nests differently — prefer payment id from payment entity when present
  const payFromOrderPaid =
    eventName === 'order.paid'
      ? String(event?.payload?.payment?.entity?.id || paymentId || '').trim()
      : paymentId;
  const effectivePaymentId = payFromOrderPaid || paymentId;
  const effectiveOrderId =
    eventName === 'order.paid'
      ? String(event?.payload?.order?.entity?.id || razorpayOrderId || '').trim()
      : razorpayOrderId;

  if (!effectivePaymentId && !effectiveOrderId) {
    return NextResponse.json({ ok: true, note: 'No payment/order id in payload' });
  }

  const client = await getDbClient();
  if (!client) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
  }

  try {
    const rzpEventId = String(event?.id || event?.event_id || '');
    if (rzpEventId) {
      try {
        const dupCheck = await client.query(
          `INSERT INTO webhook_events (id, event_id, event_type, payload)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (event_id) DO NOTHING
           RETURNING id`,
          [
            `whe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            rzpEventId,
            eventName,
            JSON.stringify(event),
          ]
        );
        if (dupCheck.rowCount === 0) {
          return NextResponse.json({ ok: true, action: 'noop_duplicate_webhook', eventId: rzpEventId });
        }
      } catch (e: any) {
        console.warn('[razorpay-webhook] webhook_events log skipped:', e?.message);
      }
    }

    if (isRefund) {
      const refundPayloadEntity = event?.payload?.refund?.entity || paymentEntity(event);
      const refundPayId = String(refundPayloadEntity?.payment_id || entity?.id || effectivePaymentId || '').trim();
      const refundOrdId = String(refundPayloadEntity?.order_id || effectiveOrderId || '').trim();
      const refundId = String(refundPayloadEntity?.id || '').trim();

      let targetOrderNumber: string | null = null;
      if (refundPayId) {
        const byPay = await client.query(
          `SELECT order_number, order_status FROM orders WHERE razorpay_payment_id = $1 LIMIT 1`,
          [refundPayId]
        );
        if (byPay.rows.length && !isOrderCancelled(byPay.rows[0].order_status)) {
          targetOrderNumber = byPay.rows[0].order_number;
        }
      }
      if (!targetOrderNumber && refundOrdId) {
        const byOrd = await client.query(
          `SELECT order_number, order_status FROM orders WHERE razorpay_order_id = $1 LIMIT 1`,
          [refundOrdId]
        );
        if (byOrd.rows.length && !isOrderCancelled(byOrd.rows[0].order_status)) {
          targetOrderNumber = byOrd.rows[0].order_number;
        }
      }

      if (targetOrderNumber) {
        releaseDbClient(client);
        const { executeOrderCancel } = await import('@/lib/orderCancel');
        const cancelResult = await executeOrderCancel({
          orderId: targetOrderNumber,
          reason: `Reconciled via Razorpay webhook: ${eventName}${refundId ? ` (ID: ${refundId})` : ''}`,
          actor: 'system',
        });
        return NextResponse.json({
          ok: true,
          action: 'refund_reconciled_and_cancelled',
          orderNumber: targetOrderNumber,
          cancelResult,
        });
      }

      // Mark payment row as REFUNDED if matching payment_id exists
      if (refundPayId) {
        await client.query(`UPDATE payments SET status = 'REFUNDED' WHERE payment_id = $1`, [refundPayId]);
        if (refundOrdId) {
          try {
            await releaseStockHolds({ razorpayOrderId: refundOrdId, includeConfirmed: true }, 'refund_webhook_reconciled');
          } catch (_) {}
        }
      }

      releaseDbClient(client);
      return NextResponse.json({ ok: true, action: 'refund_processed_recorded', paymentId: refundPayId });
    }

    // Payment is captured — finalize the order through the server-authoritative engine
    releaseDbClient(client);

    const finalization = await finalizeOrderFromPayment({
      razorpayOrderId: effectiveOrderId,
      razorpayPaymentId: effectivePaymentId,
      amountRupees,
      source: 'webhook',
    });

    if (finalization.ok) {
      return NextResponse.json({
        ok: true,
        action: finalization.isDuplicate ? 'noop_already_finalized' : 'order_finalized',
        orderNumber: finalization.orderNumber,
        orderId: finalization.orderId,
      });
    }

    console.warn(
      `[razorpay-webhook] Orphan ${eventName}: payment=${effectivePaymentId || 'n/a'} rzp_order=${effectiveOrderId || 'n/a'} amount=${amountRupees} - ${finalization.error}`
    );

    return NextResponse.json({
      ok: true,
      action: 'orphan_logged',
      paymentId: effectivePaymentId || null,
      razorpayOrderId: effectiveOrderId || null,
      note: finalization.error,
    });
  } catch (err: any) {
    console.error('[razorpay-webhook]', err?.message || err);
    try {
      if (client) {
        const failedId = `fwe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await client.query(
          `INSERT INTO failed_webhook_events (id, event_id, event_type, payload, error_message, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [
            failedId,
            String(event?.id || event?.event_id || 'unknown'),
            String(event?.event || 'unknown'),
            JSON.stringify(event || {}),
            String(err?.message || err),
          ]
        );
      }
    } catch (dbErr: any) {
      console.error('[razorpay-webhook] could not log to failed_webhook_events:', dbErr?.message);
    }
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
