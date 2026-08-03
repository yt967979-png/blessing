/**
 * WasenderAPI Gateway Provider (wasenderapi.com)
 * Enables dispatching WhatsApp messages & receiving webhook events via WasenderAPI REST API.
 */

export async function sendViaWasender(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey =
    process.env.WASENDER_API_KEY ||
    'ffe7fedeb4e8082e307825858ba70bf9249f2b38e240deb749853dbe6c549d59';
  const sessionId =
    process.env.WASENDER_SESSION_ID ||
    process.env.WASENDER_SESSION_NAME ||
    'a';

  if (!apiKey || !sessionId) {
    return { ok: false, error: 'WasenderAPI credentials missing.' };
  }

  const cleanPhone = String(to || '').replace(/\D/g, '');
  if (cleanPhone.length < 10) {
    return { ok: false, error: 'Invalid recipient phone number.' };
  }
  const phoneWithCc = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  const isConfirmMsg = message.includes('CONFIRM YOUR ORDER') || message.includes('Reply YES') || message.includes('1️⃣ Reply *YES*');
  const buttonsPayload = isConfirmMsg
    ? [
        { id: 'yes', text: '✅ YES - CONFIRM ORDER', displayText: '✅ YES - CONFIRM ORDER' },
        { id: 'no', text: '❌ NO - CANCEL ORDER', displayText: '❌ NO - CANCEL ORDER' },
      ]
    : undefined;

  const bodyData: any = {
    session: sessionId,
    sessionId: sessionId,
    phone: phoneWithCc,
    to: phoneWithCc,
    message: message,
    text: message,
  };

  if (isConfirmMsg) {
    bodyData.type = 'buttons';
    bodyData.buttons = [
      { id: 'yes', text: '✅ YES - CONFIRM ORDER', buttonId: 'yes', buttonText: { displayText: '✅ YES - CONFIRM ORDER' } },
      { id: 'no', text: '❌ NO - CANCEL ORDER', buttonId: 'no', buttonText: { displayText: '❌ NO - CANCEL ORDER' } },
    ];
    bodyData.templateButtons = [
      { index: 1, quickReplyButton: { displayText: '✅ YES - CONFIRM ORDER', id: 'yes' } },
      { index: 2, quickReplyButton: { displayText: '❌ NO - CANCEL ORDER', id: 'no' } },
    ];
  }

  try {
    const res = await fetch('https://wasenderapi.com/api/send-message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-api-key': apiKey,
      },
      body: JSON.stringify(bodyData),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[wasenderapi response error]', res.status, data);
      return { ok: false, error: data.message || data.error || `WasenderAPI returned HTTP ${res.status}` };
    }

    console.log(`✅ [WASENDER API SENT] Message ${isConfirmMsg ? 'with interactive buttons ' : ''}sent to +${phoneWithCc}`);
    return { ok: true };
  } catch (err: any) {
    console.warn('[wasenderapi] Send failed:', err?.message || err);
    return { ok: false, error: err?.message || 'WasenderAPI request failed' };
  }
}
