/**
 * WasenderAPI Gateway Provider (wasenderapi.com)
 * Enables dispatching WhatsApp messages & receiving webhook events via WasenderAPI REST API.
 */

export async function sendViaWasender(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.WASENDER_API_KEY || '';
  const sessionId = process.env.WASENDER_SESSION_ID || process.env.WASENDER_SESSION_NAME || '';

  if (!apiKey || !sessionId) {
    return { ok: false, error: 'WasenderAPI credentials not configured in env (WASENDER_API_KEY & WASENDER_SESSION_ID).' };
  }

  const cleanPhone = String(to || '').replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    return { ok: false, error: 'Invalid recipient phone number.' };
  }
  const phoneWithCc = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  try {
    const res = await fetch('https://wasenderapi.com/api/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        session: sessionId,
        sessionId: sessionId,
        phone: phoneWithCc,
        to: phoneWithCc,
        message: message,
        text: message,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: data.message || data.error || `WasenderAPI returned HTTP ${res.status}` };
    }

    console.log(`✅ [WASENDER API SENT] Message sent to +${phoneWithCc}`);
    return { ok: true };
  } catch (err: any) {
    console.warn('[wasenderapi] Send failed:', err?.message || err);
    return { ok: false, error: err?.message || 'WasenderAPI request failed' };
  }
}
