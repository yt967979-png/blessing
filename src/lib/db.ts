import { Pool, Client } from 'pg';
import { hashPassword } from '@/lib/auth';
import { resolveTunedNumber, getRuntimeTuning } from '@/lib/runtimeProfile';
import { resolveDbPoolMaxPerReplica } from '@/lib/launchScale';

let isSchemaInitialized = false;
let schemaInitPromise: Promise<void> | null = null;
let pool: Pool | null = null;
let activeConnectionString: string | null = null;
let poolReadyPromise: Promise<Pool> | null = null;
let lastPoolPingAt = 0;
let poolGeneration = 0;
let heartbeatFailures = 0;
let invalidateInFlight: Promise<void> | null = null;

/** Strip sslmode from URL — node-pg uses explicit `ssl` option; leaving sslmode can break Neon/Railway. */
function normalizeConnectionString(url: string): string {
  let u = url.trim();
  if (!u) return u;
  u = u.replace(/([?&])sslmode=[^&]*/gi, '$1');
  u = u.replace(/([?&])channel_binding=[^&]*/gi, '$1');
  u = u.replace(/([?&])uselibpqcompat=[^&]*/gi, '$1');
  u = u.replace(/\?&/g, '?').replace(/[?&]$/g, '');
  return u;
}

function buildUrlFromPgEnv(): string | null {
  if (process.env.DATABASE_URL) return null;
  if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGPASSWORD) return null;
  const user = encodeURIComponent(process.env.PGUSER);
  const pass = encodeURIComponent(process.env.PGPASSWORD);
  const host = process.env.PGHOST;
  const port = process.env.PGPORT || 5432;
  const db = process.env.PGDATABASE || 'railway';
  return `postgresql://${user}:${pass}@${host}:${port}/${db}`;
}

function isPublicProxyUrl(u: string): boolean {
  return u.includes('rlwy.net') || u.includes('proxy.rlwy.net');
}

function isPrivateRailwayUrl(u: string): boolean {
  return u.includes('railway.internal');
}

function isNeonUrl(u: string): boolean {
  return u.includes('neon.tech');
}

function isManagedCloudPg(u: string): boolean {
  return (
    isNeonUrl(u) ||
    u.includes('supabase.co') ||
    u.includes('supabase.com') ||
    u.includes('aivencloud.com') ||
    u.includes('amazonaws.com')
  );
}

function isNeonPoolerUrl(u: string): boolean {
  return isNeonUrl(u) && u.includes('-pooler.');
}

/** Neon LISTEN needs a direct (non-PgBouncer) endpoint. */
export function neonDirectUrlFromPooler(u: string): string | null {
  if (!isNeonPoolerUrl(u)) return null;
  return u.replace('-pooler.', '.');
}

function hostOf(connectionString: string): string {
  try {
    return new URL(connectionString.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
  } catch {
    return '(unparseable)';
  }
}

function getConnectionCandidates(): string[] {
  const raw: string[] = [];

  const dbUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL || '').trim();
  if (dbUrl) {
    const norm = normalizeConnectionString(dbUrl);
    // Neon / Supabase / managed cloud — never fall back to stale Railway private URLs.
    if (isManagedCloudPg(norm)) {
      const extras = [
        process.env.DATABASE_URL_UNPOOLED,
        process.env.DATABASE_DIRECT_URL,
      ]
        .map((x) => (x || '').trim())
        .filter(Boolean)
        .map(normalizeConnectionString)
        .filter((u) => u && u !== norm);
      // Prefer pooled app URL first; keep direct as optional later candidate for tools.
      return [norm, ...extras];
    }
    raw.push(norm);
  }

  const fromPgEnv = buildUrlFromPgEnv();
  if (fromPgEnv) raw.push(fromPgEnv);

  for (const key of ['DATABASE_PUBLIC_URL', 'DATABASE_PRIVATE_URL'] as const) {
    const v = (process.env[key] || '').trim();
    if (v) raw.push(v);
  }

  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);
  const onRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
  const onAws =
    Boolean(process.env.AWS_EXECUTION_ENV) ||
    Boolean(process.env.ECS_CONTAINER_METADATA_URI) ||
    String(process.env.HOSTING || '').toLowerCase() === 'aws';
  let sorted = [...new Set(raw.map(normalizeConnectionString).filter(Boolean))];

  // Never try railway.internal when a managed cloud URL is present.
  if (sorted.some(isManagedCloudPg)) {
    sorted = sorted.filter((u) => !isPrivateRailwayUrl(u));
  }

  const preferPrivate =
    !sorted.some(isManagedCloudPg) &&
    !onRender &&
    !onAws &&
    (onRailway || String(process.env.DB_TRY_PRIVATE || '').toLowerCase() === 'true');

  sorted.sort((a, b) => {
    const score = (u: string) => {
      if (isManagedCloudPg(u)) return 0;
      if (preferPrivate) {
        if (isPrivateRailwayUrl(u)) return 1;
        if (isPublicProxyUrl(u)) return 2;
        return 3;
      }
      if (isPublicProxyUrl(u)) return 1;
      if (isPrivateRailwayUrl(u)) return 2;
      return 3;
    };
    return score(a) - score(b);
  });

  if (!preferPrivate && sorted.some(isPublicProxyUrl)) {
    sorted = sorted.filter((u) => !isPrivateRailwayUrl(u));
  }

  return sorted;
}

