import { queryDb } from '@/lib/db';

export interface HeartbeatThreshold {
  jobName: string;
  expectedIntervalMs: number;
  maxSilenceMs: number;
}

export const JOB_THRESHOLDS: Record<string, HeartbeatThreshold> = {
  stockHoldSweep: {
    jobName: 'stockHoldSweep',
    expectedIntervalMs: 2 * 60 * 1000,
    maxSilenceMs: 6 * 60 * 1000, // 6 min max
  },
  orphanRefundSweep: {
    jobName: 'orphanRefundSweep',
    expectedIntervalMs: 10 * 60 * 1000,
    maxSilenceMs: 25 * 60 * 1000, // 25 min max
  },
  reconcileUnfinalizedRefunds: {
    jobName: 'reconcileUnfinalizedRefunds',
    expectedIntervalMs: 10 * 60 * 1000,
    maxSilenceMs: 25 * 60 * 1000, // 25 min max
  },
  courierSyncCron: {
    jobName: 'courierSyncCron',
    expectedIntervalMs: 30 * 60 * 1000,
    maxSilenceMs: 75 * 60 * 1000, // 75 min max
  },
  confirmExpire: {
    jobName: 'confirmExpire',
    expectedIntervalMs: 30 * 60 * 1000,
    maxSilenceMs: 75 * 60 * 1000,
  },
};

/**
 * Records a heartbeat timestamp and duration for a background job.
 * Non-blocking: failures to write telemetry are logged without breaking the job.
 */
export async function recordJobHeartbeat(opts: {
  jobName: string;
  durationMs: number;
  status: 'ok' | 'error';
  error?: string | null;
  details?: Record<string, any>;
}): Promise<void> {
  try {
    await queryDb(
      `INSERT INTO job_heartbeats (job_name, last_run_at, status, duration_ms, last_error, details, updated_at)
       VALUES ($1, NOW(), $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT (job_name) DO UPDATE SET
         last_run_at = EXCLUDED.last_run_at,
         status = EXCLUDED.status,
         duration_ms = EXCLUDED.duration_ms,
         last_error = EXCLUDED.last_error,
         details = EXCLUDED.details,
         updated_at = NOW()`,
      [
        opts.jobName,
        opts.status,
        Math.round(opts.durationMs),
        opts.error || null,
        JSON.stringify(opts.details || {}),
      ]
    );
  } catch (err: any) {
    console.warn(`[heartbeat] could not record heartbeat for ${opts.jobName}:`, err?.message || err);
  }
}

/**
 * Checks the health of all background workers against their expected max silence thresholds.
 */
export async function checkAllJobHeartbeats(): Promise<{
  healthy: boolean;
  stalePendingRefunds: number;
  pendingDeadLetterWebhooks: number;
  refundRateAnomaly: boolean;
  dailyRefundPercent: number;
  dailyOrdersCount: number;
  dailyRefundsCount: number;
  jobs: Array<{
    jobName: string;
    lastRunAt: string | null;
    status: string;
    durationMs: number;
    silentMs: number | null;
    isHealthy: boolean;
    lastError?: string;
  }>;
}> {
  try {
    const res = await queryDb(
      `SELECT job_name, last_run_at, status, duration_ms, last_error, details FROM job_heartbeats`
    );
    const byName = new Map<string, any>(res.rows.map((r: any) => [r.job_name, r]));
    const now = Date.now();
    let allHealthy = true;

    const jobs = Object.values(JOB_THRESHOLDS).map((threshold) => {
      const row = byName.get(threshold.jobName);
      if (!row) {
        // Job has not reported yet — allowed during initial startup window
        return {
          jobName: threshold.jobName,
          lastRunAt: null,
          status: 'pending_initial_run',
          durationMs: 0,
          silentMs: null,
          isHealthy: true,
        };
      }

      const lastRun = new Date(row.last_run_at).getTime();
      const silentMs = Math.max(0, now - lastRun);
      const isHealthy = silentMs <= threshold.maxSilenceMs && row.status !== 'error';

      if (!isHealthy) {
        allHealthy = false;
      }

      return {
        jobName: threshold.jobName,
        lastRunAt: row.last_run_at,
        status: row.status,
        durationMs: Number(row.duration_ms || 0),
        silentMs,
        isHealthy,
        lastError: row.last_error || undefined,
      };
    });

    let stalePendingRefunds = 0;
    try {
      const pendingRefundsRes = await queryDb(
        `SELECT COUNT(*)::int as count FROM refunds WHERE status = 'PENDING' AND created_at < NOW() - INTERVAL '30 minutes'`
      );
      stalePendingRefunds = Number(pendingRefundsRes.rows[0]?.count || 0);
      if (stalePendingRefunds > 0) {
        allHealthy = false;
      }
    } catch (_) {}

    let pendingDeadLetterWebhooks = 0;
    try {
      const deadLetterRes = await queryDb(
        `SELECT COUNT(*)::int as count FROM failed_webhook_events WHERE status = 'pending'`
      );
      pendingDeadLetterWebhooks = Number(deadLetterRes.rows[0]?.count || 0);
    } catch (_) {}

    let refundRateAnomaly = false;
    let dailyRefundPercent = 0;
    let dailyOrdersCount = 0;
    let dailyRefundsCount = 0;
    try {
      const [orderRes, refundRes] = await Promise.all([
        queryDb(`SELECT COUNT(*)::int as count FROM orders WHERE created_at >= NOW() - INTERVAL '24 hours'`),
        queryDb(`SELECT COUNT(*)::int as count FROM refunds WHERE created_at >= NOW() - INTERVAL '24 hours'`),
      ]);
      dailyOrdersCount = Number(orderRes.rows[0]?.count || 0);
      dailyRefundsCount = Number(refundRes.rows[0]?.count || 0);
      if (dailyOrdersCount >= 10) {
        dailyRefundPercent = Math.round((dailyRefundsCount / dailyOrdersCount) * 1000) / 10;
        if (dailyRefundPercent >= 5.0) {
          refundRateAnomaly = true;
          allHealthy = false;
        }
      }
    } catch (_) {}

    // Dispatch external push alert if degraded state detected
    if (!allHealthy) {
      const { sendPushAlert } = await import('@/lib/alertPush');
      if (stalePendingRefunds > 0) {
        void sendPushAlert({
          key: 'stale-pending-refunds',
          title: 'Stale Pending Refunds Detected',
          message: `There are ${stalePendingRefunds} refund(s) stuck in PENDING status for >30 minutes. Please check Razorpay dashboard.`,
          severity: 'warning',
        });
      }
      if (refundRateAnomaly) {
        void sendPushAlert({
          key: 'refund-rate-anomaly',
          title: 'High Daily Refund Rate Anomaly',
          message: `24h refund rate reached ${dailyRefundPercent}% (${dailyRefundsCount} refunds on ${dailyOrdersCount} orders, threshold is 5%).`,
          severity: 'warning',
        });
      }
    }

    return {
      healthy: allHealthy,
      stalePendingRefunds,
      pendingDeadLetterWebhooks,
      refundRateAnomaly,
      dailyRefundPercent,
      dailyOrdersCount,
      dailyRefundsCount,
      jobs,
    };
  } catch {
    return {
      healthy: false,
      stalePendingRefunds: 0,
      pendingDeadLetterWebhooks: 0,
      refundRateAnomaly: false,
      dailyRefundPercent: 0,
      dailyOrdersCount: 0,
      dailyRefundsCount: 0,
      jobs: [],
    };
  }
}
