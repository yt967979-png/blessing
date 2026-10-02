const LIVE_ORIGIN = 'https://blessingpowerguide.in';
const UNRESOLVED_HOSTS = new Set([
  'blessingpowerguide.com',
  'www.blessingpowerguide.com',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
]);

/** Public shop origin for customer links (track, invoices, WhatsApp links, Razorpay callbacks). Never leak localhost or unresolvable domains to customers. */
export function publicSiteOrigin(): string {
  const raw = String(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.PUBLIC_BASE_URL ||
      LIVE_ORIGIN
  ).trim();
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase();
    if (!host || UNRESOLVED_HOSTS.has(host) || host.includes('localhost') || host.includes('127.0.0.1')) {
      return LIVE_ORIGIN;
    }
    return u.origin;
  } catch {
    return LIVE_ORIGIN;
  }
}
