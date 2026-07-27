export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('node:dns');
    dns.setDefaultResultOrder('ipv4first');

    const { logDbConnectionConfig } = await import('@/lib/db');
    logDbConnectionConfig();

    const { startCourierSyncCron } = await import('@/lib/courierCron');
    startCourierSyncCron();
  }
}
