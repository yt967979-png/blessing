import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getDbClient } from '@/lib/db';
import { isOrderCancelled } from '@/lib/orderStatus';

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

  if (!isCapture) {
    return NextResponse.json({ ok: true, ignored: eventName || 'unknown' });
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
    let order: any = null;

    if (effectivePaymentId) {
      const byPay = await client.query(
        `SELECT id, order_number, order_status, payment_status, razorpay_payment_id, razorpay_order_id
         FROM orders WHERE razorpay_payment_id = $1 LIMIT 1`,
        [effectivePaymentId]
      );
      if (byPay.rows.length) order = byPay.rows[0];
    }

    if (!order && effectiveOrderId) {
      const byRzp = await client.query(
        `SELECT id, order_number, order_status, payment_status, razorpay_payment_id, razorpay_order_id
         FROM orders WHERE razorpay_order_id = $1 LIMIT 1`,
        [effectiveOrderId]
      );
      if (byRzp.rows.length) order = byRzp.rows[0];
    }

    if (order) {
      if (isOrderCancelled(order.order_status)) {
        return NextResponse.json({
          ok: true,
          orderId: order.order_number,
          action: 'noop_cancelled',
        });
      }

      const ps = String(order.payment_status || '').toLowerCase();
      const alreadyPaid =
        ps.includes('confirm') || ps.includes('paid') || ps.includes('success');
      const samePayment =
        effectivePaymentId &&
        String(order.razorpay_payment_id || '') === effectivePaymentId;

      if (alreadyPaid && (samePayment || !effectivePaymentId)) {
        return NextResponse.json({
          ok: true,
          orderId: order.order_number,
          action: 'noop_already_paid',
        });
      }

      // Heal: link payment_id if missing; mark Payment Confirmed
      await client.query(
        `UPDATE orders
         SET payment_status = 'Payment Confirmed',
             razorpay_payment_id = COALESCE(NULLIF(razorpay_payment_id, ''), $1),
             razorpay_order_id = COALESCE(NULLIF(razorpay_order_id, ''), $2),
             updated_at = NOW()
         WHERE id = $3`,
        [effectivePaymentId || null, effectiveOrderId || null, order.id]
      );

      if (effectivePaymentId) {
        const existingPay = await client.query(
          `SELECT id FROM payments WHERE payment_id = $1 LIMIT 1`,
          [effectivePaymentId]
        );
        if (!existingPay.rows.length) {
          await client.query(
            `INSERT INTO payments (id, order_id, payment_id, transaction_id, amount, status)
             VALUES ($1, $2, $3, $4, $5, 'SUCCESS')`,
            [
              `pay-wh-${Date.now()}`,
              order.id,
              effectivePaymentId,
              effectiveOrderId || effectivePaymentId,
              amountRupees || 0,
            ]
          );
        }
      }

      try {
        await client.query(
          `INSERT INTO order_timeline (id, order_id, status, remarks)
           VALUES ($1, $2, 'Payment Confirmed', $3)`,
          [
            `tl-wh-${Date.now()}`,
            order.id,
            `Razorpay webhook ${eventName}: payment confirmed${effectivePaymentId ? ` (${effectivePaymentId})` : ''}`,
          ]
        );
      } catch {
        /* timeline optional */
      }

      return NextResponse.json({
        ok: true,
        orderId: order.order_number,
        action: 'healed_payment_status',
      });
    }

    // Orphan capture — payment succeeded but no local order yet (or place-order never ran)
    console.warn(
      `[razorpay-webhook] Orphan ${eventName}: payment=${effectivePaymentId || 'n/a'} rzp_order=${effectiveOrderId || 'n/a'} amount=${amountRupees}`
    );

    if (effectivePaymentId) {
      const existingPay = await client.query(
        `SELECT id FROM payments WHERE payment_id = $1 LIMIT 1`,
        [effectivePaymentId]
      );
      if (!existingPay.rows.length) {
        // order_id NULL — admin can reconcile; place-order idempotency still keys on payment_id
        await client.query(
          `INSERT INTO payments (id, order_id, payment_id, transaction_id, amount, status)
           VALUES ($1, NULL, $2, $3, $4, 'ORPHAN_CAPTURED')`,
          [
            `pay-orphan-${Date.now()}`,
            effectivePaymentId,
            effectiveOrderId || effectivePaymentId,
            amountRupees || 0,
          ]
        ).catch((err: any) => {
          console.warn('[razorpay-webhook] Could not persist orphan payment row:', err?.message || err);
        });
      }
    }

    return NextResponse.json({
      ok: true,
      action: 'orphan_logged',
      paymentId: effectivePaymentId || null,
      razorpayOrderId: effectiveOrderId || null,
      note: 'No matching order — admin should reconcile. Customer place-order remains idempotent by payment_id.',
    });
  } catch (err: any) {
    console.error('[razorpay-webhook]', err?.message || err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}
