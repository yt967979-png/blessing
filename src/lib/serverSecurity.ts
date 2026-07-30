import { NextResponse } from 'next/server';
import { getTokenFromRequest, verifySessionToken } from '@/lib/auth';

/** In-memory fallback when DB rate_limits is unavailable */
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/** Durable rate limit via Postgres (falls back to memory) */
export async function applyRateLimitAsync(
  key: string,
  limit: number = 30,
  windowMs: number = 60000
): Promise<{ allowed: boolean; remaining: number }> {
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

/** Admin only from verified session — no header/query spoofing */
export async function verifyAdminRequest(
  request: Request
): Promise<{ isAdmin: boolean; error?: string; user?: { userId: string; role: string } }> {
  try {
    const session = await getAuthenticatedUser(request);
    if (session?.role === 'admin') {
      return { isAdmin: true, user: session };
    }
    if (!session) {
      return { isAdmin: false, error: 'Unauthorized: Missing session' };
    }
    return { isAdmin: false, error: 'Forbidden: Admin privilege required' };
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
