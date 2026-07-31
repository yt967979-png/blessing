/**
 * Launch traffic profile — soft = free/single container (default), peak optional.
 *
 * Railway variables:
 *   RUNTIME_TIER=free          (force free tuning on Railway Free)
 *   LAUNCH_SCALE=soft|peak     (default soft)
 *   APP_REPLICA_COUNT=1
 *   DB_POOL_MAX=2              (optional; keep 2–3 on Free)
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
  // Free Postgres is tiny — soft budget stays very low
  return getLaunchScale() === 'peak' ? 18 : 5;
}

export function resolveDbPoolMaxPerReplica(tierDefault: number): number {
  if (process.env.DB_POOL_MAX) {
    const n = Number(process.env.DB_POOL_MAX);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  const replicas = getAppReplicaCount();
  const perReplica = Math.max(1, Math.floor(getDbConnectionBudget() / replicas));
  // Soft/Free: honour tierDefault (often 2–3); peak: cap 3 per replica
  const cap = getLaunchScale() === 'peak' ? 3 : Math.min(5, Math.max(1, tierDefault));
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

/**
 * Cache-Control for anonymous catalog JSON.
 * Soft: long s-maxage so Cloudflare Free can absorb repeat views.
 * Admin uses ?fresh=1 to bypass memory + should send no-store from client.
 */
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
  const pool = resolveDbPoolMaxPerReplica(scale === 'peak' ? 3 : 2);
  console.log(
    `[launch] scale=${scale} replicas=${replicas} dbPoolPerReplica=${pool} (budget≈${budget} total PG conns) catalogTtlMs=${getCatalogCacheTtlMs()}`
  );
  if (scale === 'peak' && replicas < 3) {
    console.warn(
      '[launch] peak mode: set Railway replicas to 3–4 and APP_REPLICA_COUNT to match before the campaign.'
    );
  }
  if (scale === 'soft') {
    console.log(
      '[launch] soft/Free mode: target ~20–80 concurrent catalog browsers with Cloudflare Free in front. Set RUNTIME_TIER=free on Railway Free. Do not claim Flipkart-scale concurrency.'
    );
  }
}
