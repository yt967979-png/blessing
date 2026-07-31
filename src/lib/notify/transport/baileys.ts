import { sendWhatsAppMessageInProcess } from '@/lib/whatsapp';

/** Baileys transport — swap for Meta Cloud later with the same interface. */
export async function sendViaBaileys(to: string, message: string) {
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10) {
    return { ok: false as const, error: 'invalid phone' };
  }
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
