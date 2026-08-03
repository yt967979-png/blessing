import { sendWhatsAppMessageInProcess } from '@/lib/whatsapp';
import { sendViaWasender } from '@/lib/wasender';

/** Baileys & WasenderAPI transport — supports both native Baileys & WasenderAPI Cloud Gateway. */
export async function sendViaBaileys(to: string, message: string) {
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10) {
    return { ok: false as const, error: 'invalid phone' };
  }

  // If WasenderAPI credentials exist in env, try WasenderAPI first
  if (process.env.WASENDER_API_KEY && (process.env.WASENDER_SESSION_ID || process.env.WASENDER_SESSION_NAME)) {
    const wasenderResult = await sendViaWasender(digits, message);
    if (wasenderResult.ok) {
      return {
        ok: true as const,
        provider: 'wasenderapi',
        recipient: digits.length === 10 ? `91${digits}` : digits,
      };
    }
  }

  // Native Baileys in-process transport fallback
  try {
    const result = await sendWhatsAppMessageInProcess(digits, message);
    return {
      ok: true as const,
      queued: Boolean((result as { queued?: boolean })?.queued),
      recipient: digits.length === 10 ? `91${digits}` : digits,
    };
  } catch (err: unknown) {
    const messageText = err instanceof Error ? err.message : String(err);
    console.warn('[notify/baileys]', messageText);
    return { ok: false as const, error: messageText };
  }
}
