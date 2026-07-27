import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { getTokenFromRequest, verifySessionToken } from '@/lib/auth';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

export function applyRateLimit(ip: string, limit: number = 30, windowMs: number = 60000): { allowed: boolean; remaining: number } {
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

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateLimitMap.entries()) {
      if (now > value.resetTime) {
        rateLimitMap.delete(key);
      }
    }
  }, 300000);
}

export async function getAuthenticatedUser(request: Request): Promise<{ userId: string; role: string } | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifySessionToken(token);
}

export async function verifyAdminRequest(request: Request): Promise<{ isAdmin: boolean; error?: string; user?: { userId: string; role: string } }> {
  try {
    const session = await getAuthenticatedUser(request);
    if (session?.role === 'admin') {
      return { isAdmin: true, user: session };
    }

    const url = new URL(request.url);
    const userIdHeader = request.headers.get('x-admin-user-id') || '';
    const userIdQuery = url.searchParams.get('adminUserId') || '';
    const targetUserId = session?.userId || userIdHeader || userIdQuery;

    if (!targetUserId) {
      return { isAdmin: false, error: 'Unauthorized: Missing session or admin identification' };
    }

    const client = await getDbClient();
    try {
      const res = await client.query('SELECT id, email, role FROM users WHERE id = $1', [targetUserId]);
      if (res.rows.length > 0) {
        const user = res.rows[0];
        if (user.role === 'admin') {
          return { isAdmin: true, user: { userId: user.id, role: 'admin' } };
        }
      }
      return { isAdmin: false, error: 'Forbidden: Admin privilege required' };
    } finally {
      await client.end();
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
