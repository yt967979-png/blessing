import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  verifyAdminRequest,
  unauthorizedResponse,
  forbiddenResponse,
  applyRateLimitAsync,
  clientIp,
} from '@/lib/serverSecurity';
import { executeOrderCancel } from '@/lib/orderCancel';

/**
 * Cancel order — admin only.
 * Paid Razorpay orders: Razorpay refund is attempted first; cancel aborts if refund fails.
 * Customers cannot cancel (403).
 */
export async function POST(request: NextRequest) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Sign in required.');

  const rl = await applyRateLimitAsync(`cancel:${session.userId}:${clientIp(request)}`, 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many cancel attempts. Wait a minute.' }, { status: 429 });
  }

  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) {
    return forbiddenResponse(
      'Customers cannot cancel orders. Contact the shop — admin may cancel and issue a Razorpay refund for paid orders.'
    );
  }

  try {
    const body = await request.json();
    const orderId = String(body.orderId || '').trim();
    const reason = String(body.reason || 'Cancelled by admin').slice(0, 200);
    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }

    const result = await executeOrderCancel({
      orderId,
      reason,
      actor: 'admin',
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json({
      success: true,
      orderId: result.orderNumber,
      status: 'Cancelled',
      refunded: result.refunded || false,
      refundId: result.refundId || null,
      duplicate: result.duplicate || false,
      message: result.duplicate
        ? 'Order already cancelled.'
        : result.refunded
          ? 'Order cancelled. Razorpay refund issued — amount returns to the customer’s original payment method.'
          : 'Order cancelled.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Cancel failed' }, { status: 500 });
  }
}
