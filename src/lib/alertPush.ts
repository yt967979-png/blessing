/**
 * External Alert Push Dispatcher (Slack / Discord / Telegram / Generic Webhooks).
 *
 * Configured via ALERT_WEBHOOK_URL env var.
 * Includes in-memory cooldown to avoid notification storms.
 */

const alertCooldowns = new Map<string, number>();
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes per unique alert key

export async function sendPushAlert(opts: {
  key: string;
  title: string;
  message: string;
  severity?: 'info' | 'warning' | 'critical';
  details?: Record<string, any>;
}): Promise<boolean> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return false;

  const now = Date.now();
  const lastSent = alertCooldowns.get(opts.key) || 0;
  if (now - lastSent < COOLDOWN_MS) {
    return false; // Suppressed by cooldown
  }
  alertCooldowns.set(opts.key, now);

  const emoji = opts.severity === 'critical' ? '🚨' : opts.severity === 'warning' ? '⚠️' : 'ℹ️';
  const text = `${emoji} *[Blessing Power Guide - ${opts.severity?.toUpperCase() || 'ALERT'}]* ${opts.title}\n\n${opts.message}\n${
    opts.details ? `\`\`\`json\n${JSON.stringify(opts.details, null, 2)}\n\`\`\`` : ''
  }`;

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        content: text, // Discord compatibility
        title: opts.title,
        severity: opts.severity || 'warning',
        details: opts.details || {},
        timestamp: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch (err: any) {
    console.warn('[alertPush] could not dispatch push alert:', err?.message || err);
    return false;
  }
}
