/**
 * Meta Official WhatsApp Business Cloud API Provider (graph.facebook.com)
 * Offers 1,000 FREE customer conversations every month with official native green buttons.
 */

export async function sendViaMetaCloud(to: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.META_WA_TOKEN || process.env.WHATSAPP_TOKEN || '';
  const phoneId = process.env.META_WA_PHONE_ID || process.env.WHATSAPP_PHONE_ID || '';

  if (!token || !phoneId) {
    return { ok: false, error: 'Meta Cloud API credentials not configured in env (META_WA_TOKEN & META_WA_PHONE_ID).' };
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

  let bodyData: any;

  if (isConfirmMsg) {
    // Official Meta Interactive Buttons Payload (Exact Chennai Metro Rail format)
    bodyData = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneWithCc,
      type: 'interactive',
      interactive: {
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
                title: '❌ CANCEL ORDER',
              },
            },
          ],
        },
      },
    };
  } else {
    // Standard Text Message Payload
    bodyData = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneWithCc,
      type: 'text',
      text: { body: message },
    };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(bodyData),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[meta-cloud response error]', res.status, data);
      return { ok: false, error: data.error?.message || `Meta Cloud API returned HTTP ${res.status}` };
    }

    console.log(`✅ [META CLOUD API SENT] Message ${isConfirmMsg ? 'with native buttons ' : ''}sent to +${phoneWithCc}`);
    return { ok: true };
  } catch (err: any) {
    console.warn('[meta-cloud] Send failed:', err?.message || err);
    return { ok: false, error: err?.message || 'Meta Cloud API request failed' };
  }
}