/** Log once at startup so Railway deploy logs show the fix immediately. */
let connectionConfigLogged = false;
export function logDbConnectionConfig() {
  if (connectionConfigLogged) return;
  connectionConfigLogged = true;

  const candidates = getConnectionCandidates();
  const primary = candidates[0];
  if (!primary) {
    console.error('[db] FIX: no DATABASE_URL / DATABASE_PUBLIC_URL candidates found');
    return;
  }
  const masked = primary.replace(/:[^:@/]+@/, ':***@');
  const host = hostOf(primary);

  console.log(
    `[db] primary host: ${host} candidates=${candidates.length} (${masked.slice(0, 72)}…)`
  );

  if (isNeonUrl(primary)) {
    console.log(
      `[db] provider=Neon pooler=${isNeonPoolerUrl(primary)} ` +
        `(use pooled URL for app; set DATABASE_URL_UNPOOLED for LISTEN/migrations if needed)`
    );
  }

  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);
  const hasPrivate = candidates.some(isPrivateRailwayUrl);
  const hasPublic = candidates.some(isPublicProxyUrl);
  if (onRailway && !hasPrivate && hasPublic && !candidates.some(isManagedCloudPg)) {
    console.warn(
      '[db] WARN: only Railway public proxy URL present — in-cluster hairpin can time out. ' +
        'Prefer Neon DATABASE_URL or Railway private ${{Postgres.DATABASE_URL}}.'
    );
  }
}

function sslFor(connectionString: string) {
  if (process.env.DATABASE_SSL === 'false') return false;
  if (process.env.DATABASE_SSL === 'true') {
    return { rejectUnauthorized: false as const };
  }
  // Private Railway mesh — plain TCP (no TLS)
  if (connectionString.includes('railway.internal')) return false;
  // Cloud PostgreSQL providers (Neon, Supabase, Aiven, Render, Railway Proxy) -> TLS required
  if (
    connectionString.includes('rlwy.net') ||
    connectionString.includes('proxy.rlwy.net') ||
    connectionString.includes('railway.app') ||
    connectionString.includes('render.com') ||
    connectionString.includes('neon.tech') ||
    connectionString.includes('supabase.co') ||
    connectionString.includes('supabase.com') ||
    connectionString.includes('aivencloud.com')
  ) {
    return { rejectUnauthorized: false as const };
  }
  // Default: require TLS for any remote host (safe for Neon-style URLs)
  if (connectionString.includes('amazonaws.com') || connectionString.includes('.tech/')) {
    return { rejectUnauthorized: false as const };
  }
  return false;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error(`${label}: timeout exceeded after ${ms}ms`), { code: 'ETIMEDOUT' }));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function destroyPool(keepSchema = false) {
  stopPoolHeartbeat();
  poolReadyPromise = null;
  const oldPool = pool;
  pool = null;
  activeConnectionString = null;
  lastPoolPingAt = 0;
  heartbeatFailures = 0;
  if (oldPool) {
    try {
      // Stuck clients can make pool.end() hang — never block invalidate forever.
      await withTimeout(oldPool.end(), 3_000, 'pool.end');
    } catch (_) {}
  }
  if (!keepSchema) {
    isSchemaInitialized = false;
    schemaInitPromise = null;
  }
}

/** Drop broken pool sockets; keep schema flag when DB tables already exist. */
async function invalidatePool(reason: string) {
  if (invalidateInFlight) return invalidateInFlight;
  invalidateInFlight = (async () => {
    console.warn('[db] pool invalidated:', reason);
    poolGeneration++;
    await destroyPool(isSchemaInitialized);
  })().finally(() => {
    invalidateInFlight = null;
  });
  return invalidateInFlight;
}

function isPoolUsable(p: Pool | null): p is Pool {
  if (!p) return false;
  if ((p as any).ending || (p as any).ended) return false;
  return true;
}

