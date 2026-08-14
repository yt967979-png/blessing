import { NextResponse } from 'next/server';
import { verifySessionToken, getTokenFromRequest } from '@/lib/auth';

export function clientIp(request: Request): string {
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ip = xForwardedFor.split(',')[0].trim();
    if (ip) return ip;
  }
  const xRealIp = request.headers.get('x-real-ip');
  if (xRealIp) return xRealIp.trim();
  return '127.0.0.1';
}

/** Rate limit memory store */
const rateLimits = new Map<string, { count: number; resetAt: number }>();
let lastRateLimitPruneAt = Date.now();

function pruneExpiredRateLimits(now: number) {
  if (now - lastRateLimitPruneAt < 60_000) return;
  lastRateLimitPruneAt = now;
  for (const [key, value] of rateLimits.entries()) {
    if (now > value.resetAt) {
      rateLimits.delete(key);
    }
  }
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  const now = Date.now();
  pruneExpiredRateLimits(now);
  const existing = rateLimits.get(key);

  if (!existing || now > existing.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return { success: false, remaining: 0 };
  }

  existing.count += 1;
  return { success: true, remaining: limit - existing.count };
}

export function applyRateLimit(
  keyOrReq: string | Request,
  limit = 20,
  windowMs = 60_000
): { allowed: boolean } {
  const key = typeof keyOrReq === 'string' ? keyOrReq : clientIp(keyOrReq);
  const res = checkRateLimit(key, limit, windowMs);
  return { allowed: res.success };
}

export async function applyRateLimitAsync(
  requestOrKey: Request | string,
  actionOrLimit: string | number = 'action',
  limitOrWindow: number = 20,
  windowMs = 60_000
): Promise<{ success: boolean; allowed: boolean; response?: NextResponse }> {
  let key = '';
  let limit = 20;
  let win = 60_000;

  if (typeof requestOrKey === 'string') {
    key = requestOrKey;
    limit = typeof actionOrLimit === 'number' ? actionOrLimit : 20;
    win = limitOrWindow;
  } else {
    const action = typeof actionOrLimit === 'string' ? actionOrLimit : 'action';
    key = `${action}:${clientIp(requestOrKey)}`;
    limit = limitOrWindow;
    win = windowMs;
  }

  const res = checkRateLimit(key, limit, win);
  if (!res.success) {
    return {
      success: false,
      allowed: false,
      response: NextResponse.json(
        { error: 'Too many requests. Please try again in a minute.' },
        { status: 429 }
      ),
    };
  }
  return { success: true, allowed: true };
}

export async function getAuthenticatedUser(
  request: Request
): Promise<{ userId: string; role: string } | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifySessionToken(token);
}

export interface AdminVerifyResult {
  isAdmin: boolean;
  isSuperAdmin: boolean;
  error?: string;
  user?: { userId: string; role: string; isSuperAdmin: boolean };
}

/** Admin or Super Admin verify helper */
export async function verifyAdminRequest(
  request: Request
): Promise<AdminVerifyResult> {
  try {
    const session = await getAuthenticatedUser(request);
    if (!session) {
      return { isAdmin: false, isSuperAdmin: false, error: 'Unauthorized: Missing session' };
    }

    try {
      const { queryEphemeral } = await import('@/lib/db');
      const res = await queryEphemeral(
        `SELECT role, status FROM users WHERE id = $1 LIMIT 1`,
        [session.userId],
        { budgetMs: 5_000, statementTimeoutMs: 3_000, label: 'adminCheck' }
      );
      if (res.rows.length === 0) {
        return { isAdmin: false, isSuperAdmin: false, error: 'Unauthorized: User not found' };
      }
      const row = res.rows[0];
      const roleStr = String(row.role || '').toLowerCase();
      const statusStr = String(row.status || '').toLowerCase();

      if (statusStr === 'banned') {
        return { isAdmin: false, isSuperAdmin: false, error: 'Forbidden: Account disabled' };
      }
      
      const isSuperAdmin = roleStr === 'super_admin';
      const isAdmin = isSuperAdmin || roleStr === 'admin';

      if (!isAdmin) {
        return { isAdmin: false, isSuperAdmin: false, error: 'Forbidden: Admin privilege required' };
      }
      return {
        isAdmin: true,
        isSuperAdmin,
        user: { userId: session.userId, role: isSuperAdmin ? 'super_admin' : 'admin', isSuperAdmin },
      };
    } catch {
      return { isAdmin: false, isSuperAdmin: false, error: 'Admin check unavailable — try again' };
    }
  } catch {
    return { isAdmin: false, isSuperAdmin: false, error: 'Server authentication check error' };
  }
}

/** Super Admin ONLY — role promotions, and other owner-only controls */
export async function verifySuperAdminRequest(
  request: Request
): Promise<{ isSuperAdmin: boolean; error?: string; user?: { userId: string; role: string } }> {
  const check = await verifyAdminRequest(request);
  if (!check.isAdmin) {
    return { isSuperAdmin: false, error: check.error };
  }
  if (!check.isSuperAdmin) {
    return { isSuperAdmin: false, error: 'Forbidden: Super Admin privilege required' };
  }
  return { isSuperAdmin: true, user: check.user };
}

export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Validates Origin / Referer header against host to block cross-site request forgery (CSRF).
 */
export function verifyOriginOrReferer(request: Request): { valid: boolean; error?: string } {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  if (!origin && !referer) {
    // Non-browser or direct server calls allowed if authorized via HMAC token / session
    return { valid: true };
  }

  const target = origin || referer || '';
  try {
    const parsed = new URL(target);
    if (host && (parsed.host === host || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return { valid: true };
    }
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (siteUrl) {
      const siteParsed = new URL(siteUrl);
      if (parsed.host === siteParsed.host) {
        return { valid: true };
      }
    }
    return { valid: false, error: 'Cross-origin request blocked.' };
  } catch {
    return { valid: false, error: 'Invalid origin header.' };
  }
}
