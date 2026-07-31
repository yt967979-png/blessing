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

/** Admin only — verifies signed session then re-checks role+status in DB (no stale JWT admin). */
export async function verifyAdminRequest(
  request: Request
): Promise<{ isAdmin: boolean; error?: string; user?: { userId: string; role: string } }> {
  try {
    const session = await getAuthenticatedUser(request);
    if (!session) {
      return { isAdmin: false, error: 'Unauthorized: Missing session' };
    }

    // Always re-validate against DB so demoted/banned users lose admin immediately.
    // Use ephemeral Client — never wait on a wedged shared-pool acquire queue (admin analytics
    // used to abort at 12s while getDbClient retried ~30s before the route budget even started).
    try {
      const { queryEphemeral } = await import('@/lib/db');
      const res = await queryEphemeral(
        `SELECT role, status FROM users WHERE id = $1 LIMIT 1`,
        [session.userId],
        { budgetMs: 5_000, statementTimeoutMs: 3_000, label: 'adminCheck' }
      );
      if (res.rows.length === 0) {
        return { isAdmin: false, error: 'Unauthorized: User not found' };
      }
      const row = res.rows[0];
      if (String(row.status || '').toLowerCase() === 'banned') {
        return { isAdmin: false, error: 'Forbidden: Account disabled' };
      }
      if (String(row.role || '').toLowerCase() !== 'admin') {
        return { isAdmin: false, error: 'Forbidden: Admin privilege required' };
      }
      return { isAdmin: true, user: { userId: session.userId, role: 'admin' } };
    } catch {
      // Fail closed if DB unavailable for admin checks
      return { isAdmin: false, error: 'Admin check unavailable — try again' };
    }
  } catch {
    return { isAdmin: false, error: 'Server authentication check error' };
  }
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}
