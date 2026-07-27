import crypto from 'crypto';

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.RAZORPAY_KEY_SECRET ||
  'bpg-dev-session-secret-change-in-production';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verify, 'hex'));
  } catch {
    return false;
  }
}

export function createSessionToken(userId: string, role: string): string {
  const payload = { userId, role, exp: Date.now() + SESSION_TTL_MS };
  const payloadStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('hex');
  return Buffer.from(JSON.stringify({ p: payloadStr, s: sig })).toString('base64url');
}

export function verifySessionToken(token: string): { userId: string; role: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const payloadStr = decoded.p as string;
    const sig = decoded.s as string;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payloadStr).digest('hex');
    if (sig !== expected) return null;
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
