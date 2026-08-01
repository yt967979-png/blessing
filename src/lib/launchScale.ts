/**
 * Launch traffic profile — soft = free/single container (default), peak optional.
 */

export type LaunchScale = 'soft' | 'peak';

function isLocalDb(): boolean {
  const dbUrl = process.env.DATABASE_URL || '';
  return /(@localhost[:/]|@127\.0\.0\.1[:/]|host=localhost|host=127\.0\.0\.1)/.test(dbUrl) || dbUrl.startsWith('postgresql:///');
}

export function getLaunchScale(): LaunchScale {
  return String(process.env.LAUNCH_SCALE || 'soft').toLowerCase() === 'peak' ? 'peak' : 'soft';
}

export function getAppReplicaCount(): number {
  const raw = process.env.APP_REPLICA_COUNT || process.env.RAILWAY_NUM_REPLICAS || '1';
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

/** Total Postgres connection budget shared across all app replicas. */
export function getDbConnectionBudget(): number {
  if (isLocalDb()) return 20;
  if (process.env.DB_CONNECTION_BUDGET) {
    const n = Number(process.env.DB_CONNECTION_BUDGET);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return getLaunchScale() === 'peak' ? 18 : 10;
}

export function resolveDbPoolMaxPerReplica(tierDefault: number): number {
  if (isLocalDb()) return 20;
  if (process.env.DB_POOL_MAX) {
    const n = Number(process.env.DB_POOL_MAX);
    if (Number.isFinite(n) && n > 0) {
      const softCap = getLaunchScale() === 'peak' ? Math.floor(n) : Math.min(Math.floor(n), 10);
      return softCap;
    }
  }
  const replicas = getAppReplicaCount();
  const perReplica = Math.max(1, Math.floor(getDbConnectionBudget() / replicas));
  const cap = getLaunchScale() === 'peak' ? 10 : Math.min(10, Math.max(1, tierDefault));
  return Math.min(cap, perReplica);
}

/** In-memory catalog TTL — soft/Free: long (most concurrent traffic hits RAM). */
export function getCatalogCacheTtlMs(): number {
  if (process.env.CATALOG_CACHE_TTL_MS) {
    const n = Number(process.env.CATALOG_CACHE_TTL_MS);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return getLaunchScale() === 'peak' ? 5 * 60 * 1000 : 15 * 60 * 1000;
}

export function getCatalogCdnHeaders(): Record<string, string> {
  if (getLaunchScale() === 'peak') {
    return {
      'Cache-Control': 'public, max-age=60, s-maxage=180, stale-while-revalidate=600',
      Vary: 'Accept-Encoding',
    };
  }
  return {
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=900',
    Vary: 'Accept-Encoding',
  };
}

export function logLaunchScaleConfig(): void {
  const scale = getLaunchScale();
  const replicas = getAppReplicaCount();
  const budget = getDbConnectionBudget();
  const pool = resolveDbPoolMaxPerReplica(scale === 'peak' ? 10 : 5);
  console.log(
    `[launch] scale=${scale} replicas=${replicas} dbPoolPerReplica=${pool} (budget≈${budget} total PG conns) catalogTtlMs=${getCatalogCacheTtlMs()}`
  );
}
