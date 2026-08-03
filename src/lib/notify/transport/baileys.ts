import { sendViaWasender } from '@/lib/wasender';
import { sendWhatsAppMessageInProcess } from '@/lib/whatsapp';

/**
 * High-Availability Dual WhatsApp Transport:
 * 1. WasenderAPI Cloud Gateway (Primary)
 * 2. Native Baileys Direct Socket (Automatic Fallback if WasenderAPI rate-limits or fails)
 */
export async function sendViaBaileys(to: string, message: string) {
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10) {
    return { ok: false as const, error: 'invalid phone' };
  }

  // 1. Try WasenderAPI primary dispatch
  const wasenderResult = await sendViaWasender(digits, message);
  if (wasenderResult.ok) {
    return {
      ok: true as const,
      provider: 'wasenderapi',
      recipient: digits.length === 10 ? `91${digits}` : digits,
    };
  }

  console.warn(`[notify/wasender] WasenderAPI fallback engaged (${wasenderResult.error || 'rate limited'}). Attempting Baileys direct dispatch...`);

  // 2. High-Availability Automatic Fallback to Native Baileys Direct Dispatch
  try {
    const result = await sendWhatsAppMessageInProcess(digits, message);
    if ((result as any)?.success) {
      return {
        ok: true as const,
        provider: 'baileys_fallback',
        queued: Boolean((result as { queued?: boolean })?.queued),
        recipient: digits.length === 10 ? `91${digits}` : digits,
      };
    }
  } catch (err: unknown) {
    const errText = err instanceof Error ? err.message : String(err);
    console.warn('[notify/baileys fallback error]', errText);
  }

  return { ok: false as const, error: wasenderResult.error || 'WhatsApp message dispatch failed' };
}