function isRecoverablePgError(err: any): boolean {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  return (
    code === '57P01' ||
    code === '57P03' || // cannot_connect_now (starting up)
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED' ||
    msg.includes('postmaster') ||
    msg.includes('Connection terminated') ||
    msg.includes('calling end on the pool') ||
    msg.includes('timeout exceeded') ||
    msg.includes('the database system is starting up') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('read ECONNRESET') ||
    msg.includes('connect ETIMEDOUT')
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isAwsHosted(): boolean {
  return (
    Boolean(process.env.AWS_EXECUTION_ENV) ||
    Boolean(process.env.ECS_CONTAINER_METADATA_URI) ||
    String(process.env.HOSTING || '').toLowerCase() === 'aws'
  );
}

function defaultPoolMax(): number {
  // Local PostgreSQL never needs connection caps — it runs on the same machine
  // and supports 100 connections by default. Only cap for Neon/PgBouncer remote endpoints.
  const dbUrl = process.env.DATABASE_URL || activeConnectionString || '';
  const isLocal = /(@localhost[:/]|@127\.0\.0\.1[:/]|host=localhost|host=127\.0\.0\.1)/.test(dbUrl) || dbUrl.startsWith('postgresql:///');
  if (isLocal) {
    const n = Number(process.env.DB_POOL_MAX || 20);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 20;
  }
  // Free / soft / Lightsail: never honour oversized DB_POOL_MAX (was 50 → connection storms).
  const tier = String(process.env.RUNTIME_TIER || process.env.RAILWAY_PLAN_TIER || '').toLowerCase();
  const freeSoft = tier === 'free' || String(process.env.LAUNCH_SCALE || 'soft') !== 'peak';
  const awsHobby = isAwsHosted() || tier === 'hobby' || tier === 'free';
  if (process.env.DB_POOL_MAX) {
    const n = Number(process.env.DB_POOL_MAX);
    if (Number.isFinite(n) && n > 0) {
      const softCap = awsHobby ? 5 : 10;
      const capped = freeSoft ? Math.min(Math.floor(n), softCap) : Math.floor(n);
      return capped;
    }
  }
  const fromTier = resolveDbPoolMaxPerReplica(getRuntimeTuning().dbPoolMax);
  return awsHobby ? Math.min(fromTier, 5) : fromTier;
}

function defaultConnectTimeoutMs(): number {
  const fromEnv = resolveTunedNumber('DB_CONNECT_TIMEOUT_MS', 'dbConnectTimeoutMs');
  if (!process.env.DB_CONNECT_TIMEOUT_MS && (isAwsHosted() || isNeonUrl(process.env.DATABASE_URL || ''))) {
    return Math.min(Math.max(fromEnv, 6_000), 10_000);
  }
  return fromEnv;
}

function defaultQueryTimeoutMs(): number {
  const fromEnv = Number(process.env.DB_QUERY_TIMEOUT_MS || 0);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  const dbUrl = process.env.DATABASE_URL || activeConnectionString || '';
  const isLocal = /(@localhost[:/]|@127\.0\.0\.1[:/]|host=localhost|host=127\.0\.0\.1)/.test(dbUrl);
  if (isLocal) return 30_000;
  if (isAwsHosted() || isNeonUrl(process.env.DATABASE_URL || '')) return 12_000;
  return 15_000;
}

function ensurePoolBudgetMs(): number {
  const connectMs = defaultConnectTimeoutMs();
  const neonish =
    isNeonUrl(activeConnectionString || '') ||
    isNeonUrl(process.env.DATABASE_URL || '');
  const defaultBudget = neonish
    ? Math.min(Math.max(connectMs, 8_000), 12_000)
    : Math.min(connectMs * 2 + 5_000, 25_000);
  return Number(process.env.DB_ENSURE_TIMEOUT_MS || defaultBudget);
}

function defaultHeartbeatMs(): number {
  return resolveTunedNumber('DB_HEARTBEAT_MS', 'dbHeartbeatMs');
}

function createPool(connectionString: string): Pool {
  const normalized = normalizeConnectionString(connectionString);
  const neon = isNeonUrl(normalized);
  const isLocal = /(@localhost[:/]|@127\.0\.0\.1[:/]|host=localhost|host=127\.0\.0\.1)/.test(normalized);
  const poolerFriendly = !isLocal && (neon || isAwsHosted());
  const idleRaw = Number(process.env.DB_IDLE_TIMEOUT_MS || (poolerFriendly ? 5_000 : 600_000));
  const idleTimeoutMillis = poolerFriendly
    ? Math.min(Math.max(Number.isFinite(idleRaw) ? idleRaw : 5_000, 1_000), 8_000)
    : idleRaw;
  const queryMs = defaultQueryTimeoutMs();
  const poolMax = isLocal ? 20 : (poolerFriendly ? Math.min(defaultPoolMax(), 5) : defaultPoolMax());
  const p = new Pool({
    connectionString: normalized,
    max: poolMax,
    idleTimeoutMillis,
    connectionTimeoutMillis: defaultConnectTimeoutMs(),
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || queryMs),
    query_timeout: queryMs,
    keepAlive: !poolerFriendly,
    keepAliveInitialDelayMillis: poolerFriendly ? 0 : 10_000,
    allowExitOnIdle: poolerFriendly,
    ssl: sslFor(normalized),
  });

  p.on('connect', (client) => {
    client.query('SET idle_in_transaction_session_timeout = 15000').catch(() => {});
  });

  p.on('error', (err) => {
    console.warn('[db] idle pool socket error:', err?.message || err);
    if (isRecoverablePgError(err)) {
      void invalidatePool('pool socket error');
    }
  });

  return p;
}

// Background heartbeat — keeps pool warm 24/7; reconnects on failure
let heartbeatInterval: NodeJS.Timeout | null = null;
function stopPoolHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function startPoolHeartbeat(activePool: Pool) {
  stopPoolHeartbeat();
  const generation = poolGeneration;
  heartbeatInterval = setInterval(async () => {
    if (generation !== poolGeneration || !isPoolUsable(pool)) return;
    try {
      const client = await activePool.connect();
      try {
        await client.query('SELECT 1');
        lastPoolPingAt = Date.now();
        heartbeatFailures = 0;
      } finally {
        client.release();
      }
    } catch (err: any) {
      heartbeatFailures++;
      console.warn(`[db] heartbeat failed (${heartbeatFailures}/5):`, err?.message || err);
      // Free-tier blips are common — require sustained failure before tearing the pool down.
      if (heartbeatFailures >= 5) {
        heartbeatFailures = 0;
        void invalidatePool('heartbeat failed');
      }
    }
  }, defaultHeartbeatMs());
}

export async function getDbPool(): Promise<Pool> {
  return ensurePoolReady();
}

/** Cheap read path — uses pool.query (auto-checkout) instead of a held client. */
export async function queryDb(text: string, params?: any[]) {
  const queryMs = defaultQueryTimeoutMs();
  const connectMs = defaultConnectTimeoutMs();
  // Bound the whole acquire+query path so waiters on a stuck ensure never exceed budget.
  const totalMs = Math.min(queryMs + connectMs, ensurePoolBudgetMs() + queryMs);
  try {
    return await withTimeout(
      (async () => {
        const activePool = await ensurePoolReady();
        return activePool.query(text, params);
      })(),
      totalMs,
      'queryDb'
    );
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/timeout|terminat|ECONNRESET|not queryable/i.test(msg)) {
      await invalidatePool('queryDb timeout/reset');
    }
    throw err;
  }
}

export type EphemeralDbOpts = {
  /** Wall-clock budget for connect + callback (ms). */
  budgetMs?: number;
  /** Postgres statement_timeout for this session (ms). */
  statementTimeoutMs?: number;
  label?: string;
  /** Drop shared pool when this path times out (default true). */
  recyclePoolOnTimeout?: boolean;
};

/**
 * Short-lived dedicated Client — bypasses the shared pool waiter queue entirely.
 * Use for admin analytics / role checks when a wedged pool would hang getDbClient/queryDb.
 */
