import { NextResponse } from 'next/server';
import { applyRateLimitAsync, clientIp, getAuthenticatedUser } from '@/lib/serverSecurity';
import { listAvailableCouponsForUser } from '@/lib/coupons';

/** Signed-in customers: active coupons with shop-facing details (no admin usage stats). */
export async function GET(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) {
    return NextResponse.json({ error: 'Please login to view coupons.' }, { status: 401 });
  }

  const ip = clientIp(request);
  const { allowed } = await applyRateLimitAsync(`coupons-list-${session.userId}-${ip}`, 40, 60000);
  if (!allowed) {
    return NextResponse.json({ error: 'Please wait a moment and try again.' }, { status: 429 });
  }

  try {
    const coupons = await listAvailableCouponsForUser(session.userId);
    return NextResponse.json({ coupons });
  } catch (err: any) {
    console.error('[coupons/available]', err?.message || err);
    return NextResponse.json({ coupons: [] });
  }
}
