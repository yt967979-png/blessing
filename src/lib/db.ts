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

/** Strip sslmode from URL — pg v8 treats sslmode=require as verify-full and breaks Railway proxy. */
function normalizeConnectionString(url: string): string {
  let u = url.trim();
  u = u.replace(/([?&])sslmode=[^&]*/gi, '$1');
  u = u.replace(/([?&])uselibpqcompat=[^&]*/gi, '$1');
  u = u.replace(/\?&/g, '?').replace(/[?&]$/g, '');
  return u;
}

function buildUrlFromPgEnv(): string | null {
  if (!process.env.PGHOST || !process.env.PGUSER || !process.env.PGPASSWORD) return null;
  const user = encodeURIComponent(process.env.PGUSER);
  const pass = encodeURIComponent(process.env.PGPASSWORD);
  const host = process.env.PGHOST;
  const port = process.env.PGPORT || 5432;
  const db = process.env.PGDATABASE || 'railway';
  return `postgresql://${user}:${pass}@${host}:${port}/${db}`;
}

function getConnectionCandidates(): string[] {
  const raw: string[] = [];

  const fromPgEnv = buildUrlFromPgEnv();
  if (fromPgEnv) raw.push(fromPgEnv);

  raw.push(
    ...( [
      process.env.DATABASE_URL,
      process.env.DATABASE_PUBLIC_URL,
      process.env.DATABASE_PRIVATE_URL,
      process.env.POSTGRES_URL,
    ].filter(Boolean) as string[])
  );

  // Static emergency fallback URL if Railway variables temporarily reset
  const fallbackUrl = 'postgresql://postgres:USdOHOzspyXMPFmDnfsjkxoSIGedYwgk@sakura.proxy.rlwy.net:32874/railway';
  raw.push(fallbackUrl);

  const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_ID);
  const sorted = [...new Set(raw.map(normalizeConnectionString))].sort((a, b) => {
    const score = (u: string) => {
      if (onRailway && u.includes('railway.internal')) return 0;
      if (u.includes('rlwy.net') || u.includes('proxy.rlwy.net')) return 0;
      if (u.includes('railway.internal')) return 2;
      return 3;
    };
    return score(a) - score(b);
  });

  return sorted;
  return sorted;
}

/** Log once at startup so Railway deploy logs show the fix immediately. */
let connectionConfigLogged = false;
export function logDbConnectionConfig() {
  if (connectionConfigLogged) return;
  connectionConfigLogged = true;

  const candidates = getConnectionCandidates();
  const primary = candidates[0];
  const masked = primary.replace(/:[^:@/]+@/, ':***@');
  const host = (() => {
    try {
      return new URL(primary.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
    } catch {
      return '(unparseable)';
    }
  })();

  console.log(`[db] primary host: ${host} (${masked.slice(0, 72)}…)`);

  const dbUrl = process.env.DATABASE_URL || '';
  const hasPublic = candidates.some(
    (u) => u.includes('rlwy.net') || u.includes('proxy.rlwy.net')
  );
  if (dbUrl.includes('railway.internal') && !hasPublic) {
    console.error(
      '[db] FIX: DATABASE_URL points at postgres.railway.internal but that hostname is not resolving. ' +
        'On Railway → Web Service → Variables, replace DATABASE_URL with: DATABASE_URL=${{Postgres.DATABASE_PUBLIC_URL}} ' +
        '(or add DATABASE_PUBLIC_URL=${{Postgres.DATABASE_PUBLIC_URL}} and redeploy).'
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
  // Public Railway proxy / other hosted Postgres
  if (
    connectionString.includes('rlwy.net') ||
    connectionString.includes('proxy.rlwy.net') ||
    connectionString.includes('railway.app') ||
    connectionString.includes('render.com')
  ) {
    return { rejectUnauthorized: false as const };
  }
  return false;
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
      await oldPool.end();
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
    msg.includes('postmaster') ||
    msg.includes('Connection terminated') ||
    msg.includes('calling end on the pool') ||
    msg.includes('timeout exceeded')
  );
}

function defaultPoolMax(): number {
  if (process.env.DB_POOL_MAX) return Number(process.env.DB_POOL_MAX);
  return resolveDbPoolMaxPerReplica(getRuntimeTuning().dbPoolMax);
}

function defaultConnectTimeoutMs(): number {
  return resolveTunedNumber('DB_CONNECT_TIMEOUT_MS', 'dbConnectTimeoutMs');
}

function defaultHeartbeatMs(): number {
  return resolveTunedNumber('DB_HEARTBEAT_MS', 'dbHeartbeatMs');
}

function createPool(connectionString: string): Pool {
  const normalized = normalizeConnectionString(connectionString);
  const p = new Pool({
    connectionString: normalized,
    max: defaultPoolMax(),
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 120000),
    connectionTimeoutMillis: defaultConnectTimeoutMs(),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    ssl: sslFor(normalized),
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
      console.warn(`[db] heartbeat failed (${heartbeatFailures}/3):`, err?.message || err);
      if (heartbeatFailures >= 3) {
        heartbeatFailures = 0;
        void invalidatePool('heartbeat failed');
      }
    }
  }, defaultHeartbeatMs());
}

