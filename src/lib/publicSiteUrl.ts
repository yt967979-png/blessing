const LIVE_ORIGIN = 'https://blessingpowerguide.duckdns.org';
const UNRESOLVED_HOSTS = new Set(['blessingpowerguide.com', 'www.blessingpowerguide.com']);

/** Public shop origin for customer links (track, invoices). Never use a domain that does not resolve. */
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
    if (!host || UNRESOLVED_HOSTS.has(host)) return LIVE_ORIGIN;
    return u.origin;
  } catch {
    return LIVE_ORIGIN;
  }
}
