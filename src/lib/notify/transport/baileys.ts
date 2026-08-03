import { sendViaWasender } from '@/lib/wasender';
import { sendViaMetaCloud } from '@/lib/metaCloud';

/**
 * Universal WhatsApp Transport Engine:
 * Primary: WasenderAPI Cloud Gateway (No Meta Business Verification Required)
 * Fallback: Meta Official Cloud API
 */
export async function sendViaBaileys(to: string, message: string) {
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10) {
    return { ok: false as const, queued: false, error: 'invalid phone' };
  }

  // Priority 1: WasenderAPI Gateway (100% Instant Delivery without Meta Verification)
  const wasenderResult = await sendViaWasender(digits, message);
  if (wasenderResult.ok) {
    return {
      ok: true as const,
      queued: false,
      provider: 'wasenderapi',
      recipient: digits.length === 10 ? `91${digits}` : digits,
    };
  } else {
    console.warn('[transport] WasenderAPI dispatch warning, trying Meta Cloud API fallback:', wasenderResult.error);
  }

  // Priority 2: Meta Official Cloud API Fallback
  const metaResult = await sendViaMetaCloud(digits, message);
  if (metaResult.ok) {
    return {
      ok: true as const,
      queued: false,
      provider: 'meta_cloud_api',
      recipient: digits.length === 10 ? `91${digits}` : digits,
    };
  }

  return { ok: false as const, queued: false, error: wasenderResult.error || metaResult.error || 'WhatsApp send failed' };
}