export async function getDbPool(): Promise<Pool> {
  return ensurePoolReady();
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

/** Readiness probe for Railway / monitoring. */
export async function pingDb(): Promise<{ ok: boolean; host?: string; message?: string }> {
  try {
    const client = await getDbClient();
    await client.query('SELECT 1');
    releaseDbClient(client);
    const host = activeConnectionString
      ? new URL(activeConnectionString.replace(/^postgres(ql)?:\/\//, 'http://')).hostname
      : undefined;
    return { ok: true, host };
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
  const attempts = Number(process.env.DB_CONNECT_RETRIES || 3);
  let lastErr: Error | null = null;

  for (let i = 0; i < attempts; i++) {
    const client = new Client({
      connectionString: normalized,
      ssl: sslFor(normalized),
      connectionTimeoutMillis: defaultConnectTimeoutMs(),
    });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return;
    } catch (err: any) {
      lastErr = err;
      try {
        await client.end();
      } catch (_) {}
      if (i < attempts - 1) {
        const delay = (i + 1) * 4000;
        console.warn(`[db] probe ${i + 1}/${attempts} failed (${err.message}), retry in ${delay}ms…`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr || new Error('Could not connect to PostgreSQL');
}

/** Config for long-lived dedicated pg Clients (LISTEN / NOTIFY helpers). */
export function getDbConnectionConfig() {
  const connectionString = normalizeConnectionString(
    activeConnectionString || getConnectionCandidates()[0]
  );
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

/** Single-flight pool setup — prevents connection storms at cold start. */
async function ensurePoolReady(): Promise<Pool> {
  const staleMs = Number(process.env.DB_POOL_STALE_MS || 180000);
  if (
    isPoolUsable(pool) &&
    isSchemaInitialized &&
    lastPoolPingAt > 0 &&
    Date.now() - lastPoolPingAt < staleMs
  ) {
    return pool;
  }
  if (poolReadyPromise) return poolReadyPromise;

  const myGeneration = poolGeneration;
  poolReadyPromise = (async () => {
    const candidates = getConnectionCandidates();
    let lastErr: Error | null = null;

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
          const host = (() => {
            try {
              return new URL(normalized.replace(/^postgres(ql)?:\/\//, 'http://')).hostname;
            } catch {
              return '(unknown)';
            }
          })();
          console.log(`[db] connected via ${host}`);
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
        console.error('[db] connect failed:', msg);
        await destroyPool(isSchemaInitialized);

        const isPrivateDnsFail =
          msg.includes('ENOTFOUND') && connStr.includes('railway.internal');
        if (isPrivateDnsFail) {
          console.warn('[db] postgres.railway.internal not found — trying public URL next…');
          continue;
        }
        if (candidates.indexOf(connStr) < candidates.length - 1) continue;
      }
    }

    throw lastErr || new Error('Could not connect to PostgreSQL');
  })();

  try {
    return await poolReadyPromise;
  } catch (err) {
    poolReadyPromise = null;
    throw err;
  }
}

export async function getDbClient() {
  const retries = Number(process.env.DB_ACQUIRE_RETRIES || 3);
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const activePool = await ensurePoolReady();
      if (!isPoolUsable(activePool)) {
        await invalidatePool('pool not usable after ensure');
        continue;
      }
      const client: any = await activePool.connect();
      wrapPoolClient(client);
      return client;
    } catch (err: any) {
      lastErr = err;
      console.warn(`[db] acquire attempt ${attempt + 1}/${retries}:`, err?.message || err);
      if (isRecoverablePgError(err)) {
        await invalidatePool('client acquire failed');
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
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
    if (typeof client.end === 'function') client.end();
    else if (typeof client.release === 'function') client.release();
  } catch (_) {
    /* ignore */
  }
}

async function runSchemaInit(client: any) {
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`);
    } catch (e) {}

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
          ordered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
          order_id VARCHAR(255) REFERENCES orders(id) ON DELETE CASCADE,
          docket_number VARCHAR(255) NOT NULL,
          courier_name VARCHAR(100) DEFAULT 'ST Courier Express',
          current_status VARCHAR(255),
          origin_hub VARCHAR(255),
          destination_hub VARCHAR(255),
          estimated_delivery VARCHAR(255),
          scraped_events JSONB,
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
          tax_percentage NUMERIC DEFAULT 0
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
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code VARCHAR(50);
        ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id VARCHAR(255);

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

    // Ensure default admin + catalog categories (empty DB or missing seeds)
    await ensureDefaultCategories(client);
    await ensureAdminUser(client);
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
    const email = String(process.env.ADMIN_EMAIL || 'admin@blessingpowerguide.com').toLowerCase().trim();
    const name = process.env.ADMIN_NAME || 'Admin';
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe@BPG2026';
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
