/**
 * Starts background ST Courier sync on the Node server (Railway).
 * Interval adapts to Free / Hobby / CPU load via runtimeProfile.
 */
import { shouldRunBackgroundTask, resolveTunedNumber } from '@/lib/runtimeProfile';

let started = false;
let running = false;
let cronInterval: ReturnType<typeof setInterval> | null = null;
let cronStartTimeout: ReturnType<typeof setTimeout> | null = null;

export function startCourierSyncCron() {
  if (started) return;
  if (process.env.DISABLE_COURIER_CRON === 'true') return;
  started = true;

  const intervalMs = resolveTunedNumber('COURIER_SYNC_INTERVAL_MS', 'courierCronIntervalMs');
  const startDelay = resolveTunedNumber('COURIER_CRON_START_DELAY_MS', 'courierCronStartDelayMs');

  const run = async () => {
    if (!shouldRunBackgroundTask('courier')) return;
    if (running) {
      console.warn('[courier-cron] skipped — previous sync still running');
      return;
    }
    running = true;
    const startedAt = Date.now();
    try {
      const { syncAllActiveAwbOrders } = await import('@/lib/stCourier');
      const result = await syncAllActiveAwbOrders();
      const elapsed = Date.now() - startedAt;
      if (result.updated > 0) {
        console.log(`[courier-cron] synced ${result.checked} AWBs, updated ${result.updated} (${elapsed}ms)`);
      } else if (elapsed > intervalMs * 0.8) {
        console.warn(`[courier-cron] slow run ${elapsed}ms — consider increasing COURIER_SYNC_INTERVAL_MS`);
      }
      const { recordJobHeartbeat } = await import('@/lib/jobHeartbeat');
      await recordJobHeartbeat({
        jobName: 'courierSyncCron',
        durationMs: elapsed,
        status: 'ok',
        details: { checked: result.checked, updated: result.updated },
      });
    } catch (err: any) {
      console.error('[courier-cron]', err?.message || err);
      const { recordJobHeartbeat } = await import('@/lib/jobHeartbeat');
      await recordJobHeartbeat({
        jobName: 'courierSyncCron',
        durationMs: Date.now() - startedAt,
        status: 'error',
        error: err?.message || String(err),
      });
    } finally {
      running = false;
    }
  };

  cronStartTimeout = setTimeout(run, startDelay);
  cronInterval = setInterval(run, intervalMs);
  console.log(`[courier-cron] enabled — every ${Math.round(intervalMs / 60000)} min (first run in ${Math.round(startDelay / 1000)}s)`);
}

export function stopCourierSyncCron() {
  if (cronInterval) clearInterval(cronInterval);
  if (cronStartTimeout) clearTimeout(cronStartTimeout);
  cronInterval = null;
  cronStartTimeout = null;
  started = false;
  running = false;
}
