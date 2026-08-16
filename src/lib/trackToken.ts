import crypto from 'crypto';

const TRACKING_SECRET = process.env.SESSION_SECRET || 'bpg-tracking-token-salt-2026';

/**
 * Generates an opaque tracking token for an order so raw phone numbers never appear in QR URLs.
 */
export function generateTrackingToken(orderId: string, phone: string): string {
  const cleanId = String(orderId || '').trim().toUpperCase();
  const cleanPhone = String(phone || '').replace(/\D/g, '').slice(-10);
  if (!cleanId || !cleanPhone) return '';
  return crypto
    .createHmac('sha256', TRACKING_SECRET)
    .update(`track:${cleanId}:${cleanPhone}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Validates whether the given tracking token matches the stored order/phone combination.
 */
export function verifyTrackingToken(token: string, orderId: string, phone: string): boolean {
  if (!token || !orderId || !phone) return false;
  const cleanToken = String(token || '').trim().toLowerCase();
  const expected = generateTrackingToken(orderId, phone).toLowerCase();
  if (!cleanToken || !expected || cleanToken.length !== expected.length) return false;
  try {
    const a = Buffer.from(cleanToken, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
