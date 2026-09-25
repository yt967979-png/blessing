import { NextRequest, NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { createHmac, timingSafeEqual } from 'crypto';
import { finalizeOrderFromPayment } from '@/lib/orderFinalizer';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/serverSecurity';

export const runtime = 'nodejs';

function verifySignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const payload = `${orderId}|${paymentId}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  try {
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(signature, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * GET /api/checkout/status?orderId=order_...
 *
 * Safe polling & active status resolver.
 * 1. Checks if order is already confirmed in DB.
 * 2. If not, actively reconciles with Razorpay's API in real time.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const rzpOrderId = searchParams.get('orderId') || searchParams.get('razorpayOrderId');
  if (!rzpOrderId) {
    return NextResponse.json({ error: 'orderId parameter is required' }, { status: 400 });
  }

  // 1. Check local orders table
  const localOrder = await queryDb(
    `SELECT id, order_number, total_amount, order_status, payment_status, razorpay_payment_id
     FROM orders
     WHERE razorpay_order_id = $1
     LIMIT 1`,
    [rzpOrderId]
  );

  if (localOrder.rows.length > 0) {
    const ord = localOrder.rows[0];
    return NextResponse.json({
      status: 'ORDER_CONFIRMED',
      orderId: ord.order_number,
      totalAmount: Number(ord.total_amount || 0),
      paymentStatus: ord.payment_status,
    });
  }

  // 2. Active verification against Razorpay API
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return NextResponse.json({ status: 'PAYMENT_PENDING', message: 'Awaiting webhook confirmation' });
  }

  try {
    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    const rzpRes = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(rzpOrderId)}/payments`, {
      headers: { Authorization: authHeader },
      cache: 'no-store',
    });

    if (rzpRes.ok) {
      const data = await rzpRes.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const capturedPay = items.find((p: any) => p.status === 'captured');

      if (capturedPay) {
        // Payment was captured on Razorpay! Finalize the order immediately.
        const result = await finalizeOrderFromPayment({
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: capturedPay.id,
          amountRupees: (capturedPay.amount || 0) / 100,
          source: 'client_verification',
        });

        if (result.ok) {
          return NextResponse.json({
            status: 'ORDER_CONFIRMED',
            orderId: result.orderNumber,
            totalAmount: result.totalAmount,
            paymentStatus: 'Payment Confirmed',
          });
        }
      }

      const failedPay = items.find((p: any) => p.status === 'failed');
      if (failedPay && items.length > 0 && !capturedPay) {
        return NextResponse.json({
          status: 'PAYMENT_FAILED',
          error: failedPay.error_description || 'Payment was declined by bank',
        });
      }
    }
  } catch (err: any) {
    console.warn('[checkout/status] Active verification error:', err?.message || err);
  }

  return NextResponse.json({
    status: 'PAYMENT_PENDING',
    message: 'Payment verification in progress...',
  });
}

/**
 * POST /api/checkout/status
 *
 * Client UI convenience callback:
 * Submits signature from Razorpay modal, verifies cryptographic signature,
 * and finalizes order server-side idempotently.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = body;

    if (!razorpayOrderId || !razorpayPaymentId) {
      return NextResponse.json({ error: 'Missing payment parameters' }, { status: 400 });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
    if (razorpaySignature && keySecret) {
      const isValid = verifySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature, keySecret);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid payment signature' }, { status: 400 });
      }
    }

    const result = await finalizeOrderFromPayment({
      razorpayOrderId,
      razorpayPaymentId,
      signature: razorpaySignature || null,
      source: 'client_verification',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      status: 'ORDER_CONFIRMED',
      orderId: result.orderNumber,
      totalAmount: result.totalAmount,
      isDuplicate: result.isDuplicate,
    });
  } catch (err: any) {
    console.error('[checkout/status POST]', err);
    return NextResponse.json({ error: 'Could not process order completion' }, { status: 500 });
  }
}
