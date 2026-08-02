import { NextResponse } from 'next/server';
import { getTokenFromRequest, verifySessionToken } from '@/lib/auth';

/** In-memory rate limit (Free default — avoids a DB round-trip on every request) */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limit. Free/soft: memory-first (no Postgres per request).
 * Set RATE_LIMIT_USE_DB=true for durable multi-replica limits.
 */
export async function applyRateLimitAsync(
  key: string,
  limit: number = 30,
  windowMs: number = 60000
): Promise<{ allowed: boolean; remaining: number }> {
  const useDb = String(process.env.RATE_LIMIT_USE_DB || '').toLowerCase() === 'true';
  if (!useDb) {
    return applyRateLimit(key, limit, windowMs);
  }

  const now = Date.now();
  let client: any = null;
  try {
    const { getDbClient, releaseDbClient } = await import('@/lib/db');
    client = await getDbClient();
    const res = await client.query(`SELECT count, reset_at FROM rate_limits WHERE key = $1`, [key]);
    if (res.rows.length === 0 || new Date(res.rows[0].reset_at).getTime() <= now) {
      const resetAt = new Date(now + windowMs);
      await client.query(
        `INSERT INTO rate_limits (key, count, reset_at) VALUES ($1, 1, $2)
         ON CONFLICT (key) DO UPDATE SET count = 1, reset_at = EXCLUDED.reset_at`,
        [key, resetAt.toISOString()]
      );
      return { allowed: true, remaining: limit - 1 };
    }
    const count = Number(res.rows[0].count);
    if (count >= limit) {
      return { allowed: false, remaining: 0 };
    }
    await client.query(`UPDATE rate_limits SET count = count + 1 WHERE key = $1`, [key]);
    return { allowed: true, remaining: limit - count - 1 };
  } catch {
    return applyRateLimit(key, limit, windowMs);
  } finally {
    if (client) {
      const { releaseDbClient } = await import('@/lib/db');
      releaseDbClient(client);
    }
  }
}

/** Sync in-memory limiter (kept for backward-compatible call sites) */
export function applyRateLimit(
  ip: string,
  limit: number = 30,
  windowMs: number = 60000
): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limit - 1 };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count };
}

export function clientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function getAuthenticatedUser(
  request: Request
): Promise<{ userId: string; role: string } | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifySessionToken(token);
}

interface CachedAdminRole {
  isAdmin: boolean;
  user?: { userId: string; role: string };
  error?: string;
  cachedAt: number;
}
const adminRoleCache = new Map<string, CachedAdminRole>();
const ADMIN_CACHE_TTL_MS = 60_000; // 60 seconds RAM cache

/** Admin only — verifies signed session with 60s RAM cache (0ms DB load for repeat calls). */
export async function verifyAdminRequest(
  request: Request
): Promise<{ isAdmin: boolean; error?: string; user?: { userId: string; role: string } }> {
  try {
    const session = await getAuthenticatedUser(request);
    if (!session) {
      return { isAdmin: false, error: 'Unauthorized: Missing session' };
    }

    const now = Date.now();
    const cached = adminRoleCache.get(session.userId);
    if (cached && now - cached.cachedAt < ADMIN_CACHE_TTL_MS) {
      return { isAdmin: cached.isAdmin, error: cached.error, user: cached.user };
    }

    try {
      const { queryDb, queryEphemeral } = await import('@/lib/db');
      let res: any;
      try {
        res = await queryDb(
          `SELECT role, status, email FROM users WHERE id = $1 LIMIT 1`,
          [session.userId]
        );
      } catch (_) {
        res = await queryEphemeral(
          `SELECT role, status, email FROM users WHERE id = $1 LIMIT 1`,
          [session.userId],
          { budgetMs: 4_000, statementTimeoutMs: 2_500, label: 'adminCheck' }
        );
      }

      if (!res?.rows || res.rows.length === 0) {
        const out = { isAdmin: false, error: 'Unauthorized: User not found' };
        adminRoleCache.set(session.userId, { ...out, cachedAt: now });
        return out;
      }

      const row = res.rows[0];
      const userRole = String(row.role || '').toLowerCase();
      const userStatus = String(row.status || '').toLowerCase();
      const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
      const userEmail = String(row.email || '').toLowerCase().trim();
      const isMatchingAdminEmail = adminEmail && userEmail === adminEmail;

      if (userStatus === 'banned') {
        const out = { isAdmin: false, error: 'Forbidden: Account disabled' };
        adminRoleCache.set(session.userId, { ...out, cachedAt: now });
        return out;
      }

      if (userRole !== 'admin' && !isMatchingAdminEmail) {
        const out = { isAdmin: false, error: 'Forbidden: Admin privilege required' };
        adminRoleCache.set(session.userId, { ...out, cachedAt: now });
        return out;
      }

      const out = { isAdmin: true, user: { userId: session.userId, role: 'admin' } };
      adminRoleCache.set(session.userId, { ...out, cachedAt: now });
      return out;
    } catch (err: any) {
      console.error('[verifyAdminRequest] DB check failed:', err?.message || err);
      return { isAdmin: false, error: 'Admin check unavailable — try again' };
    }
  } catch (err: any) {
    return { isAdmin: false, error: 'Server authentication check error' };
  }
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}
