import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import {
  getAuthenticatedUser,
  unauthorizedResponse,
  applyRateLimitAsync,
  clientIp,
} from '@/lib/serverSecurity';
import { priceCheckoutOrder } from '@/lib/checkoutPricing';
import { ensureCouponSchema } from '@/lib/coupons';
import { verifyRazorpayPayment } from '@/lib/orderPricing';

export async function POST(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Please login to pay.');

  const rl = await applyRateLimitAsync(`rzp:${session.userId}:${clientIp(request)}`, 15, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many payment attempts. Please wait.' }, { status: 429 });
  }

  let client: any = null;
  try {
    const body = await request.json();
    const {
      items,
      currency = 'INR',
      receipt,
      couponCode,
      freeBookId,
    } = body;

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json(
        {
          error:
            'Razorpay is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Railway after your domain is approved.',
          needsConfig: true,
        },
        { status: 503 }
      );
    }

    client = await getDbClient();
    await client.query('BEGIN');
    await ensureCouponSchema(client);

    const checkout = await priceCheckoutOrder(client, {
      items,
      userId: session.userId,
      couponCode: couponCode || null,
      freeBookId: freeBookId || null,
      lockCoupon: false,
    });
    await client.query('ROLLBACK');

    if (!checkout.ok) {
      return NextResponse.json({ error: checkout.error }, { status: checkout.status });
    }

    const amountRupees = checkout.totalAmount;
    if (amountRupees <= 0) {
      return NextResponse.json({ error: 'Invalid order amount.' }, { status: 400 });
    }

    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: Math.round(amountRupees * 100),
        currency,
        receipt: receipt || `rcpt_${Date.now()}`,
        payment_capture: 1,
        notes: {
          userId: session.userId,
          coupon: checkout.appliedCouponCode || '',
        },
      }),
    });

    const orderData = await res.json();
    if (!res.ok || !orderData.id) {
      console.error('Razorpay order creation failed:', orderData);
      return NextResponse.json({ error: 'Failed to create Razorpay order.' }, { status: 502 });
    }

    return NextResponse.json({
      id: orderData.id,
      amount: orderData.amount,
      currency: orderData.currency,
      key: keyId,
      expectedRupees: amountRupees,
      subtotal: checkout.subtotal,
      discountAmount: checkout.discountAmount,
      couponCode: checkout.appliedCouponCode,
    });
  } catch (err: any) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
    }
    return NextResponse.json({ error: err.message || 'Payment error' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

export async function PUT(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Please login.');

  let client: any = null;
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      expectedRupees,
      items,
      couponCode,
      freeBookId,
    } = await request.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ verified: false, error: 'Missing payment fields.' }, { status: 400 });
    }

    let amount = Number(expectedRupees || 0);
    if ((!amount || amount <= 0) && Array.isArray(items)) {
      client = await getDbClient();
      await client.query('BEGIN');
      await ensureCouponSchema(client);
      const checkout = await priceCheckoutOrder(client, {
        items,
        userId: session.userId,
        couponCode: couponCode || null,
        freeBookId: freeBookId || null,
        lockCoupon: false,
      });
      await client.query('ROLLBACK');
      if (checkout.ok) amount = checkout.totalAmount;
    }

    if (!amount || amount <= 0) {
      return NextResponse.json({ verified: false, error: 'Missing expected amount.' }, { status: 400 });
    }

    const verified = await verifyRazorpayPayment({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      expectedRupees: amount,
    });

    if (!verified.ok) {
      return NextResponse.json({ verified: false, error: verified.error }, { status: 400 });
    }

    return NextResponse.json({ verified: true, expectedRupees: amount });
  } catch (err: any) {
    return NextResponse.json({ verified: false, error: err.message }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
