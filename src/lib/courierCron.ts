/**
 * Starts background ST Courier sync every 5 minutes on the Node server (Railway).
 * Keeps Out for Delivery / Delivered auto-updates even when admin panel is closed.
 */
let started = false;
let running = false;

export function startCourierSyncCron() {
  if (started) return;
  if (process.env.DISABLE_COURIER_CRON === 'true') return;
  started = true;

  const intervalMs = Number(process.env.COURIER_SYNC_INTERVAL_MS || 5 * 60 * 1000);

  const run = async () => {
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
    } catch (err: any) {
      console.error('[courier-cron]', err?.message || err);
    } finally {
      running = false;
    }
  };

  const startDelay = Number(process.env.COURIER_CRON_START_DELAY_MS || 30000);
  setTimeout(run, startDelay);
  setInterval(run, intervalMs);
  console.log(`[courier-cron] enabled — every ${Math.round(intervalMs / 60000)} min (first run in ${Math.round(startDelay / 1000)}s)`);
}
