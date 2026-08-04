import { isBackgroundLeader } from '@/lib/backgroundLeader';

let leaderServicesRunning = false;
let confirmExpireTimer: ReturnType<typeof setInterval> | null = null;

/** Courier cron + legacy awaiting-confirm heal — leader replica only. */
export async function startLeaderBackgroundServices() {
  if (!isBackgroundLeader() || leaderServicesRunning) return;
  leaderServicesRunning = true;

  const { startCourierSyncCron } = await import('@/lib/courierCron');
  startCourierSyncCron();

  if (!confirmExpireTimer) {
    const expire = async () => {
      try {
        const { expireAwaitingConfirmations } = await import('@/lib/orderCancel');
        const n = await expireAwaitingConfirmations(24);
        if (n > 0) console.log(`[confirm-timeout] auto-cancelled ${n} awaiting order(s)`);
      } catch (e: any) {
        console.warn('[confirm-timeout]', e?.message || e);
      }
    };
    setTimeout(() => void expire(), 10 * 60 * 1000);
    confirmExpireTimer = setInterval(() => void expire(), 30 * 60 * 1000);
  }

  console.log('[background] leader services started (courier cron, confirm-timeout)');
}

/** Release leader-only resources when another replica takes over. */
export async function stopLeaderBackgroundServices() {
  if (!leaderServicesRunning) return;
  leaderServicesRunning = false;

  if (confirmExpireTimer) {
    clearInterval(confirmExpireTimer);
    confirmExpireTimer = null;
  }

  const { stopCourierSyncCron } = await import('@/lib/courierCron');
  stopCourierSyncCron();

  console.log('[background] leader services stopped — standby mode');
}

/** Order SSE NOTIFY — safe on every replica (admin may hit any instance). */
export async function startSharedBackgroundServices() {
  const { startOrderListenBroker } = await import('@/app/api/orders/stream/route');
  startOrderListenBroker();
}
