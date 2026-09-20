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

  if (!redisClient || redisClient.status === 'end') {
    try {
      const client = new Redis(url, {
        retryStrategy: (times) => {
          // Automatic resilient reconnect: retry every 1-3 seconds
          if (times > 50) return 5000;
          return Math.min(times * 500, 2000);
        },
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
        lazyConnect: false,
        enableOfflineQueue: false,
      });

      client.on('error', (err) => {
        if (isRedisAvailable) {
          console.warn('[redis] connection error:', err?.message || err);
        }
        isRedisAvailable = false;
      });

      client.on('ready', () => {
        isRedisAvailable = true;
      });

      client.on('connect', () => {
        isRedisAvailable = true;
        console.log('[redis] connected to', url.replace(/:[^:@/]+@/, ':***@'));
      });

      client.on('close', () => {
        isRedisAvailable = false;
      });

      client.on('end', () => {
        isRedisAvailable = false;
        redisClient = null;
      });

      redisClient = client;
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
    // Atomic fixed-window rate limit: only set TTL on first request (when count is 1).
    // This prevents retry storms from resetting the TTL and trapping users in endless 429 loops.
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;
    const result = (await client.eval(luaScript, 1, redisKey, windowMs)) as number;
    const currentCount = Number(result) || 1;
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

/**
 * Safely delete keys matching pattern from Redis cache using SCAN to avoid blocking the event loop.
 */
export async function redisDelPattern(pattern: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) return false;

  try {
    const stream = client.scanStream({
      match: `bpg:cache:${pattern}`,
      count: 100,
    });
    const keysToDelete: string[] = [];
    for await (const resultKeys of stream) {
      if (Array.isArray(resultKeys) && resultKeys.length > 0) {
        keysToDelete.push(...resultKeys);
      }
    }
    if (keysToDelete.length > 0) {
      await client.del(...keysToDelete);
    }
    return true;
  } catch (err: any) {
    console.warn('[redis] redisDelPattern failed:', err?.message || err);
    return false;
  }
}

