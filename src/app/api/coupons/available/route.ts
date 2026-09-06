import { NextResponse } from 'next/server';
import { applyRateLimitAsync, clientIp, getAuthenticatedUser } from '@/lib/serverSecurity';
import { listAvailableCouponsForUser } from '@/lib/coupons';

/** Public catalog of active coupons. Signed-in users also get alreadyUsed. */
export async function GET(request: Request) {
  const session = await getAuthenticatedUser(request);
  const ip = clientIp(request);
  const rlKey = session ? `coupons-list-${session.userId}-${ip}` : `coupons-list-pub-${ip}`;
  const { allowed } = await applyRateLimitAsync(rlKey, 40, 60000);
  if (!allowed) {
    return NextResponse.json({ error: 'Please wait a moment and try again.' }, { status: 429 });
  }

  try {
    const coupons = await listAvailableCouponsForUser(session?.userId || '');
    return NextResponse.json(
      { coupons },
      { headers: { 'Cache-Control': session ? 'private, no-store' : 'public, max-age=30, stale-while-revalidate=60' } }
    );
  } catch (err: any) {
    console.error('[coupons/available]', err?.message || err);
    return NextResponse.json({ coupons: [] });
  }
}
