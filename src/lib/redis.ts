import Redis from 'ioredis';

let redisClient: Redis | null = null;
let isRedisAvailable = false;
let lastConnectionAttempt = 0;
const RECONNECT_COOLDOWN_MS = 30_000;

function getRedisUrl(): string | null {
  if (process.env.DISABLE_REDIS === 'true') return null;
  if (process.env.REDIS_URL) return process.env.REDIS_URL.trim();
  if (process.env.NODE_ENV === 'production') {
    return 'redis://127.0.0.1:6379';
  }
  return null;
}

export function getRedisClient(): Redis | null {
  const url = getRedisUrl();
  if (!url) return null;

  const now = Date.now();
  if (!redisClient && now - lastConnectionAttempt > RECONNECT_COOLDOWN_MS) {
    lastConnectionAttempt = now;
    try {
      const client = new Redis(url, {
        retryStrategy: () => null, // Do not hang with infinite reconnect loops
        maxRetriesPerRequest: 1,
        connectTimeout: 800,
        lazyConnect: true,
        enableOfflineQueue: false,
      });

      client.on('error', (err) => {
        if (isRedisAvailable) {
          console.warn('[redis] connection error:', err?.message || err);
        }
        isRedisAvailable = false;
      });

      client.on('connect', () => {
        isRedisAvailable = true;
        console.log('[redis] connected to', url.replace(/:[^:@/]+@/, ':***@'));
      });

      client.on('close', () => {
        isRedisAvailable = false;
      });

      redisClient = client;
      client.connect().catch(() => {
        isRedisAvailable = false;
      });
    } catch (err: any) {
      console.warn('[redis] init failed:', err?.message || err);
      redisClient = null;
      isRedisAvailable = false;
    }
  }

  return isRedisAvailable ? redisClient : null;
}

/**
 * Ultra-fast Redis atomic rate limiter using INCR + PEXPIRE in a single pipeline.
 * Returns null if Redis is not currently reachable, allowing fallback to in-memory store.
 */
export async function redisRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ success: boolean; remaining: number } | null> {
  const client = getRedisClient();
  if (!client) return null;

  const redisKey = `bpg:rl:${key}`;
  try {
    const pipeline = client.pipeline();
    pipeline.incr(redisKey);
    pipeline.pexpire(redisKey, windowMs);
    const results = await pipeline.exec();

    if (!results || !results[0]) return null;
    const [incrErr, incrResult] = results[0];
    if (incrErr) return null;

    const currentCount = Number(incrResult) || 1;
    if (currentCount > limit) {
      return { success: false, remaining: 0 };
    }
    return { success: true, remaining: Math.max(0, limit - currentCount) };
  } catch {
    return null;
  }
}

/**
 * Safely fetch cached JSON from Redis with key prefix.
 */
export async function redisGetJson<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    const raw = await client.get(`bpg:cache:${key}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Safely store JSON in Redis with explicit TTL (in seconds) to prevent unbounded memory growth.
 */
export async function redisSetJson<T>(key: string, data: T, ttlSeconds: number): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const serialized = JSON.stringify(data);
    await client.set(`bpg:cache:${key}`, serialized, 'EX', Math.max(1, ttlSeconds));
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete key from Redis cache.
 */
export async function redisDel(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    await client.del(`bpg:cache:${key}`);
    return true;
  } catch {
    return false;
  }
}
