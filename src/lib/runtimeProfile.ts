import os from 'node:os';
import { logLaunchScaleConfig, resolveDbPoolMaxPerReplica } from '@/lib/launchScale';

export type RuntimeTier = 'local' | 'free' | 'hobby' | 'pro';
export type LoadLevel = 'low' | 'normal' | 'high' | 'critical';

export type RuntimeTuning = {
  tier: RuntimeTier;
  load: LoadLevel;
  dbPoolMax: number;
  dbHeartbeatMs: number;
  dbConnectTimeoutMs: number;
  courierCronEnabled: boolean;
  courierCronIntervalMs: number;
  courierCronStartDelayMs: number;
  leaderElectionIntervalMs: number;
  whatsappOutboxIntervalMs: number;
  orderListenEnabled: boolean;
  orderListenPingMs: number;
};

let tier: RuntimeTier = 'local';
let load: LoadLevel = 'normal';
let monitorStarted = false;

function isAwsHosted(): boolean {
  return (
    Boolean(process.env.AWS_EXECUTION_ENV) ||
    Boolean(process.env.ECS_CONTAINER_METADATA_URI) ||
    String(process.env.HOSTING || '').toLowerCase() === 'aws'
  );
}

function isHostedRuntime(): boolean {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.RENDER ||
      process.env.RENDER_SERVICE_ID ||
      process.env.VERCEL ||
      isAwsHosted() ||
      (process.env.PUBLIC_BASE_URL && process.env.NODE_ENV === 'production')
  );
}

function resolveTier(): RuntimeTier {
  const forced = String(process.env.RAILWAY_PLAN_TIER || process.env.RUNTIME_TIER || '').toLowerCase();
  if (forced === 'free' || forced === 'hobby' || forced === 'pro' || forced === 'local') {
    return forced;
  }
  if (!isHostedRuntime()) {
    return 'local';
  }

  const memGb = os.totalmem() / 1024 ** 3;
  const cpus = os.cpus().length;

  if (memGb <= 0.75 && cpus <= 2) return 'free';
  if (memGb <= 4) return 'hobby';
  return 'pro';
}

function baseTuningForTier(t: RuntimeTier): RuntimeTuning {
  switch (t) {
    case 'free':
      return {
        tier: t,
        load: 'normal',
        dbPoolMax: 3,
        dbHeartbeatMs: 60_000,
        dbConnectTimeoutMs: 8_000,
        courierCronEnabled: true,
        courierCronIntervalMs: 20 * 60 * 1000,
        courierCronStartDelayMs: 120_000,
        leaderElectionIntervalMs: 60_000,
        whatsappOutboxIntervalMs: 10_000,
        orderListenEnabled: true,
        orderListenPingMs: 120_000,
      };
    case 'hobby':
      return {
        tier: t,
        load: 'normal',
        // Lightsail + Neon pooler: small pool avoids PgBouncer checkout storms.
        dbPoolMax: 3,
        dbHeartbeatMs: 30_000,
        // Fail fast — long connects made /api/products and admin analytics hang.
        dbConnectTimeoutMs: 8_000,
        courierCronEnabled: true,
        courierCronIntervalMs: 5 * 60 * 1000,
        courierCronStartDelayMs: 30_000,
        leaderElectionIntervalMs: 30_000,
        whatsappOutboxIntervalMs: 5000,
        orderListenEnabled: true,
        orderListenPingMs: 45_000,
      };
    case 'pro':
      return {
        tier: t,
        load: 'normal',
        dbPoolMax: 5,
        dbHeartbeatMs: 30_000,
        dbConnectTimeoutMs: 20_000,
        courierCronEnabled: true,
        courierCronIntervalMs: 5 * 60 * 1000,
        courierCronStartDelayMs: 20_000,
        leaderElectionIntervalMs: 20_000,
        whatsappOutboxIntervalMs: 2000,
        orderListenEnabled: true,
        orderListenPingMs: 30_000,
      };
    default:
      return {
        tier: 'local',
        load: 'normal',
        dbPoolMax: 5,
        dbHeartbeatMs: 30_000,
        dbConnectTimeoutMs: 5_000,
        courierCronEnabled: true,
        courierCronIntervalMs: 5 * 60 * 1000,
        courierCronStartDelayMs: 15_000,
        leaderElectionIntervalMs: 30_000,
        whatsappOutboxIntervalMs: 3000,
        orderListenEnabled: true,
        orderListenPingMs: 45_000,
      };
  }
}

