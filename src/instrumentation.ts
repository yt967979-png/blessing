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

    if (process.env.RENDER) {
      console.log(
        `[render] service=${process.env.RENDER_SERVICE_NAME || 'unknown'} ` +
          `url=${process.env.RENDER_EXTERNAL_URL || '(pending)'}`
      );
    }
    if (process.env.RAILWAY_REPLICA_ID) {
      console.log(`[railway] replica: ${process.env.RAILWAY_REPLICA_ID}`);
    }
    if (process.env.RAILWAY_ENVIRONMENT) {
      console.log(`[railway] environment: ${process.env.RAILWAY_ENVIRONMENT}`);
    }
    const onAws =
      Boolean(process.env.AWS_EXECUTION_ENV) ||
      Boolean(process.env.ECS_CONTAINER_METADATA_URI) ||
      String(process.env.HOSTING || '').toLowerCase() === 'aws';
    if (onAws) {
      console.log(
        `[aws] hosting=${process.env.HOSTING || 'detected'} ` +
          `region=${process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '(unset)'} ` +
          `url=${process.env.PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '(set PUBLIC_BASE_URL)'}`
      );
    }

    await warmDbConnection();

    // Self keep-alive while process is up (does NOT wake a slept Free dyno — use UptimeRobot for that)
    const keepAliveMs = Number(process.env.KEEP_ALIVE_MS || 4 * 60 * 1000);
    if (keepAliveMs > 0) {
      const base =
        process.env.KEEP_ALIVE_URL ||
        process.env.PUBLIC_BASE_URL ||
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
        '';
      setInterval(() => {
        void (async () => {
          try {
            const { pingDb } = await import('@/lib/db');
            await pingDb();
            if (base) {
              await fetch(`${base.replace(/\/$/, '')}/api/health`, {
                signal: AbortSignal.timeout(8000),
              }).catch(() => {});
            }
          } catch (e: any) {
            console.warn('[keepalive]', e?.message || e);
          }
        })();
      }, keepAliveMs);
      console.log(
        `[keepalive] DB ping every ${Math.round(keepAliveMs / 1000)}s` +
          (base ? ` + HTTP ${base}/api/health` : ' (set NEXT_PUBLIC_SITE_URL for HTTP self-ping)')
      );
    }

    const {
      startSharedBackgroundServices,
      startLeaderBackgroundServices,
      stopLeaderBackgroundServices,
    } = await import('@/lib/backgroundServices');
    const { startAutomaticLeaderElection } = await import('@/lib/backgroundLeader');

    // Admin order stream works on any replica (load balancer safe).
    await startSharedBackgroundServices();

    // Courier cron: exactly one replica, auto-elected; failover ~30s.
    startAutomaticLeaderElection(
      () => startLeaderBackgroundServices(),
      () => stopLeaderBackgroundServices()
    );

    const sendErrorAlertEmail = async (errorType: string, errorDetails: any) => {
      try {
        const adminEmail = process.env.ADMIN_ALERT_EMAIL || process.env.GMAIL_USER || 'blessingpowerguide@gmail.com';
        const gmailUser = process.env.GMAIL_USER;
        const gmailPass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
        if (!gmailUser || !gmailPass) return;

        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: gmailUser, pass: gmailPass },
        });

        await transporter.sendMail({
          from: `"BLESSING ALERT SYSTEM" <${gmailUser}>`,
          to: adminEmail,
          subject: `🚨 ALERT: Server Issue Detected on Blessing Power Guide (${errorType})`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 2px solid #ef4444; border-radius: 8px;">
              <h2 style="color: #dc2626;">🚨 Server Error Alert</h2>
              <p>An issue occurred on your website: <strong>${errorType}</strong></p>
              <pre style="background: #f1f5f9; padding: 15px; border-radius: 5px; font-size: 13px; color: #1e293b; overflow-x: auto;">${String(errorDetails?.stack || errorDetails)}</pre>
              <p style="font-size: 12px; color: #64748b;">Timestamp: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
            </div>
          `,
        });
        console.log(`📧 [ALERT SENT] Error notification email sent to ${adminEmail}`);
      } catch (alertErr: any) {
        console.error('[ALERT EMAIL FAILED]', alertErr?.message);
      }
    };

    process.on('unhandledRejection', (reason) => {
      console.error('[process] unhandledRejection:', reason);
      void sendErrorAlertEmail('unhandledRejection', reason);
    });

    process.on('uncaughtException', (err: any) => {
      if (isRecoverablePgProcessError(err)) {
        console.warn('[process] recoverable pg error (continuing):', err?.message || err);
        return;
      }
      console.error('[process] uncaughtException:', err);
      void sendErrorAlertEmail('uncaughtException', err);
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
