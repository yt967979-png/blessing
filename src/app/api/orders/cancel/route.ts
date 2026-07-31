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
 * Cancel order — admin anytime (before delivered), customer only before packed/shipped.
 * Restores stock, rolls back coupon usage, updates payment_status, notifies via WhatsApp.
 */
export async function POST(request: NextRequest) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Sign in to cancel an order.');

  const rl = await applyRateLimitAsync(`cancel:${session.userId}:${clientIp(request)}`, 10, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many cancel attempts. Wait a minute.' }, { status: 429 });
  }

  const admin = await verifyAdminRequest(request);
  const isAdmin = admin.isAdmin;

  try {
    const body = await request.json();
    const orderId = String(body.orderId || '').trim();
    const reason = String(body.reason || 'Cancelled by request').slice(0, 200);
    if (!orderId) {
      return NextResponse.json({ error: 'orderId required' }, { status: 400 });
    }

    const result = await executeOrderCancel({
      orderId,
      reason,
      actor: isAdmin ? 'admin' : 'customer',
      userId: isAdmin ? null : session.userId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status || 400 });
    }

    return NextResponse.json({
      success: true,
      orderId: result.orderNumber,
      status: 'Cancelled',
      duplicate: result.duplicate || false,
      message: result.duplicate ? 'Order already cancelled.' : undefined,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Cancel failed' }, { status: 500 });
  }
}