function applyLoadAdjustments(base: RuntimeTuning, level: LoadLevel): RuntimeTuning {
  const t = { ...base, load: level };
  if (level === 'high') {
    t.courierCronIntervalMs = Math.round(t.courierCronIntervalMs * 1.5);
    t.whatsappOutboxIntervalMs = Math.round(t.whatsappOutboxIntervalMs * 1.5);
    t.dbHeartbeatMs = Math.round(t.dbHeartbeatMs * 1.25);
  }
  if (level === 'critical') {
    t.courierCronEnabled = false;
    t.whatsappOutboxIntervalMs = Math.max(t.whatsappOutboxIntervalMs * 2, 10_000);
    t.dbHeartbeatMs = Math.max(t.dbHeartbeatMs * 1.5, 120_000);
    t.orderListenPingMs = Math.max(t.orderListenPingMs * 1.5, 60_000);
  }
  if (level === 'low' && base.tier !== 'free') {
    t.whatsappOutboxIntervalMs = Math.max(2000, Math.round(t.whatsappOutboxIntervalMs * 0.85));
  }
  return t;
}

function measureLoadLevel(): LoadLevel {
  // Railway Free/shared hosts expose host-wide cpus/mem/loadavg (e.g. 48 CPUs /
  // 300GB). That falsely flips "critical" and thrashes DB workers. Soft/free
  // always uses this process only, and never escalates to critical.
  // Soft launch / shared hosts (Railway Free, Render Starter): never escalate to critical
  // from host-wide metrics — that falsely thrashs DB workers.
  const soft =
    tier === 'free' ||
    tier === 'hobby' ||
    String(process.env.LAUNCH_SCALE || 'soft').toLowerCase() !== 'peak' ||
    Boolean(process.env.RENDER) ||
    isAwsHosted() ||
    String(process.env.RUNTIME_TIER || process.env.RAILWAY_PLAN_TIER || '')
      .toLowerCase() === 'free' ||
    String(process.env.RUNTIME_TIER || '').toLowerCase() === 'hobby';

  const mem = process.memoryUsage();
  const heapPressure = mem.heapUsed / Math.max(mem.heapTotal, 1);
  const heapMb = mem.heapUsed / (1024 * 1024);

  if (soft) {
    // Absolute heap (not V8 heapTotal ratio — that spikes falsely right after boot).
    if (heapMb >= 450) return 'high';
    if (heapMb <= 120 && heapPressure <= 0.7) return 'low';
    return 'normal';
  }

  const cpus = Math.max(1, os.cpus().length);
  const load1 = os.loadavg()[0] / cpus;
  const rssGb = mem.rss / 1024 ** 3;
  const memLimitGb = os.totalmem() / 1024 ** 3;
  const rssPressure = rssGb / Math.max(memLimitGb, 0.1);

  if (load1 >= 0.85 || heapPressure >= 0.88 || rssPressure >= 0.9) return 'critical';
  if (load1 >= 0.65 || heapPressure >= 0.78 || rssPressure >= 0.8) return 'high';
  if (load1 <= 0.25 && heapPressure <= 0.55 && rssPressure <= 0.5) return 'low';
  return 'normal';
}

export function initRuntimeProfile(): RuntimeTuning {
  tier = resolveTier();
  load = measureLoadLevel();
  const tuning = getRuntimeTuning();
  const replica =
    process.env.RAILWAY_REPLICA_ID
      ? ` replica ${process.env.RAILWAY_REPLICA_ID.slice(0, 8)}`
      : process.env.RENDER
        ? ' render'
        : isAwsHosted()
          ? ' aws'
          : '';
  console.log(
    `[runtime] tier=${tuning.tier} load=${tuning.load} cpus=${os.cpus().length} mem=${(os.totalmem() / 1024 ** 3).toFixed(2)}GB pool=${resolveDbPoolMaxPerReplica(tuning.dbPoolMax)}${replica}`
  );
  logLaunchScaleConfig();
  return tuning;
}

export function getRuntimeTuning(): RuntimeTuning {
  const base = baseTuningForTier(tier);
  return applyLoadAdjustments(base, load);
}

export function getRuntimeLoadLevel(): LoadLevel {
  return load;
}

export function shouldRunBackgroundTask(task: 'courier' | 'outbox' | 'listen'): boolean {
  const t = getRuntimeTuning();
  if (load === 'critical') {
    if (task === 'courier') return false;
    if (task === 'outbox') return true;
    if (task === 'listen') return t.orderListenEnabled;
  }
  if (task === 'courier') return t.courierCronEnabled;
  if (task === 'listen') return t.orderListenEnabled;
  return true;
}

function readNumericEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function resolveTunedNumber(name: string, key: keyof RuntimeTuning): number {
  return readNumericEnv(name, getRuntimeTuning()[key] as number);
}

export function resolveTunedBoolean(name: string, key: keyof RuntimeTuning): boolean {
  const raw = process.env[name];
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return Boolean(getRuntimeTuning()[key]);
}

export function startAdaptiveRuntimeMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  const intervalMs = Number(process.env.RUNTIME_MONITOR_INTERVAL_MS || 30_000);

  setInterval(() => {
    const prev = load;
    load = measureLoadLevel();
    if (load !== prev) {
      const t = getRuntimeTuning();
      console.log(
        `[runtime] load ${prev} → ${load} (pool=${t.dbPoolMax} courier=${t.courierCronEnabled ? 'on' : 'off'})`
      );
    }
  }, intervalMs);
}
