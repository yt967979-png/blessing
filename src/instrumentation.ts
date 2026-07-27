export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('node:dns');
    dns.setDefaultResultOrder('ipv4first');

    const { logDbConnectionConfig, warmDbConnection, shutdownDb } = await import('@/lib/db');
    logDbConnectionConfig();

    // Warm DB before background jobs — keeps workflows aligned at boot
    await warmDbConnection();

    const { startOrderListenBroker } = await import('@/app/api/orders/stream/route');
    startOrderListenBroker();

    const { startCourierSyncCron } = await import('@/lib/courierCron');
    startCourierSyncCron();

    process.on('unhandledRejection', (reason) => {
      console.error('[process] unhandledRejection:', reason);
    });

    process.on('SIGTERM', () => {
      void shutdownDb().finally(() => process.exit(0));
    });
  }
}
