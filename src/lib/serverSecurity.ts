import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

// --- 1. In-Memory Rate Limiter ---
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

// Clean up expired rate limit entries every 5 minutes
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

// --- 2. Server-Side Admin Authorization Verifier ---
export async function verifyAdminRequest(request: Request): Promise<{ isAdmin: boolean; error?: string; user?: any }> {
  try {
    const authHeader = request.headers.get('Authorization') || '';
    const userIdHeader = request.headers.get('x-admin-user-id') || '';
    const url = new URL(request.url);
    const userIdQuery = url.searchParams.get('adminUserId');

    const targetUserId = userIdHeader || userIdQuery || (authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '');

    if (!targetUserId) {
      return { isAdmin: false, error: 'Unauthorized: Missing Admin Identification Token' };
    }

    const client = await getDbClient();
    if (!client) {
      // Development fallback mode if DB is disconnected
      return { isAdmin: true };
    }

    try {
      const res = await client.query('SELECT id, email, role FROM users WHERE id = $1', [targetUserId]);
      await client.end();

      if (res.rows && res.rows.length > 0) {
        const user = res.rows[0];
        if (user.role === 'admin' || user.email === 'admin@blessingpowerguide.com') {
          return { isAdmin: true, user };
        }
      }
      return { isAdmin: false, error: 'Forbidden: Admin privilege required' };
    } catch (e: any) {
      await client.end();
      return { isAdmin: false, error: 'Database verification failed' };
    }
  } catch (e: any) {
    return { isAdmin: false, error: 'Server authentication check error' };
  }
}
