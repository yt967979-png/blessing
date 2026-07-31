import { isBackgroundLeader } from '@/lib/backgroundLeader';

let leaderServicesRunning = false;
let abandonCartTimer: ReturnType<typeof setInterval> | null = null;
let confirmExpireTimer: ReturnType<typeof setInterval> | null = null;

/** WhatsApp, courier cron, outbox — leader replica only. */
export async function startLeaderBackgroundServices() {
  if (!isBackgroundLeader() || leaderServicesRunning) return;
  leaderServicesRunning = true;

  const { startCourierSyncCron } = await import('@/lib/courierCron');
  startCourierSyncCron();

  // Stay single-service on Free: outbox only — Baileys connects lazily on QR/send
  const { startWhatsAppOutboxWorker } = await import('@/lib/whatsapp');
  startWhatsAppOutboxWorker();

  if (!abandonCartTimer) {
    const drain = async () => {
      try {
        const { drainAbandonedCarts } = await import('@/app/api/cart/abandon/route');
        const result = await drainAbandonedCarts();
        if (result.sent > 0) {
          console.log(`[abandon-cart] reminded ${result.sent} cart(s)`);
        }
      } catch (e: any) {
        console.warn('[abandon-cart]', e?.message || e);
      }
    };
    setTimeout(() => void drain(), 5 * 60 * 1000);
    abandonCartTimer = setInterval(() => void drain(), 30 * 60 * 1000);
  }

  if (!confirmExpireTimer) {
    const expire = async () => {
      try {
        const { expireAwaitingConfirmations } = await import('@/lib/orderConfirm');
        const n = await expireAwaitingConfirmations(24);
        if (n > 0) console.log(`[confirm-timeout] auto-cancelled ${n} awaiting order(s)`);
      } catch (e: any) {
        console.warn('[confirm-timeout]', e?.message || e);
      }
    };
    setTimeout(() => void expire(), 10 * 60 * 1000);
    confirmExpireTimer = setInterval(() => void expire(), 30 * 60 * 1000);
  }

  console.log(
    '[background] leader services started (WhatsApp, courier cron, outbox, abandon-cart, confirm-timeout)'
  );
}

/** Release leader-only resources when another replica takes over. */
export async function stopLeaderBackgroundServices() {
  if (!leaderServicesRunning) return;
  leaderServicesRunning = false;

  if (abandonCartTimer) {
    clearInterval(abandonCartTimer);
    abandonCartTimer = null;
  }
  if (confirmExpireTimer) {
    clearInterval(confirmExpireTimer);
    confirmExpireTimer = null;
  }

  const { stopCourierSyncCron } = await import('@/lib/courierCron');
  stopCourierSyncCron();

  const { stopWhatsAppOutboxWorker, shutdownWhatsAppInProcess } = await import('@/lib/whatsapp');
  stopWhatsAppOutboxWorker();
  await shutdownWhatsAppInProcess();

  console.log('[background] leader services stopped — standby mode');
}

/** Order SSE NOTIFY — safe on every replica (admin may hit any instance). */
export async function startSharedBackgroundServices() {
  const { startOrderListenBroker } = await import('@/app/api/orders/stream/route');
  startOrderListenBroker();
}
