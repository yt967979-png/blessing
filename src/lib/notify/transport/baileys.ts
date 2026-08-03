import { sendViaWasender } from '@/lib/wasender';
import { sendViaMetaCloud } from '@/lib/metaCloud';

/**
 * Universal WhatsApp Transport Engine:
 * 1. Meta Official Cloud API (1,000 FREE messages/mo + Native Green Buttons)
 * 2. WasenderAPI Cloud Gateway
 */
export async function sendViaBaileys(to: string, message: string) {
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10) {
    return { ok: false as const, queued: false, error: 'invalid phone' };
  }

  // Priority 1: Meta Official Cloud API (if META_WA_TOKEN & META_WA_PHONE_ID exist)
  if (process.env.META_WA_TOKEN && process.env.META_WA_PHONE_ID) {
    const metaResult = await sendViaMetaCloud(digits, message);
    if (metaResult.ok) {
      return {
        ok: true as const,
        queued: false,
        provider: 'meta_cloud_api',
        recipient: digits.length === 10 ? `91${digits}` : digits,
      };
    }
  }

  // Priority 2: WasenderAPI Gateway
  const wasenderResult = await sendViaWasender(digits, message);
  if (wasenderResult.ok) {
    return {
      ok: true as const,
      queued: false,
      provider: 'wasenderapi',
      recipient: digits.length === 10 ? `91${digits}` : digits,
    };
  }

  return { ok: false as const, queued: false, error: wasenderResult.error || 'WhatsApp send failed' };
}
