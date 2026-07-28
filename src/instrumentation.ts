export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const dns = await import('node:dns');
    dns.setDefaultResultOrder('ipv4first');

    const { initRuntimeProfile, startAdaptiveRuntimeMonitor } = await import('@/lib/runtimeProfile');
    initRuntimeProfile();
    startAdaptiveRuntimeMonitor();

    const { assertSessionSecretConfigured } = await import('@/lib/auth');
    assertSessionSecretConfigured();

    const { logDbConnectionConfig, warmDbConnection, shutdownDb } = await import('@/lib/db');
    logDbConnectionConfig();

    if (process.env.RAILWAY_REPLICA_ID) {
      console.log(`[railway] replica: ${process.env.RAILWAY_REPLICA_ID}`);
    }
    if (process.env.RAILWAY_ENVIRONMENT) {
      console.log(`[railway] environment: ${process.env.RAILWAY_ENVIRONMENT}`);
    }

    await warmDbConnection();

    const {
      startSharedBackgroundServices,
      startLeaderBackgroundServices,
      stopLeaderBackgroundServices,
    } = await import('@/lib/backgroundServices');
    const { startAutomaticLeaderElection } = await import('@/lib/backgroundLeader');

    // Admin order stream works on any replica (load balancer safe).
    await startSharedBackgroundServices();

    // WhatsApp + cron: exactly one replica, auto-elected; failover ~30s.
    startAutomaticLeaderElection(
      () => startLeaderBackgroundServices(),
      () => stopLeaderBackgroundServices()
    );

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
