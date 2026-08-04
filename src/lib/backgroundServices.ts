import { isBackgroundLeader } from '@/lib/backgroundLeader';

let leaderServicesRunning = false;
let confirmExpireTimer: ReturnType<typeof setInterval> | null = null;
let stockHoldSweepTimer: ReturnType<typeof setInterval> | null = null;
let orphanRefundTimer: ReturnType<typeof setInterval> | null = null;

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

  // Money-safety net: refund Razorpay captures that never got an order
  // (lost stock race, crash mid-checkout, etc.) once they're stale enough
  // that a legitimate in-flight order can no longer still be forming.
  if (!orphanRefundTimer) {
    const sweep = async () => {
      try {
        const { refundStaleOrphanCaptures } = await import('@/lib/orphanRefundSweep');
        const n = await refundStaleOrphanCaptures(10);
        if (n > 0) console.log(`[orphan-refund] auto-refunded ${n} stale orphan capture(s)`);
      } catch (e: any) {
        console.warn('[orphan-refund]', e?.message || e);
      }
    };
    setTimeout(() => void sweep(), 5 * 60 * 1000);
    orphanRefundTimer = setInterval(() => void sweep(), 10 * 60 * 1000);
  }

  // Abandoned Razorpay checkout sweeper — releases reserved stock for
  // sessions where the customer never paid (closed tab, timed out, no
  // webhook fired). Runs every 2 minutes so a ~20-minute hold TTL frees up
  // stock within a couple minutes of expiring, not tens of minutes late.
  if (!stockHoldSweepTimer) {
    const sweepHolds = async () => {
      try {
        const { sweepExpiredStockHolds } = await import('@/lib/stockHold');
        const n = await sweepExpiredStockHolds();
        if (n > 0) console.log(`[stock-hold-sweep] released ${n} abandoned checkout reservation(s)`);
      } catch (e: any) {
        console.warn('[stock-hold-sweep]', e?.message || e);
      }
    };
    setTimeout(() => void sweepHolds(), 60 * 1000);
    stockHoldSweepTimer = setInterval(() => void sweepHolds(), 2 * 60 * 1000);
  }

  console.log('[background] leader services started (courier cron, confirm-timeout, orphan-refund, stock-hold-sweep)');
}

/** Release leader-only resources when another replica takes over. */
export async function stopLeaderBackgroundServices() {
  if (!leaderServicesRunning) return;
  leaderServicesRunning = false;

  if (confirmExpireTimer) {
    clearInterval(confirmExpireTimer);
    confirmExpireTimer = null;
  }

  if (orphanRefundTimer) {
    clearInterval(orphanRefundTimer);
    orphanRefundTimer = null;
  }

  if (stockHoldSweepTimer) {
    clearInterval(stockHoldSweepTimer);
    stockHoldSweepTimer = null;
  }

  const { stopCourierSyncCron } = await import('@/lib/courierCron');
  stopCourierSyncCron();

  console.log('[background] leader services stopped — standby mode');
}

/** Order + stock SSE NOTIFY — safe on every replica (customers/admin may hit any instance). */
export async function startSharedBackgroundServices() {
  const { startOrderListenBroker } = await import('@/app/api/orders/stream/route');
  startOrderListenBroker();

  const { startStockListenBroker } = await import('@/app/api/stock/stream/route');
  startStockListenBroker();
}
