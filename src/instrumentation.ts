export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('node:dns');
    dns.setDefaultResultOrder('ipv4first');

    const { logDbConnectionConfig, warmDbConnection, shutdownDb } = await import('@/lib/db');
    logDbConnectionConfig();

    if (process.env.RAILWAY_REPLICA_ID) {
      console.log(`[railway] replica: ${process.env.RAILWAY_REPLICA_ID}`);
    }
    if (process.env.RAILWAY_ENVIRONMENT) {
      console.log(`[railway] environment: ${process.env.RAILWAY_ENVIRONMENT}`);
    }

    // Warm DB before background jobs — keeps workflows aligned at boot
    await warmDbConnection();

    const { tryAcquireBackgroundLeader } = await import('@/lib/backgroundLeader');
    const isLeader = await tryAcquireBackgroundLeader();

    if (isLeader) {
      const { startOrderListenBroker } = await import('@/app/api/orders/stream/route');
      startOrderListenBroker();

      const { startCourierSyncCron } = await import('@/lib/courierCron');
      startCourierSyncCron();

      const { startWhatsAppOutboxWorker, initWhatsAppInProcess } = await import('@/lib/whatsapp');
      startWhatsAppOutboxWorker();
      // Restore linked session on the leader only (never on secondary replicas).
      void initWhatsAppInProcess();
    } else {
      console.log('[leader] skipping LISTEN, courier cron, and WhatsApp on this replica');
    }

    process.on('unhandledRejection', (reason) => {
      console.error('[process] unhandledRejection:', reason);
    });

    process.on('uncaughtException', (err: any) => {
      if (isRecoverablePgProcessError(err)) {
        console.warn('[process] recoverable pg error (continuing):', err?.message || err);
        return;
      }
      console.error('[process] uncaughtException:', err);
    });

    process.on('SIGTERM', () => {
      void shutdownDb().finally(() => process.exit(0));
    });
  }
}

function isRecoverablePgProcessError(err: any): boolean {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  return (
    code === '57P01' ||
    msg.includes('postmaster') ||
    msg.includes('Connection terminated') ||
    msg.includes('ECONNRESET') ||
    msg.includes('timeout exceeded')
  );
}
