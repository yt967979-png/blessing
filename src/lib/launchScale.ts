/**
 * Launch traffic profile — soft now (1 replica), peak at campaign (~2k at once).
 *
 * Railway variables:
 *   LAUNCH_SCALE=soft|peak     (default soft)
 *   APP_REPLICA_COUNT=3        (match Railway replica count at launch)
 *   DB_POOL_MAX=2              (optional override per replica)
 */

export type LaunchScale = 'soft' | 'peak';

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
  if (process.env.DB_CONNECTION_BUDGET) {
    const n = Number(process.env.DB_CONNECTION_BUDGET);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return getLaunchScale() === 'peak' ? 18 : 10;
}

export function resolveDbPoolMaxPerReplica(tierDefault: number): number {
  if (process.env.DB_POOL_MAX) {
    const n = Number(process.env.DB_POOL_MAX);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  const replicas = getAppReplicaCount();
  const perReplica = Math.max(1, Math.floor(getDbConnectionBudget() / replicas));
  const cap = getLaunchScale() === 'peak' ? 3 : tierDefault;
  return Math.min(cap, perReplica);
}

export function getCatalogCacheTtlMs(): number {
  return getLaunchScale() === 'peak' ? 5 * 60 * 1000 : 2 * 60 * 1000;
}

export function getCatalogCdnHeaders(): Record<string, string> {
  if (getLaunchScale() === 'peak') {
    return {
      'Cache-Control': 'public, max-age=60, s-maxage=180, stale-while-revalidate=600',
      Vary: 'Accept-Encoding',
    };
  }
  return {
    'Cache-Control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=60',
    Vary: 'Accept-Encoding',
  };
}

export function logLaunchScaleConfig(): void {
  const scale = getLaunchScale();
  const replicas = getAppReplicaCount();
  const budget = getDbConnectionBudget();
  const pool = resolveDbPoolMaxPerReplica(scale === 'peak' ? 3 : 2);
  console.log(
    `[launch] scale=${scale} replicas=${replicas} dbPoolPerReplica=${pool} (budget≈${budget} total PG conns)`
  );
  if (scale === 'peak' && replicas < 3) {
    console.warn(
      '[launch] peak mode: set Railway replicas to 3–4 and APP_REPLICA_COUNT to match before the campaign.'
    );
  }
  if (scale === 'soft') {
    console.log('[launch] soft mode (1 replica). Set LAUNCH_SCALE=peak + 3–4 replicas for ~2k at once.');
  }
}
