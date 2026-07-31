import { sendWhatsAppMessageInProcess } from '@/lib/whatsapp';

export async function notifyWhatsApp(to: string, message: string) {
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.length < 10) return { ok: false as const, error: 'invalid phone' };
  try {
    await sendWhatsAppMessageInProcess(digits, message);
    return { ok: true as const };
  } catch (err: any) {
    console.warn('[notify]', err?.message || err);
    return { ok: false as const, error: String(err?.message || err) };
  }
}

export async function notifyWhatsAppMany(phones: string[], message: string) {
  const seen = new Set<string>();
  for (const p of phones) {
    const d = String(p || '').replace(/\D/g, '').slice(-10);
    if (d.length !== 10 || seen.has(d)) continue;
    seen.add(d);
    await notifyWhatsApp(d, message);
  }
}
