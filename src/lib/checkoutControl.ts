/**
 * Global Checkout Kill-Switch / Pause Control
 * Controlled via Admin Panel Toggle Switch with PostgreSQL + Redis caching,
 * with graceful fallback to environment variables.
 */

export * from './checkoutConstants';
import {
  DEFAULT_CHECKOUT_PAUSE_MESSAGE,
  IS_CHECKOUT_PAUSED,
  CheckoutControlState,
} from './checkoutConstants';

// Short-lived in-memory cache for server-side queries (2.5 seconds)
let memoryCache: { data: CheckoutControlState; timestamp: number } | null = null;
const MEMORY_TTL_MS = 2500;

export function invalidateCheckoutControlCache() {
  memoryCache = null;
}

/**
 * Server-authoritative checkout pause check (checks Redis, DB settings, falls back to env).
 */
export async function getCheckoutControlStatus(): Promise<CheckoutControlState> {
  const now = Date.now();

  // 1. Fast process memory check
  if (memoryCache && now - memoryCache.timestamp < MEMORY_TTL_MS) {
    return memoryCache.data;
  }

  // 2. Redis cache check
  try {
    const { redisGetJson } = await import('@/lib/redis');
    const cached = await redisGetJson<CheckoutControlState>('settings:checkout_control');
    if (cached && typeof cached.paused === 'boolean') {
      memoryCache = { data: cached, timestamp: now };
      return cached;
    }
  } catch {}

  // 3. PostgreSQL query
  try {
    const { queryDb } = await import('@/lib/db');
    const res = await queryDb(
      `SELECT checkout_paused, checkout_pause_message, checkout_paused_at, checkout_paused_by
       FROM settings
       WHERE id = 'main'
       LIMIT 1`
    );

    if (res.rows.length > 0) {
      const row = res.rows[0];
      const state: CheckoutControlState = {
        paused: row.checkout_paused !== false,
        message: String(row.checkout_pause_message || DEFAULT_CHECKOUT_PAUSE_MESSAGE).trim(),
        updatedAt: row.checkout_paused_at ? new Date(row.checkout_paused_at).toISOString() : null,
        updatedBy: row.checkout_paused_by || 'Admin',
      };

      memoryCache = { data: state, timestamp: now };
      try {
        const { redisSetJson } = await import('@/lib/redis');
        await redisSetJson('settings:checkout_control', state, 60);
      } catch {}
      return state;
    }
  } catch (err: any) {
    console.warn('[checkoutControl] DB query error, using fallback:', err?.message || err);
  }

  // 4. Fallback to env variables
  const fallbackState: CheckoutControlState = {
    paused: IS_CHECKOUT_PAUSED,
    message: DEFAULT_CHECKOUT_PAUSE_MESSAGE,
    updatedAt: null,
    updatedBy: 'System Environment',
  };

  memoryCache = { data: fallbackState, timestamp: now };
  return fallbackState;
}

/**
 * Convenience helper for API route guards
 */
export async function isCheckoutPausedAsync(): Promise<{ paused: boolean; message: string }> {
  const state = await getCheckoutControlStatus();
  return { paused: state.paused, message: state.message };
}

/**
 * Updates checkout pause status in PostgreSQL and Redis (Admin only)
 */
export async function setCheckoutControlStatus(opts: {
  paused: boolean;
  message?: string;
  adminName?: string;
  adminEmail?: string;
}): Promise<CheckoutControlState> {
  const { queryDb } = await import('@/lib/db');
  const pauseMessage = (opts.message || DEFAULT_CHECKOUT_PAUSE_MESSAGE).trim();
  const operator = opts.adminEmail || opts.adminName || 'Admin';

  await queryDb(
    `INSERT INTO settings (id, checkout_paused, checkout_pause_message, checkout_paused_at, checkout_paused_by)
     VALUES ('main', $1, $2, NOW(), $3)
     ON CONFLICT (id) DO UPDATE SET
       checkout_paused = EXCLUDED.checkout_paused,
       checkout_pause_message = EXCLUDED.checkout_pause_message,
       checkout_paused_at = NOW(),
       checkout_paused_by = EXCLUDED.checkout_paused_by`,
    [opts.paused, pauseMessage, operator]
  );

  const updatedState: CheckoutControlState = {
    paused: opts.paused,
    message: pauseMessage,
    updatedAt: new Date().toISOString(),
    updatedBy: operator,
  };

  memoryCache = { data: updatedState, timestamp: Date.now() };

  try {
    const { redisSetJson } = await import('@/lib/redis');
    await redisSetJson('settings:checkout_control', updatedState, 300);
  } catch {}

  // Record administrative action in immutable audit log
  try {
    await queryDb(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details)
       VALUES ($1, $2, $3, 'system_settings', 'checkout_control', $4)`,
      [
        `audit-chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        operator,
        opts.paused ? 'CHECKOUT_PAUSED' : 'CHECKOUT_ACTIVATED',
        JSON.stringify({
          paused: opts.paused,
          message: pauseMessage,
          timestamp: updatedState.updatedAt,
        }),
      ]
    );
  } catch {}

  return updatedState;
}
