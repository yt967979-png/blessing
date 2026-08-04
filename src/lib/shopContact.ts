/**
 * Shop contact helpers — only customer→shop WhatsApp chat via wa.me (no Baileys / bots).
 */

function digitsOnly(raw: string) {
  return String(raw || '').replace(/\D/g, '');
}

/** E.164-ish digits for wa.me (91XXXXXXXXXX). */
export function getShopWhatsAppDigits(): string {
  const raw =
    process.env.NEXT_PUBLIC_ADMIN_PHONE ||
    process.env.ADMIN_PHONE ||
    process.env.NEXT_PUBLIC_SHOP_PHONE ||
    '9840418228';
  const d = digitsOnly(raw);
  if (d.length === 10) return `91${d}`;
  if (d.length >= 12 && d.startsWith('91')) return d.slice(0, 12);
  if (d.length > 10) return d;
  return '919840418228';
}

export function shopWhatsAppChatUrl(prefill?: string): string {
  const phone = getShopWhatsAppDigits();
  if (!prefill) return `https://wa.me/${phone}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(prefill)}`;
}
