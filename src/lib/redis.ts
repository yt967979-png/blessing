import Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisDisabled = false;

// Fallback in-memory LRU store when Redis is unavailable
const memoryFallback = new Map<string, { value: string; expiresAt: number }>();

function getRedisInstance(): Redis | null {
  if (redisDisabled) return null;
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      enableOfflineQueue: false,
      lazyConnect: true,
    });

    client.on('error', (err: any) => {
      console.warn('[redis] connection error, using in-memory fallback:', err?.message || err);
    });

    redisClient = client;
    return redisClient;
  } catch {
    redisDisabled = true;
    return null;
  }
}

/** Get cached JSON or string (tries Redis first, then in-memory RAM map fallback). */
export async function getCache<T = any>(key: string): Promise<T | null> {
  const client = getRedisInstance();
  if (client) {
    try {
      const raw = await client.get(key);
      if (raw) return JSON.parse(raw) as T;
    } catch {
      // Fall through to memory fallback
    }
  }

  const mem = memoryFallback.get(key);
  if (mem && Date.now() < mem.expiresAt) {
    try {
      return JSON.parse(mem.value) as T;
    } catch {
      return null;
    }
  }
  return null;
}

/** Set cached value with TTL in seconds. */
export async function setCache(key: string, value: any, ttlSeconds = 60): Promise<void> {
  const stringified = JSON.stringify(value);

  const client = getRedisInstance();
  if (client) {
    try {
      await client.setex(key, ttlSeconds, stringified);
    } catch {
      // Fall through to memory fallback
    }
  }

  memoryFallback.set(key, {
    value: stringified,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/** Delete cached key. */
export async function delCache(key: string): Promise<void> {
  const client = getRedisInstance();
  if (client) {
    try {
      await client.del(key);
    } catch {
      // Fall through
    }
  }
  memoryFallback.delete(key);
}
