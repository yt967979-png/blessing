import { NextResponse } from 'next/server';
import { verifyAdminRequest, forbiddenResponse, applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { syncAllActiveAwbOrders, syncOrderByAwb } from '@/lib/stCourier';

/**
 * POST /api/courier/sync
 * Admin (or CRON_SECRET): pull live ST Courier status for all open AWB orders
 * and auto-advance to In Transit / Out for Delivery / Delivered.
 */
export async function POST(request: Request) {
  const cronSecret = request.headers.get('x-cron-secret') || '';
  const expectedCron = process.env.CRON_SECRET || '';
  const isCron = expectedCron && cronSecret === expectedCron;

  if (!isCron) {
    const auth = await verifyAdminRequest(request);
    if (!auth.isAdmin) return forbiddenResponse(auth.error);
  }

  const rl = await applyRateLimitAsync(`courier-sync:${clientIp(request)}`, 6, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Sync rate limit. Try again shortly.' }, { status: 429 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch (_) {}

  if (body?.docket) {
    const one = await syncOrderByAwb(String(body.docket), { sendWhatsApp: true });
    return NextResponse.json({ success: true, ...one });
  }

  const result = await syncAllActiveAwbOrders();
  return NextResponse.json({
    success: true,
    message: `Checked ${result.checked} shipments, updated ${result.updated}.`,
    ...result,
  });
}