export async function withEphemeralClient<T>(
  fn: (client: Client) => Promise<T>,
  opts: EphemeralDbOpts = {}
): Promise<T> {
  const neonish = isAwsHosted() || isNeonUrl(process.env.DATABASE_URL || '');
  const budgetMs = Math.max(
    2_000,
    Number(opts.budgetMs || process.env.DB_EPHEMERAL_BUDGET_MS || (neonish ? 12_000 : 15_000))
  );
  const statementTimeoutMs = Math.max(
    1_000,
    Number(
      opts.statementTimeoutMs ||
        process.env.DB_EPHEMERAL_STATEMENT_TIMEOUT_MS ||
        Math.min(defaultQueryTimeoutMs(), neonish ? 8_000 : 12_000)
    )
  );
  const label = opts.label || 'ephemeral';
  const recycle = opts.recyclePoolOnTimeout !== false;
  const connectMs = Math.min(defaultConnectTimeoutMs(), neonish ? 6_000 : 8_000);

  const candidates = getConnectionCandidates();
  if (!candidates.length) {
    throw Object.assign(new Error('No DATABASE_URL configured'), { code: 'ENOCONFIG' });
  }

  const run = async (): Promise<T> => {
    let lastErr: Error | null = null;
    // Prefer pooled Neon URL first (same as app); at most 2 hosts.
    for (const connStr of candidates.slice(0, 2)) {
      const normalized = normalizeConnectionString(connStr);
      const client = new Client({
        connectionString: normalized,
        ssl: sslFor(normalized),
        connectionTimeoutMillis: connectMs,
        keepAlive: false,
      });
      try {
        await withTimeout(client.connect(), connectMs, `${label}.connect`);
        // Session-level cap — SET LOCAL needs a transaction; this Client is single-use.
        await client.query(`SET statement_timeout = ${Math.floor(statementTimeoutMs)}`);
        const result = await fn(client);
        try {
          await withTimeout(client.end(), 2_000, `${label}.end`);
        } catch {
          try {
            client.end();
          } catch {
            /* ignore */
          }
        }
        return result;
      } catch (err: any) {
        lastErr = err;
        try {
          await withTimeout(client.end(), 1_500, `${label}.end.fail`);
        } catch {
          try {
            (client as any).end?.();
          } catch {
            /* ignore */
          }
        }
        const msg = String(err?.message || err);
        // Auth / SQL errors — do not try another host.
        if (!isRecoverablePgError(err) && !/timeout|ECONN|ENOTFOUND|connect/i.test(msg)) {
          throw err;
        }
      }
    }
    throw lastErr || new Error(`${label}: could not open database connection`);
  };

  try {
    return await withTimeout(run(), budgetMs, label);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (recycle && /timeout|terminat|ECONNRESET|ECONNREFUSED|not queryable|ENOTFOUND/i.test(msg)) {
      // Never block the request on pool teardown.
      void invalidatePool(`${label} timeout/reset`);
    }
    throw err;
  }
}

/** One-shot query on a fresh Client (pool-bypass). */
export async function queryEphemeral(text: string, params?: any[], opts?: EphemeralDbOpts) {
  return withEphemeralClient((client) => client.query(text, params), {
    ...opts,
    label: opts?.label || 'queryEphemeral',
  });
}

/** Boot-time warmup — call from instrumentation before crons. */
export async function warmDbConnection(): Promise<boolean> {
  try {
    const client = await getDbClient();
    releaseDbClient(client);
    console.log('[db] warm connection OK');
    return true;
  } catch (err: any) {
    console.error('[db] warm connection failed:', err?.message || err);
    return false;
  }
}

/** Readiness probe for monitoring / Caddy. Uses warm pool (no held client). Bounded total time. */
export async function pingDb(): Promise<{ ok: boolean; host?: string; message?: string }> {
  const neonish = isAwsHosted() || isNeonUrl(process.env.DATABASE_URL || '');
  const totalMs = Number(
    process.env.DB_PING_TOTAL_MS || process.env.DB_READY_TIMEOUT_MS || (neonish ? 8_000 : 10_000)
  );
  const retries = Math.max(1, Number(process.env.DB_PING_RETRIES || (neonish ? 1 : 2)));
  const perAttemptMs = Math.min(
    Number(process.env.DB_PING_TIMEOUT_MS || (neonish ? 4_000 : 5_000)),
    Math.max(2_000, Math.floor(totalMs / retries))
  );

  const run = async (): Promise<{ ok: boolean; host?: string; message?: string }> => {
    let lastMsg = 'Database unreachable';
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Prefer pool.query — never hold a client across awaits for a ping.
        await withTimeout(queryDb('SELECT 1'), perAttemptMs, 'pingDb');
        const host = activeConnectionString
          ? new URL(activeConnectionString.replace(/^postgres(ql)?:\/\//, 'http://')).hostname
          : undefined;
        return { ok: true, host };
      } catch (err: any) {
        lastMsg = err?.message || 'Database unreachable';
        if (/timeout/i.test(lastMsg)) {
          await invalidatePool('pingDb timeout');
        }
        if (!isRecoverablePgError(err) || attempt === retries - 1) break;
        await sleep(200 * (attempt + 1));
      }
    }
    return { ok: false, message: lastMsg };
  };

  try {
    return await withTimeout(run(), totalMs, 'pingDb.total');
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Database unreachable' };
  }
}

/** Graceful shutdown on SIGTERM (Railway deploy rollover). */
export async function shutdownDb() {
  poolGeneration++;
  await destroyPool(false);
}

