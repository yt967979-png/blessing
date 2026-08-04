/**
 * WasenderAPI Gateway Provider (wasenderapi.com)
 * Enables dispatching WhatsApp messages & receiving webhook events via WasenderAPI REST API.
 * Supports Meta-style Interactive Quick Reply Buttons (same as Chennai Metro Rail / Official WhatsApp API).
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

  const isConfirmMsg =
    message.includes('CONFIRM YOUR ORDER') ||
    message.includes('Reply YES') ||
    message.includes('1️⃣ Reply *YES*');

  const bodyData: any = {
    session: sessionId,
    sessionId: sessionId,
    phone: phoneWithCc,
    to: phoneWithCc,
    message: message,
    text: message,
  };

  if (isConfirmMsg) {
    // Meta Interactive Button Payload (same as Chennai Metro Rail & Official WhatsApp API)
    bodyData.type = 'interactive';
    bodyData.interactive = {
      type: 'button',
      header: { type: 'text', text: 'BLESSING POWER GUIDE' },
      body: { text: message },
      footer: { text: 'Blessing Power Guide • Tap button to reply' },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'yes',
              title: '✅ YES - CONFIRM',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'no',
              title: '❓ NEED HELP',
            },
          },
        ],
      },
    };

    // Backup button payload arrays for WasenderAPI gateway formats
    bodyData.buttons = [
      { id: 'yes', text: '✅ YES - CONFIRM', title: '✅ YES - CONFIRM' },
      { id: 'no', text: '❓ NEED HELP', title: '❓ NEED HELP' },
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

    console.log(`✅ [WASENDER API SENT] Message ${isConfirmMsg ? 'with Meta Interactive buttons ' : ''}sent to +${phoneWithCc}`);
    return { ok: true };
  } catch (err: any) {
    console.warn('[wasenderapi] Send failed:', err?.message || err);
    return { ok: false, error: err?.message || 'WasenderAPI request failed' };
  }
}
