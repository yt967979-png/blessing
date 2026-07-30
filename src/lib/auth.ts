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
  const secret = process.env.SESSION_SECRET || process.env.RAZORPAY_KEY_SECRET;
  if (secret) {
    sessionSecret = secret;
    return sessionSecret;
  }
  if (!isProductionRuntime()) {
    sessionSecret = DEV_SESSION_SECRET;
    return sessionSecret;
  }
  throw new Error('SESSION_SECRET must be set in production');
}

export function assertSessionSecretConfigured(): void {
  getSessionSecret();
}

/** ~10 years — stay signed in until user logs out or clears browser data */
export const SESSION_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE_MAX_AGE_SEC = Math.floor(SESSION_TTL_MS / 1000);

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_COOKIE_MAX_AGE_SEC,
    path: '/',
  };
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
  if (!stored.includes(':')) {
    const legacy = crypto.createHash('sha256').update(`${password}bpg_salt_2026`).digest('hex');
    return legacy === stored;
  }
  const [salt, hash] = stored.split(':');
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  return timingSafeHexEqual(hash, verify);
}

export function createSessionToken(userId: string, role: string): string {
  const payload = { userId, role, exp: Date.now() + SESSION_TTL_MS };
  const payloadStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payloadStr).digest('hex');
  return Buffer.from(JSON.stringify({ p: payloadStr, s: sig })).toString('base64url');
}

export function verifySessionToken(token: string): { userId: string; role: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const payloadStr = decoded.p as string;
    const sig = decoded.s as string;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(payloadStr).digest('hex');
    if (!timingSafeHexEqual(sig, expected)) return null;
    const payload = JSON.parse(payloadStr);
    if (payload.exp < Date.now()) return null;
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
  const match = cookieHeader.match(/(?:^|;\s*)bpg_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
