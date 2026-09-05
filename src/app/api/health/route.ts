import { NextResponse } from 'next/server';
import { checkAllJobHeartbeats } from '@/lib/jobHeartbeat';
import { verifyAdminRequest } from '@/lib/serverSecurity';

function detailsAuthorized(request: Request, isAdmin: boolean): boolean {
  const secret = String(process.env.CRON_SECRET || '').trim();
  if (isAdmin) return true;
  if (!secret) return false;
  const header = request.headers.get('x-cron-secret') || '';
  const auth = request.headers.get('authorization') || '';
  return header === secret || auth === `Bearer ${secret}`;
}

/** Public liveness only. Telemetry requires admin session or CRON_SECRET. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wantsDetails = searchParams.get('details') === '1' || searchParams.get('telemetry') === '1';

  try {
    if (!wantsDetails) {
      return NextResponse.json({
        status: 'ok',
        service: 'blessing-power-guide-next',
        timestamp: Date.now(),
      });
    }

    const admin = await verifyAdminRequest(request);
    if (!detailsAuthorized(request, admin.isAdmin)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const heartbeats = await checkAllJobHeartbeats();
    return NextResponse.json({
      status: heartbeats.healthy ? 'ok' : 'degraded',
      service: 'blessing-power-guide-next',
      timestamp: Date.now(),
      workersHealthy: heartbeats.healthy,
      stalePendingRefunds: heartbeats.stalePendingRefunds,
      pendingDeadLetterWebhooks: heartbeats.pendingDeadLetterWebhooks,
      refundRateAnomaly: heartbeats.refundRateAnomaly,
      dailyRefundPercent: heartbeats.dailyRefundPercent,
      dailyOrdersCount: heartbeats.dailyOrdersCount,
      dailyRefundsCount: heartbeats.dailyRefundsCount,
      workers: heartbeats.jobs,
    });
  } catch {
    return NextResponse.json({
      status: 'ok',
      service: 'blessing-power-guide-next',
      timestamp: Date.now(),
    });
  }
}