async function probeConnection(connStr: string): Promise<void> {
  const normalized = normalizeConnectionString(connStr);
  // Keep probes inside ensurePool budget — long Neon probes made ready/products hang.
  const base = defaultConnectTimeoutMs();
  const timeoutMs = isPrivateRailwayUrl(normalized)
    ? Math.min(Math.max(base, 4_000), 8_000)
    : Math.min(Math.max(base, isNeonUrl(normalized) ? 6_000 : 5_000), 10_000);
  const client = new Client({
    connectionString: normalized,
    ssl: sslFor(normalized),
    connectionTimeoutMillis: timeoutMs,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
  } catch (err: any) {
    try {
      await client.end();
    } catch (_) {}
    const msg = String(err?.message || err);
    throw Object.assign(new Error(`${hostOf(normalized)}: ${msg}`), {
      code: err?.code,
      cause: err,
    });
  }
}

/** Config for long-lived dedicated pg Clients (LISTEN / NOTIFY helpers). */
export function getDbConnectionConfig() {
  const pooled =
    activeConnectionString ||
    getConnectionCandidates()[0] ||
    '';
  // Neon PgBouncer pooler does not support LISTEN — prefer unpooled/direct.
  const unpooled = (
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_DIRECT_URL ||
    neonDirectUrlFromPooler(pooled) ||
    pooled
  ).trim();
  const connectionString = normalizeConnectionString(unpooled || pooled);
  return {
    connectionString,
    ssl: sslFor(connectionString),
    keepAlive: true,
    connectionTimeoutMillis: defaultConnectTimeoutMs(),
  };
}

/** Resolve a working connection string (warms pool if needed). Use before LISTEN. */
export async function resolveDbConnectionConfig() {
  logDbConnectionConfig();
  const client = await getDbClient();
  releaseDbClient(client);
  return getDbConnectionConfig();
}

function wrapPoolClient(client: any) {
  if (client._hasEndAlias) return client;
  client._hasEndAlias = true;
  client._released = false;
  const safeRelease = () => {
    if (client._released) return;
    client._released = true;
    try {
      client.release();
    } catch (_) {
      /* already returned to pool */
    }
  };
  client.end = safeRelease;
  const originalRelease = client.release.bind(client);
  client.release = (err?: Error | boolean) => {
    if (client._released) return;
    client._released = true;
    try {
      originalRelease(err);
    } catch (_) {
      /* ignore */
    }
  };
  return client;
}

async function ensureSchemaReady(activePool: Pool) {
  if (isSchemaInitialized) return;
  if (process.env.SKIP_RUNTIME_SCHEMA_INIT === 'true') {
    isSchemaInitialized = true;
    return;
  }
  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      const initClient = await activePool.connect();
      try {
        // Always run — idempotent migrations + category seed (existing DBs skip full CREATE).
        await runSchemaInit(initClient);
        isSchemaInitialized = true;
      } catch (e: any) {
        console.error('[db] schema init failed:', e?.message || e);
        schemaInitPromise = null;
        throw e;
      } finally {
        initClient.release();
      }
    })();
  }
  await schemaInitPromise;
}

/** Age after which a previously-good pool must be re-verified (Neon idle kill). */
function poolStaleMs(): number {
  const hb = defaultHeartbeatMs();
  return Math.max(hb * 2, Number(process.env.DB_POOL_STALE_MS || 120_000));
}

/** Single-flight pool setup — keeps pool alive 24/7, only reconnects on real failure. */
async function ensurePoolReady(): Promise<Pool> {
  const connectMs = defaultConnectTimeoutMs();
  const budget = ensurePoolBudgetMs();
  // Fast path: recent heartbeat → instant return (Neon sockets die when idle; do not trust old pings)
  if (
    isPoolUsable(pool) &&
    isSchemaInitialized &&
    lastPoolPingAt > 0 &&
    Date.now() - lastPoolPingAt < poolStaleMs()
  ) {
    return pool;
  }
  // CRITICAL: waiters must also be bounded — bare `return poolReadyPromise` hung catalog/admin.
  if (poolReadyPromise) {
    return withTimeout(poolReadyPromise, budget, 'ensurePoolReady.wait');
  }

  const myGeneration = poolGeneration;
  poolReadyPromise = (async () => {
    // If pool exists and is usable, verify with a bounded checkout (never hang forever)
    if (isPoolUsable(pool) && activeConnectionString) {
      let testClient: any = null;
      try {
        testClient = await withTimeout(pool!.connect(), connectMs, 'pool.verify connect');
        await withTimeout(testClient.query('SELECT 1'), Math.min(connectMs, 4_000), 'pool.verify query');
        testClient.release();
        testClient = null;
        await ensureSchemaReady(pool!);
        lastPoolPingAt = Date.now();
        return pool!;
      } catch {
        try {
          if (testClient) testClient.release(true);
        } catch (_) {}
        // Pool is broken / hung — fall through to full reconnect
        await destroyPool(isSchemaInitialized);
      }
    }

    const candidates = getConnectionCandidates();
    // Lightsail/Neon: keep reconnect budget tight so /api/ready returns instead of proxy 0-byte hang
    const rounds = Number(process.env.DB_CONNECT_ROUNDS || (isAwsHosted() ? 1 : 2));
    let lastErr: Error | null = null;

    for (let round = 0; round < rounds; round++) {
      for (const connStr of candidates) {
        try {
          const normalized = normalizeConnectionString(connStr);
          await probeConnection(normalized);

          if (myGeneration !== poolGeneration) {
            throw new Error('pool setup superseded by invalidation');
          }

          if (!isPoolUsable(pool) || activeConnectionString !== normalized) {
            await destroyPool(isSchemaInitialized);
            activeConnectionString = normalized;
            pool = createPool(normalized);
            console.log(`[db] connected via ${hostOf(normalized)}`);
          }

          await ensureSchemaReady(pool!);
          lastPoolPingAt = Date.now();
          heartbeatFailures = 0;
          startPoolHeartbeat(pool!);
          return pool!;
        } catch (err: any) {
          lastErr = err;
          const msg = String(err?.message || err);
          if (msg.includes('superseded by invalidation')) {
            poolReadyPromise = null;
            return ensurePoolReady();
          }
          console.error(`[db] connect failed (${hostOf(connStr)}):`, msg);
          await destroyPool(isSchemaInitialized);

          if (isPrivateRailwayUrl(connStr)) {
            console.warn('[db] private host failed — trying public proxy fallback…');
          }
        }
      }

      if (round < rounds - 1 && lastErr && isRecoverablePgError(lastErr)) {
        const waitMs = Math.min(1_500, 400 * (round + 1));
        console.warn(`[db] retrying all candidates (round ${round + 2}/${rounds}) in ${waitMs}ms…`);
        await sleep(waitMs);
        continue;
      }
      break;
    }

    throw lastErr || new Error('Could not connect to PostgreSQL');
  })();

  try {
    // Bound total setup so /api/ready never waits on a stuck single-flight forever.
    return await withTimeout(poolReadyPromise, budget, 'ensurePoolReady');
  } catch (err) {
    void invalidatePool('ensurePoolReady failed');
    throw err;
  } finally {
    // Always clear so a stale lastPoolPingAt can re-enter verify (do not cache resolved forever)
    poolReadyPromise = null;
  }
}

