export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCourierSyncCron } = await import('@/lib/courierCron');
    startCourierSyncCron();
  }
}
