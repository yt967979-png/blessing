import crypto from 'crypto';

const DEV_SESSION_SECRET = 'bpg-dev-session-secret-change-in-production';

function isProductionRuntime(): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  // `next build` also sets NODE_ENV=production — only enforce when serving traffic.
  const phase = process.env.NEXT_PHASE || '';
  if (phase === 'phase-production-build') return false;
  return true;
}

let sessionSecret: string | null = null;

function getSessionSecret(): string {
  if (sessionSecret) return sessionSecret;
  // Never fall back to Razorpay secret — that couples payment keys to session crypto.
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) {
    sessionSecret = secret;
    return sessionSecret;
  }
  if (!isProductionRuntime()) {
    sessionSecret = DEV_SESSION_SECRET;
    return sessionSecret;
  }
  throw new Error('SESSION_SECRET must be set in production (min 32 characters)');
}

export function assertSessionSecretConfigured(): void {
  getSessionSecret();
}

/** Stay signed in for 30 days, then sign in again. Same for customers and admin. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const ADMIN_SESSION_TTL_MS = SESSION_TTL_MS;
export const SESSION_COOKIE_MAX_AGE_SEC = Math.floor(SESSION_TTL_MS / 1000);
export const ADMIN_SESSION_COOKIE_MAX_AGE_SEC = SESSION_COOKIE_MAX_AGE_SEC;

export const DEVICE_COOKIE_NAME = 'bpg_device';

export function sessionCookieOptions(_role?: string | null) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_COOKIE_MAX_AGE_SEC,
    path: '/',
  };
}

export function createDeviceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function cookieValue(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getDeviceIdFromRequest(request: Request): string | null {
  return cookieValue(request.headers.get('cookie') || '', DEVICE_COOKIE_NAME);
}

/** Set session + device cookies together. Both are httpOnly — JS cannot read them. */
export function applySessionCookies(
  response: { cookies: { set: (name: string, value: string, opts: any) => void } },
  opts: { token: string; deviceId: string; role?: string | null }
) {
  const cookieOpts = sessionCookieOptions(opts.role);
  response.cookies.set('bpg_session', opts.token, cookieOpts);
  response.cookies.set(DEVICE_COOKIE_NAME, opts.deviceId, cookieOpts);
}

export function clearSessionCookies(cookieStore: { delete: (name: string) => void }) {
  cookieStore.delete('bpg_session');
  cookieStore.delete(DEVICE_COOKIE_NAME);
}

function timingSafeHexEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'hex');
    const bufB = Buffer.from(b, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (!stored.includes(':')) {
    // Legacy SHA-256 hashes — timing-safe comparison, NO plain-text fallback.
    const legacy1 = crypto.createHash('sha256').update(`blessing_salt_${password}`).digest('hex');
    const legacy2 = crypto.createHash('sha256').update(`${password}bpg_salt_2026`).digest('hex');
    return timingSafeHexEqual(legacy1, stored) || timingSafeHexEqual(legacy2, stored);
  }
  const [salt, hash] = stored.split(':');
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  return timingSafeHexEqual(hash, verify);
}

export function createSessionToken(userId: string, role: string, deviceId: string): string {
  const payload = { userId, role, exp: Date.now() + SESSION_TTL_MS, did: deviceId };
  const payloadStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payloadStr).digest('hex');
  return Buffer.from(JSON.stringify({ p: payloadStr, s: sig })).toString('base64url');
}

function timingSafeUtf8Equal(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function verifySessionToken(
  token: string,
  deviceId?: string | null
): { userId: string; role: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const payloadStr = decoded.p as string;
    const sig = decoded.s as string;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(payloadStr).digest('hex');
    if (!timingSafeHexEqual(sig, expected)) return null;
    const payload = JSON.parse(payloadStr);
    if (!payload.exp || payload.exp < Date.now()) return null;
    if (payload.exp - Date.now() > SESSION_TTL_MS + 60_000) return null;
    const bound = String(payload.did || '');
    if (!bound || !deviceId || !timingSafeUtf8Equal(bound, deviceId)) return null;
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  const cookieHeader = request.headers.get('cookie') || '';
  return cookieValue(cookieHeader, 'bpg_session');
}
