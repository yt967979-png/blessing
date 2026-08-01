import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
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

    await ensureCouponSchema(queryDb as any);

    const checkout = await priceCheckoutOrder(queryDb, {
      items,
      userId: session.userId,
      couponCode: couponCode || null,
      freeBookId: freeBookId || null,
      lockCoupon: false,
    });

    if (!checkout.ok) {
      return NextResponse.json({ error: checkout.error }, { status: checkout.status });
    }

    const amountInPaisa = Math.round(checkout.totalAmount * 100);
    if (amountInPaisa < 100) {
      return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });
    }

    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: amountInPaisa,
        currency,
        receipt: receipt || `rcpt_${Date.now()}`,
        notes: {
          userId: session.userId,
          couponCode: checkout.appliedCouponCode || '',
        },
      }),
    });

    const rzpData = await rzpRes.json();
    if (!rzpRes.ok) {
      console.error('[Razorpay Order Error]', rzpData);
      return NextResponse.json(
        { error: rzpData.error?.description || 'Razorpay order creation failed.' },
        { status: rzpRes.status }
      );
    }

    return NextResponse.json({
      orderId: rzpData.id,
      amount: rzpData.amount,
      currency: rzpData.currency,
      keyId,
      subtotal: checkout.subtotal,
      discountAmount: checkout.discountAmount,
      totalAmount: checkout.totalAmount,
      appliedCouponCode: checkout.appliedCouponCode,
    });
  } catch (err: any) {
    console.error('[Razorpay Route Error]', err);
    return NextResponse.json({ error: err.message || 'Payment initiation failed' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Please login to verify payment.');

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
      await ensureCouponSchema(queryDb as any);
      const checkout = await priceCheckoutOrder(queryDb, {
        items,
        userId: session.userId,
        couponCode: couponCode || null,
        freeBookId: freeBookId || null,
        lockCoupon: false,
      });
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
  }
}
