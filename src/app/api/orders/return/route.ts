import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  verifyAdminRequest,
  unauthorizedResponse,
  forbiddenResponse,
  applyRateLimitAsync,
  clientIp,
} from '@/lib/serverSecurity';
import { executeOrderReturn } from '@/lib/orderCancel';

/**
 * POST /api/orders/return
 * Admin-only: Process a customer return or courier RTO for delivered/in-transit orders.
 * Idempotently restores bilingual inventory, triggers Razorpay refund (if prepaid),
 * rolls back single-use coupons, and updates the timeline.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Sign in required.');

  const rl = await applyRateLimitAsync(`return:${session.userId}:${clientIp(request)}`, 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many return attempts. Wait a minute.' }, { status: 429 });
  }

  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) {
    return forbiddenResponse(
      'Customers cannot process returns directly. Contact the shop — admin will verify and issue returns/refunds.'
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const orderId = String(body.orderId || body.orderNumber || '').trim();
    const reason = String(body.reason || 'Admin processed return / RTO').slice(0, 200);
    const refund = body.refund !== false; // Default true for prepaid orders
    const restoreStock = body.restoreStock !== false; // Default true

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const result = await executeOrderReturn({
      orderId,
      reason,
      actor: 'admin',
      refund,
      restoreStock,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Failed to process return' },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      orderNumber: result.orderNumber,
      duplicate: result.duplicate,
      refunded: result.refunded,
      refundId: result.refundId,
      status: 'Returned',
      message: result.refunded
        ? `Order #${result.orderNumber} returned and refunded (ID: ${result.refundId})`
        : `Order #${result.orderNumber} marked as returned`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Internal server error while processing return' }, { status: 500 });
  }
}
