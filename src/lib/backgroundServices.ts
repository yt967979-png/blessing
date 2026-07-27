import { isBackgroundLeader } from '@/lib/backgroundLeader';

let leaderServicesRunning = false;

/** WhatsApp, courier cron, outbox — leader replica only. */
export async function startLeaderBackgroundServices() {
  if (!isBackgroundLeader() || leaderServicesRunning) return;
  leaderServicesRunning = true;

  const { startCourierSyncCron } = await import('@/lib/courierCron');
  startCourierSyncCron();

  const { startWhatsAppOutboxWorker, initWhatsAppInProcess } = await import('@/lib/whatsapp');
  startWhatsAppOutboxWorker();
  void initWhatsAppInProcess();

  console.log('[background] leader services started (WhatsApp, courier cron, outbox)');
}

/** Release leader-only resources when another replica takes over. */
export async function stopLeaderBackgroundServices() {
  if (!leaderServicesRunning) return;
  leaderServicesRunning = false;

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