export async function getDbClient() {
  // Keep request latency bounded — long retries caused Admin 499/502 hangs.
  const retries = Number(process.env.DB_ACQUIRE_RETRIES || 3);
  const connectMs = defaultConnectTimeoutMs();
  let lastErr: Error | null = null;
  const neon =
    isNeonUrl(process.env.DATABASE_URL || '') ||
    isNeonUrl(activeConnectionString || '');

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const activePool = await ensurePoolReady();
      if (!isPoolUsable(activePool)) {
        await invalidatePool('pool not usable after ensure');
        continue;
      }
      // Exhausted/hung pool checkout can wait forever — always bound acquire.
      const client: any = await withTimeout(
        activePool.connect(),
        connectMs,
        'pool.connect'
      );
      wrapPoolClient(client);
      return client;
    } catch (err: any) {
      lastErr = err;
      console.warn(`[db] acquire attempt ${attempt + 1}/${retries}:`, err?.message || err);
      if (!isRecoverablePgError(err)) throw err;

      const msg = String(err?.message || err);
      // Neon: drop poisoned pool immediately — stale pooler sockets hang Google auth / ready.
      if (neon || msg.includes('starting up') || msg.includes('terminated') || msg.includes('timeout')) {
        await invalidatePool('client acquire failed');
      }
      await sleep(Math.min(1_500, 250 * (attempt + 1)));
    }
  }

  throw lastErr || new Error('Could not acquire database client');
}

/** Soft-fail helper for routes that should degrade gracefully when DB is down. */
export async function tryGetDbClient(): Promise<any | null> {
  try {
    return await getDbClient();
  } catch (err: any) {
    console.warn('[db] tryGetDbClient:', err?.message || err);
    return null;
  }
}

/** Never throws if client is null (after connect timeout). */
export function releaseDbClient(client: any) {
  if (!client) return;
  try {
    if (typeof client.release === 'function') client.release();
    else if (typeof client.end === 'function') client.end();
  } catch (_) {
    /* ignore */
  }
}

