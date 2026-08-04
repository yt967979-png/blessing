/**
 * WhatsApp transport — product-disabled by default (DISABLE_WHATSAPP !== 'false').
 * Wasender / Meta / Baileys paths kept for optional re-enable only.
 */
export async function sendViaBaileys(to: string, message: string) {
  if (process.env.DISABLE_WHATSAPP !== 'false') {
    return { ok: false as const, queued: false, error: 'WhatsApp disabled' };
  }

  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10) {
    return { ok: false as const, queued: false, error: 'invalid phone' };
  }

  const { sendViaWasender } = await import('@/lib/wasender');
  const wasenderResult = await sendViaWasender(digits, message);
  if (wasenderResult.ok) {
    return {
      ok: true as const,
      queued: false,
      provider: 'wasenderapi',
      recipient: digits.length === 10 ? `91${digits}` : digits,
    };
  }

  const { sendViaMetaCloud } = await import('@/lib/metaCloud');
  const metaResult = await sendViaMetaCloud(digits, message);
  if (metaResult.ok) {
    return {
      ok: true as const,
      queued: false,
      provider: 'meta_cloud_api',
      recipient: digits.length === 10 ? `91${digits}` : digits,
    };
  }

  return {
    ok: false as const,
    queued: false,
    error: wasenderResult.error || metaResult.error || 'WhatsApp send failed',
  };
}
