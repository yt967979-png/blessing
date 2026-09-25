/**
 * Shop contact helpers — only customer→shop WhatsApp chat via wa.me (no Baileys / bots).
 */

export const DEFAULT_CUSTOMER_SUPPORT_PHONE = '+91 94860 17820';
export const SECONDARY_CONTACT_PHONE = '+91 63829 63350';

function digitsOnly(raw: string) {
  return String(raw || '').replace(/\D/g, '');
}

/** E.164-ish digits for wa.me (91XXXXXXXXXX) — defaults to customer support 9486017820. */
export function getShopWhatsAppDigits(): string {
  const raw =
    process.env.NEXT_PUBLIC_ADMIN_PHONE ||
    process.env.ADMIN_PHONE ||
    process.env.NEXT_PUBLIC_SHOP_PHONE ||
    '9486017820';
  const d = digitsOnly(raw);
  if (d.length === 10) return `91${d}`;
  if (d.length >= 12 && d.startsWith('91')) return d.slice(0, 12);
  if (d.length > 10) return d;
  return '919486017820';
}

/** Display form e.g. +91 94860 17820 */
export function getShopPhoneDisplay(): string {
  const d = getShopWhatsAppDigits();
  if (d.length === 12 && d.startsWith('91')) {
    const num = d.slice(2);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return `+${d}`;
}

/** Secondary display form e.g. +91 63829 63350 */
export function getShopSecondaryPhoneDisplay(): string {
  const raw =
    process.env.NEXT_PUBLIC_SECONDARY_PHONE ||
    process.env.SECONDARY_PHONE ||
    '6382963350';
  const d = digitsOnly(raw);
  const num = d.slice(-10);
  return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
}

export function shopWhatsAppChatUrl(prefill?: string): string {
  const phone = getShopWhatsAppDigits();
  if (!prefill) return `https://wa.me/${phone}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(prefill)}`;
}

/** Pre-filled WhatsApp URL for instant sample chapter PDF requests */
export function samplePdfWhatsAppUrl(bookTitle: string, standard?: string): string {
  const stdText = standard ? ` (${standard} Standard)` : '';
  const text = `Hi Blessing Power Guide, please send me the sample chapter PDF for "${bookTitle}"${stdText}. Thank you!`;
  return shopWhatsAppChatUrl(text);
}