async function runSchemaInit(client: any) {

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          phone VARCHAR(255) NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          google_id VARCHAR(255),
          profile_image TEXT,
          role VARCHAR(50) DEFAULT 'customer',
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categories (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          image TEXT,
          parent_category VARCHAR(255),
          status VARCHAR(50) DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS books (
          id VARCHAR(255) PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          slug VARCHAR(255) UNIQUE NOT NULL,
          isbn VARCHAR(100),
          author VARCHAR(255) DEFAULT 'Blessing Editorial Board',
          publisher VARCHAR(255) DEFAULT 'Blessing Pathway Education',
          edition VARCHAR(50) DEFAULT '2026 Edition',
          language VARCHAR(50) DEFAULT 'Tamil / English',
          semester VARCHAR(50),
          department VARCHAR(50),
          subject VARCHAR(100),
          category_id VARCHAR(255) REFERENCES categories(id) ON DELETE SET NULL,
          description TEXT,
          price NUMERIC NOT NULL,
          discount_price NUMERIC,
          stock INT DEFAULT 50,
          pages INT DEFAULT 240,
          weight VARCHAR(50) DEFAULT '400g',
          cover_image TEXT,
          status VARCHAR(50) DEFAULT 'published',
          featured BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS book_images (
          id VARCHAR(255) PRIMARY KEY,
          book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
          image_url TEXT NOT NULL,
          display_order INT DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS addresses (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
          full_name VARCHAR(255) NOT NULL,
          phone VARCHAR(255) NOT NULL,
          alternate_phone VARCHAR(20),
          address_line1 TEXT NOT NULL,
          address_line2 TEXT,
          city VARCHAR(255) NOT NULL,
          district VARCHAR(255),
          state VARCHAR(255) DEFAULT 'Tamil Nadu',
          country VARCHAR(255) DEFAULT 'India',
          pincode VARCHAR(50) NOT NULL,
          landmark VARCHAR(255),
          is_default BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cart (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS cart_items (
          id VARCHAR(255) PRIMARY KEY,
          cart_id VARCHAR(255) REFERENCES cart(id) ON DELETE CASCADE,
          book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
          quantity INT DEFAULT 1,
          price NUMERIC NOT NULL
        );

        CREATE TABLE IF NOT EXISTS wishlist (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) REFERENCES users(id) ON DELETE CASCADE,
          book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
          id VARCHAR(255) PRIMARY KEY,
          order_number VARCHAR(255) UNIQUE NOT NULL,
          user_id VARCHAR(255),
          address_id VARCHAR(255),
          subtotal NUMERIC NOT NULL,
          discount NUMERIC DEFAULT 0,
          shipping_charge NUMERIC DEFAULT 0,
          tax NUMERIC DEFAULT 0,
          total_amount NUMERIC NOT NULL,
          payment_method VARCHAR(50) DEFAULT 'Razorpay',
          payment_status VARCHAR(50) DEFAULT 'Pending',
          order_status VARCHAR(50) DEFAULT 'Confirmed',
          razorpay_order_id VARCHAR(255),
          razorpay_payment_id VARCHAR(255),
          razorpay_signature VARCHAR(255),
          shipment_id VARCHAR(255),
          awb_number VARCHAR(255),
          courier_name VARCHAR(255) DEFAULT 'ST Courier Express',
          tracking_url TEXT,
          estimated_delivery VARCHAR(100),
          shipping_address TEXT,
          packed_at TIMESTAMP,
          shipped_at TIMESTAMP,
          delivered_at TIMESTAMP,
          ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_items (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
          book_id VARCHAR(255),
          book_title VARCHAR(255) NOT NULL,
          book_price NUMERIC NOT NULL,
          quantity INT NOT NULL,
          subtotal NUMERIC NOT NULL
        );

        CREATE TABLE IF NOT EXISTS payments (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
          payment_gateway VARCHAR(50) DEFAULT 'Razorpay',
          payment_id VARCHAR(255),
          transaction_id VARCHAR(255),
          amount NUMERIC NOT NULL,
          currency VARCHAR(10) DEFAULT 'INR',
          status VARCHAR(50) DEFAULT 'SUCCESS',
          paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS reviews (
          id VARCHAR(255) PRIMARY KEY,
          user_name VARCHAR(255),
          user_id VARCHAR(255),
          book_id VARCHAR(255) REFERENCES books(id) ON DELETE CASCADE,
          rating NUMERIC DEFAULT 5.0,
          review TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS whatsapp_otps (
          id VARCHAR(255) PRIMARY KEY,
          phone VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          otp VARCHAR(10) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS order_timeline (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
          status VARCHAR(255) NOT NULL,
          remarks TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
          id VARCHAR(255) PRIMARY KEY DEFAULT 'default',
          status VARCHAR(100) NOT NULL DEFAULT 'INITIALIZING',
          connected BOOLEAN DEFAULT FALSE,
          qr_image TEXT,
          pairing_code VARCHAR(50),
          message TEXT,
          session_data JSONB,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS courier_tracking (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255),
          awb_number VARCHAR(255),
          docket_number VARCHAR(255),
          status VARCHAR(255),
          current_status VARCHAR(255),
          location VARCHAR(255),
          remarks TEXT,
          event_time TIMESTAMP,
          courier_name VARCHAR(100) DEFAULT 'ST Courier Express',
          origin_hub VARCHAR(255),
          destination_hub VARCHAR(255),
          estimated_delivery VARCHAR(255),
          scraped_events JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS whatsapp_logs (
          id VARCHAR(255) PRIMARY KEY,
          order_id VARCHAR(255),
          phone VARCHAR(100) NOT NULL,
          message TEXT NOT NULL,
          provider VARCHAR(100) DEFAULT 'BAILEYS_FREE_UNLIMITED',
          status VARCHAR(50) DEFAULT 'SENT',
          sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS whatsapp_outbox (
          id VARCHAR(255) PRIMARY KEY,
          phone VARCHAR(32) NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          sent_at TIMESTAMP,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_pending
          ON whatsapp_outbox (created_at)
          WHERE sent_at IS NULL;

        CREATE TABLE IF NOT EXISTS coupons (
          id VARCHAR(255) PRIMARY KEY,
          code VARCHAR(50) UNIQUE NOT NULL,
          discount_type VARCHAR(20) DEFAULT 'percentage',
          discount_value NUMERIC NOT NULL,
          minimum_amount NUMERIC DEFAULT 0,
          expiry_date TIMESTAMP,
          usage_limit INT DEFAULT 100,
          status VARCHAR(50) DEFAULT 'active'
        );

        CREATE TABLE IF NOT EXISTS faqs (
          id VARCHAR(255) PRIMARY KEY,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          display_order INT DEFAULT 0,
          status VARCHAR(50) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS settings (
          id VARCHAR(50) PRIMARY KEY DEFAULT 'main',
          site_name VARCHAR(255) DEFAULT 'BLESSING POWER GUIDE',
          support_email VARCHAR(255) DEFAULT 'blessingpowerguide@gmail.com',
          support_phone VARCHAR(255) DEFAULT '+91 98404 18228',
          razorpay_key VARCHAR(255),
          shipping_charge NUMERIC DEFAULT 0,
          tax_percentage NUMERIC DEFAULT 0,
          admin_alert_phones TEXT DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          reset_at TIMESTAMPTZ NOT NULL
        );

        CREATE TABLE IF NOT EXISTS contact_submissions (
          id SERIAL PRIMARY KEY,
          contact_id VARCHAR(100) UNIQUE,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255),
          phone VARCHAR(50) NOT NULL,
          subject VARCHAR(255),
          message TEXT NOT NULL,
          status VARCHAR(50) DEFAULT 'unread',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS notifications (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255),
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          type VARCHAR(50) DEFAULT 'info',
          is_read BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS email_otps (
          id VARCHAR(255) PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          otp VARCHAR(10) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address TEXT;
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_alert_phones TEXT DEFAULT '';
        ALTER TABLE addresses ADD COLUMN IF NOT EXISTS alternate_phone VARCHAR(20);
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id VARCHAR(255);
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN DEFAULT TRUE;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_book
          ON reviews (user_id, book_id) WHERE user_id IS NOT NULL AND book_id IS NOT NULL;
        ALTER TABLE books ADD COLUMN IF NOT EXISTS badge VARCHAR(100) DEFAULT '';
        ALTER TABLE books ADD COLUMN IF NOT EXISTS stock INT DEFAULT 50;
        ALTER TABLE users DROP COLUMN IF EXISTS email_verified;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question VARCHAR(100);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_hash VARCHAR(255);
        ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS title VARCHAR(255);
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS minimum_quantity INT DEFAULT 0;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS offer_type VARCHAR(30) DEFAULT 'discount';
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS condition_mode VARCHAR(20) DEFAULT 'any';
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS used_count INT DEFAULT 0;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS show_in_hero BOOLEAN DEFAULT true;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS per_user_limit INT DEFAULT 1;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS allowed_classes TEXT;
        ALTER TABLE coupons ADD COLUMN IF NOT EXISTS allowed_categories TEXT;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id VARCHAR(255);

        ALTER TABLE order_timeline ADD COLUMN IF NOT EXISTS hub_city VARCHAR(255);
        ALTER TABLE order_timeline ADD COLUMN IF NOT EXISTS awb_number VARCHAR(255);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80);

        -- courier_tracking: old summary schema → event-row columns used by track/ST sync
        ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS awb_number VARCHAR(255);
        ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS status VARCHAR(255);
        ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS location VARCHAR(255);
        ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS remarks TEXT;
        ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS event_time TIMESTAMP;
        ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS docket_number VARCHAR(255);
        ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS current_status VARCHAR(255);
        ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

        CREATE TABLE IF NOT EXISTS coupon_redemptions (
          id VARCHAR(255) PRIMARY KEY,
          coupon_id VARCHAR(255) REFERENCES coupons(id) ON DELETE SET NULL,
          user_id VARCHAR(255),
          order_id VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_user
          ON coupon_redemptions (coupon_id, user_id);
      `);
    } catch (e) {
      /* schema already exists or partial — safe to continue */
    }

    // Critical column heals — run separately so one failure cannot skip the rest
    const heals = [
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS packed_at TIMESTAMP`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMP`,
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMP`,
      `ALTER TABLE order_timeline ADD COLUMN IF NOT EXISTS hub_city VARCHAR(255)`,
      `ALTER TABLE order_timeline ADD COLUMN IF NOT EXISTS awb_number VARCHAR(255)`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS awb_number VARCHAR(255)`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS status VARCHAR(255)`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS location VARCHAR(255)`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS remarks TEXT`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS event_time TIMESTAMP`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS docket_number VARCHAR(255)`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS current_status VARCHAR(255)`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE books ADD COLUMN IF NOT EXISTS badge VARCHAR(100) DEFAULT ''`,
      `ALTER TABLE books ADD COLUMN IF NOT EXISTS stock INT DEFAULT 50`,
      `ALTER TABLE books ADD COLUMN IF NOT EXISTS discount_price NUMERIC`,
      `UPDATE courier_tracking SET awb_number = COALESCE(NULLIF(awb_number, ''), docket_number) WHERE awb_number IS NULL OR awb_number = ''`,
      `UPDATE courier_tracking SET status = COALESCE(NULLIF(status, ''), current_status) WHERE status IS NULL OR status = ''`,
      `UPDATE orders SET ordered_at = COALESCE(ordered_at, created_at, updated_at, NOW()) WHERE ordered_at IS NULL`,
      `UPDATE orders SET created_at = COALESCE(created_at, ordered_at, updated_at, NOW()) WHERE created_at IS NULL`,
    ];
    for (const sql of heals) {
      try {
        await client.query(sql);
      } catch (e: any) {
        console.warn('[db] heal skipped:', e?.message || e);
      }
    }

    // Heal: cancelled orders must not look like collectible COD / paid sales
    try {
      await client.query(`
        UPDATE orders
        SET payment_status = CASE
              WHEN COALESCE(payment_method, '') ILIKE '%cod%'
                THEN 'Cancelled — COD not collectible'
              ELSE 'Cancelled'
            END,
            updated_at = NOW()
        WHERE COALESCE(order_status, '') ILIKE '%cancel%'
          AND COALESCE(payment_status, '') NOT ILIKE '%cancel%'
      `);
    } catch (_) {
      /* ignore */
    }


}

/** Idempotent seed for 6th–12th + combo categories — safe to call before any book insert. */
export async function ensureDefaultCategories(client: any) {
  const categories = [
    { id: 'cat-combos', name: 'Combo Packs', slug: 'combos' },
    { id: 'cat-6th', name: '6th Standard Guides', slug: '6th' },
    { id: 'cat-7th', name: '7th Standard Guides', slug: '7th' },
    { id: 'cat-8th', name: '8th Standard Guides', slug: '8th' },
    { id: 'cat-9th', name: '9th Standard Guides', slug: '9th' },
    { id: 'cat-10th', name: '10th Standard Guides', slug: '10th' },
    { id: 'cat-11th', name: '11th Standard Guides', slug: '11th' },
    { id: 'cat-12th', name: '12th Standard Guides', slug: '12th' },
  ];
  for (const cat of categories) {
    await client.query(
      `INSERT INTO categories (id, name, slug, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (id) DO NOTHING`,
      [cat.id, cat.name, cat.slug]
    );
  }
}

async function ensureAdminUser(client: any) {
  try {
    const phone = String(process.env.ADMIN_PHONE || '9840418228').replace(/\D/g, '').slice(-10);
    const email = String(process.env.ADMIN_EMAIL || 'yogesh234456@gmail.com').toLowerCase().trim();
    const name = process.env.ADMIN_NAME || 'Yogesh Admin';
    const password = process.env.ADMIN_PASSWORD || '123456';
    const passwordHash = hashPassword(password);
    const userId = 'admin-bpg-001';

    const byEmail = await client.query(`SELECT id, email FROM users WHERE LOWER(email) = $1 LIMIT 1`, [email]);
    const byId = await client.query(`SELECT id, email FROM users WHERE id = $1 LIMIT 1`, [userId]);
    const byPhone = await client.query(
      `SELECT id, email FROM users
       WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $1 LIMIT 1`,
      [phone]
    );

    const targetRow = byEmail.rows[0] || byId.rows[0] || byPhone.rows[0] || null;

    if (!targetRow) {
      await client.query(
        `INSERT INTO users (id, name, email, phone, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, 'admin', 'active')
         ON CONFLICT (email) DO UPDATE
         SET role = 'admin', status = 'active', password_hash = EXCLUDED.password_hash`,
        [userId, name, email, phone, passwordHash]
      );
      await client.query(
        `INSERT INTO cart (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
        [`cart-${userId}`, userId]
      );
      console.log(`[db] admin created: phone ${phone}`);
      return;
    }

    const id = targetRow.id;
    const canSetEmail = !targetRow.email || String(targetRow.email).toLowerCase() === email;
    const forcePassword = Boolean(process.env.ADMIN_PASSWORD);

    if (canSetEmail && forcePassword) {
      await client.query(
        `UPDATE users SET name = $1, email = $2, phone = $3, password_hash = $4,
         role = 'admin', status = 'active', updated_at = NOW() WHERE id = $5`,
        [name, email, phone, passwordHash, id]
      );
    } else if (forcePassword) {
      await client.query(
        `UPDATE users SET name = $1, phone = $2, password_hash = $3,
         role = 'admin', status = 'active', updated_at = NOW() WHERE id = $4`,
        [name, phone, passwordHash, id]
      );
    } else {
      await client.query(
        `UPDATE users SET role = 'admin', status = 'active', updated_at = NOW() WHERE id = $1`,
        [id]
      );
    }
  } catch (e: any) {
    console.warn('[db] ensureAdminUser skipped:', e?.message || e);
  }
}
