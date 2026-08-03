import { sendViaWasender } from '@/lib/wasender';
import { sendWhatsAppMessageInProcess } from '@/lib/whatsapp';

/**
 * Primary WhatsApp Transport: WasenderAPI Gateway (wasenderapi.com)
 * Native Baileys is disabled by default to run exclusively via WasenderAPI.
 */
export async function sendViaBaileys(to: string, message: string) {
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10) {
    return { ok: false as const, error: 'invalid phone' };
  }

  // WasenderAPI primary dispatch
  const wasenderResult = await sendViaWasender(digits, message);
  if (wasenderResult.ok) {
    return {
      ok: true as const,
      provider: 'wasenderapi',
      recipient: digits.length === 10 ? `91${digits}` : digits,
    };
  }

  // Baileys fallback only if explicitly enabled in environment
  if (process.env.ENABLE_BAILEYS_FALLBACK === 'true') {
    try {
      const result = await sendWhatsAppMessageInProcess(digits, message);
      return {
        ok: true as const,
        provider: 'baileys_fallback',
        queued: Boolean((result as { queued?: boolean })?.queued),
        recipient: digits.length === 10 ? `91${digits}` : digits,
      };
    } catch (err: unknown) {
      console.warn('[notify/baileys fallback failed]', err);
    }
  }

  return { ok: false as const, error: wasenderResult.error || 'WasenderAPI send failed' };
}
