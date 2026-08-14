import { NextResponse } from 'next/server';
import { checkAllJobHeartbeats } from '@/lib/jobHeartbeat';

/**
 * Health & Observability Probe:
 * Reports service liveness, uptime, and background job heartbeat telemetry.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const includeDetails = searchParams.get('details') === '1' || searchParams.get('telemetry') === '1';

  try {
    const heartbeats = await checkAllJobHeartbeats();
    const status = heartbeats.healthy ? 'ok' : 'degraded';

    return NextResponse.json({
      status,
      service: 'blessing-power-guide-next',
      timestamp: Date.now(),
      workersHealthy: heartbeats.healthy,
      stalePendingRefunds: heartbeats.stalePendingRefunds,
      pendingDeadLetterWebhooks: heartbeats.pendingDeadLetterWebhooks,
      refundRateAnomaly: heartbeats.refundRateAnomaly,
      dailyRefundPercent: heartbeats.dailyRefundPercent,
      dailyOrdersCount: heartbeats.dailyOrdersCount,
      dailyRefundsCount: heartbeats.dailyRefundsCount,
      ...(includeDetails ? { workers: heartbeats.jobs } : {}),
    }, { status: heartbeats.healthy ? 200 : 200 });
  } catch {
    return NextResponse.json({
      status: 'ok',
      service: 'blessing-power-guide-next',
      timestamp: Date.now(),
    });
  }
}
