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
import { recordSystemError } from '@/lib/errorMonitor';

export async function POST(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Please login to pay.');

  const rl = await applyRateLimitAsync(`rzp:${session.userId}:${clientIp(request)}`, 15, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many payment attempts. Please wait.' }, { status: 429 });
  }

  try {
    const { items, couponCode, receipt, address } = await request.json().catch(() => ({}));
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Cart is empty' }, { status: 400 });
    }

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
      couponCode,
    });

    if (!checkout.ok) {
      return NextResponse.json({ error: checkout.error }, { status: checkout.status });
    }

    const amountInPaisa = Math.round(checkout.totalAmount * 100);
    if (amountInPaisa < 100) {
      return NextResponse.json(
        {
          error:
            'Minimum transaction amount for Razorpay is ₹1.00 (100 paise). Orders below ₹1 cannot be processed through online payment.',
        },
        { status: 400 }
      );
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
          currency: 'INR',
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

    // Persist immutable server-authoritative checkout session snapshot
    try {
      let resolvedAddress = address || null;
      if (!resolvedAddress) {
        const addrRes = await queryDb(
          `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC LIMIT 1`,
          [session.userId]
        );
        if (addrRes.rows.length > 0) {
          const a = addrRes.rows[0];
          resolvedAddress = {
            name: a.full_name,
            phone: a.phone,
            alternatePhone: a.alternate_phone || '',
            address: a.address_line1 + (a.address_line2 ? ', ' + a.address_line2 : ''),
            city: a.city,
            pincode: a.pincode,
          };
        }
      }

      const cartSnapshot = checkout.verifiedItems.map((i: any) => ({
        id: i.id,
        title: i.title,
        price: i.price,
        qty: i.qty,
        subtotal: i.subtotal,
      }));
      const priceSnapshot = {
        subtotal: checkout.subtotal,
        discountAmount: checkout.discountAmount,
        shippingFee: checkout.shippingFee,
        totalAmount: checkout.totalAmount,
      };

      const sessionId = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      await queryDb(
        `INSERT INTO checkout_sessions (
          id, user_id, razorpay_order_id, hold_group_id, status,
          cart_snapshot, price_snapshot, shipping_address,
          subtotal, discount, shipping_fee, total_amount,
          coupon_code, coupon_id
        ) VALUES ($1, $2, $3, $4, 'PAYMENT_PENDING', $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (razorpay_order_id) DO UPDATE SET
          cart_snapshot = EXCLUDED.cart_snapshot,
          price_snapshot = EXCLUDED.price_snapshot,
          shipping_address = EXCLUDED.shipping_address,
          total_amount = EXCLUDED.total_amount,
          updated_at = NOW()`,
        [
          sessionId,
          session.userId,
          rzpData.id,
          hold.holdGroupId,
          JSON.stringify(cartSnapshot),
          JSON.stringify(priceSnapshot),
          JSON.stringify(resolvedAddress || {}),
          checkout.subtotal,
          checkout.discountAmount,
          checkout.shippingFee,
          checkout.totalAmount,
          checkout.appliedCoupon?.code || null,
          checkout.appliedCoupon?.id || null,
        ]
      );
    } catch (csErr: any) {
      console.warn('[razorpay] Could not write checkout_sessions snapshot:', csErr?.message || csErr);
    }

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
    return NextResponse.json({ error: 'Payment initiation failed. Please try again later.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Please login to verify payment.');

  try {
    const body = await request.json().catch(() => ({}));
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      items,
      couponCode,
    } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ verified: false, error: 'Missing payment fields.' }, { status: 400 });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ verified: false, error: 'Cart is required to verify payment.' }, { status: 400 });
    }

    const checkout = await priceCheckoutOrder(queryDb, {
      items,
      userId: session.userId,
      couponCode,
    });
    if (!checkout.ok) {
      return NextResponse.json({ verified: false, error: checkout.error }, { status: checkout.status });
    }
    const amount = checkout.totalAmount;

    if (!amount || amount <= 0) {
      return NextResponse.json({ verified: false, error: 'Missing expected amount.' }, { status: 400 });
    }

    const verified = await verifyRazorpayPayment({
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      expectedRupees: amount,
      userId: session.userId,
    });

    if (!verified.ok) {
      void recordSystemError({
        endpoint: '/api/razorpay [PUT verify]',
        status: 400,
        message: `Payment signature verification failed: ${verified.error}`,
        isPaymentFailure: true,
      });
      return NextResponse.json({ verified: false, error: verified.error }, { status: 400 });
    }

    return NextResponse.json({ verified: true, expectedRupees: amount });
  } catch (err: any) {
    void recordSystemError({
      endpoint: '/api/razorpay',
      status: 500,
      message: err.message || 'Razorpay order error',
    });
    return NextResponse.json({ verified: false, error: 'Payment verification failed. Please contact support.' }, { status: 500 });
  }
}
