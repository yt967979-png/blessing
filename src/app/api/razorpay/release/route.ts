import { NextResponse } from 'next/server';
import { getAuthenticatedUser, unauthorizedResponse, applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { releaseStockHolds } from '@/lib/stockHold';

/**
 * Best-effort explicit release — called from the client the moment the
 * Razorpay checkout modal is dismissed or reports payment.failed, so stock
 * frees up for other shoppers immediately instead of waiting for the TTL
 * sweeper. Not required for correctness (webhook + sweeper are the reliable
 * paths) — this route is purely a fast-path UX improvement. Idempotent.
 */
export async function POST(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Please login.');

  const rl = await applyRateLimitAsync(`rzp-release:${session.userId}:${clientIp(request)}`, 30, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a moment.' }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const razorpayOrderId = String(body?.razorpayOrderId || '').trim();
    const reason = String(body?.reason || 'client_cancelled').slice(0, 100);
    if (!razorpayOrderId) {
      return NextResponse.json({ error: 'razorpayOrderId is required' }, { status: 400 });
    }

    const result = await releaseStockHolds(
      { razorpayOrderId, userId: session.userId },
      reason
    );

    return NextResponse.json({ released: result.releasedCount > 0, releasedCount: result.releasedCount });
  } catch (err: any) {
    console.error('[razorpay/release]', err?.message || err);
    // Never block the UI on this — sweeper/webhook still guarantee release.
    return NextResponse.json({ released: false, error: err?.message || 'Release failed' }, { status: 200 });
  }
}
