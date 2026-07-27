/**
 * Starts background ST Courier sync every 5 minutes on the Node server (Railway).
 * Keeps Out for Delivery / Delivered auto-updates even when admin panel is closed.
 */
let started = false;

export function startCourierSyncCron() {
  if (started) return;
  if (process.env.DISABLE_COURIER_CRON === 'true') return;
  started = true;

  const intervalMs = Number(process.env.COURIER_SYNC_INTERVAL_MS || 5 * 60 * 1000);

  const run = async () => {
    try {
      const { syncAllActiveAwbOrders } = await import('@/lib/stCourier');
      const result = await syncAllActiveAwbOrders();
      if (result.updated > 0) {
        console.log(`[courier-cron] synced ${result.checked} AWBs, updated ${result.updated}`);
      }
    } catch (err: any) {
      console.error('[courier-cron]', err?.message || err);
    }
  };

  // First run after delay so Postgres private network is ready
  setTimeout(run, Number(process.env.COURIER_CRON_START_DELAY_MS || 60000));
  setInterval(run, intervalMs);
  console.log(`[courier-cron] enabled — every ${Math.round(intervalMs / 60000)} min`);
}
