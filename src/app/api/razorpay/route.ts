import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import {
  getAuthenticatedUser,
  unauthorizedResponse,
  applyRateLimitAsync,
  clientIp,
} from '@/lib/serverSecurity';
import { priceCheckoutOrder } from '@/lib/checkoutPricing';
import { verifyRazorpayPayment } from '@/lib/orderPricing';
import { createStockHolds, attachRazorpayOrderId, releaseStockHolds, STOCK_HOLD_TTL_MINUTES } from '@/lib/stockHold';

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
    } = body;

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      return NextResponse.json(
        {
          error:
            'Razorpay is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the server env.',
          needsConfig: true,
        },
        { status: 503 }
      );
    }

    const checkout = await priceCheckoutOrder(queryDb, {
      items,
      userId: session.userId,
    });

    if (!checkout.ok) {
      return NextResponse.json({ error: checkout.error }, { status: checkout.status });
    }

    const amountInPaisa = Math.round(checkout.totalAmount * 100);
    if (amountInPaisa < 100) {
      return NextResponse.json({ error: 'Invalid order total' }, { status: 400 });
    }

    // Reserve stock the instant we're about to send the customer to Razorpay —
    // decrements books.stock now (visible everywhere: catalog, cart, other
    // shoppers' checkout) so nobody else can buy the same units while this
    // customer is on the payment sheet. Released automatically if they don't pay.
    const hold = await createStockHolds({
      items: checkout.verifiedItems.map((i: any) => ({ id: i.id, qty: i.qty, title: i.title })),
      userId: session.userId,
    });
    if (!hold.ok) {
      return NextResponse.json({ error: hold.error }, { status: hold.status });
    }

    const authHeader = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
    let rzpRes: Response;
    let rzpData: any;
    try {
      rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
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
            holdGroupId: hold.holdGroupId,
          },
        }),
      });
      rzpData = await rzpRes.json();
    } catch (fetchErr: any) {
      // Razorpay unreachable — don't leave stock reserved for an order that never happened.
      await releaseStockHolds({ holdGroupId: hold.holdGroupId }, 'razorpay_create_network_error');
      return NextResponse.json(
        { error: fetchErr?.message || 'Could not reach Razorpay. Please try again.' },
        { status: 502 }
      );
    }

    if (!rzpRes.ok) {
      console.error('[Razorpay Order Error]', rzpData);
      await releaseStockHolds({ holdGroupId: hold.holdGroupId }, 'razorpay_create_failed');
      return NextResponse.json(
        { error: rzpData.error?.description || 'Razorpay order creation failed.' },
        { status: rzpRes.status }
      );
    }

    // Link the hold group to the real Razorpay order id so confirm/release
    // (order placement, webhook, TTL sweep) can find it going forward.
    await attachRazorpayOrderId(hold.holdGroupId, rzpData.id);

    return NextResponse.json({
      orderId: rzpData.id,
      id: rzpData.id,
      amount: rzpData.amount,
      currency: rzpData.currency,
      key: keyId,
      keyId,
      expectedRupees: checkout.totalAmount,
      subtotal: checkout.subtotal,
      discountAmount: checkout.discountAmount,
      totalAmount: checkout.totalAmount,
      stockHoldMinutes: STOCK_HOLD_TTL_MINUTES,
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
    } = await request.json();

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ verified: false, error: 'Missing payment fields.' }, { status: 400 });
    }

    let amount = Number(expectedRupees || 0);
    if ((!amount || amount <= 0) && Array.isArray(items)) {
      const checkout = await priceCheckoutOrder(queryDb, {
        items,
        userId: session.userId,
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
