/**
 * Official Meta WhatsApp Cloud API Client
 *
 * Implements conversational messaging, interactive buttons, list pickers,
 * order confirmation receipts, and ST Courier dispatch tracking notifications.
 *
 * Safe & resilient: If credentials are not yet added to .env, logs gracefully
 * in development/mock mode without throwing unhandled exceptions.
 */

export interface WhatsAppButton {
  id: string;
  title: string; // Max 20 chars
}

export interface WhatsAppListRow {
  id: string;
  title: string; // Max 24 chars
  description?: string; // Max 72 chars
}

export interface WhatsAppListSection {
  title: string;
  rows: WhatsAppListRow[];
}

function normalizeWhatsAppRecipient(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length > 10) return digits;
  return digits;
}

export function isWhatsAppConfigured(): boolean {
  return Boolean(
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_ACCESS_TOKEN
  );
}

async function callWhatsAppGraphApi(payload: any, senderPhoneNumberId?: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  const phoneNumberId = senderPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.log('[WhatsApp API (Dev/Mock Mode)] Would send message to', payload?.to, ':', JSON.stringify(payload));
    return { ok: true, data: { mock: true } };
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[WhatsApp API Error]', res.status, data);
      return { ok: false, error: data?.error?.message || `HTTP ${res.status}` };
    }

    return { ok: true, data };
  } catch (err: any) {
    console.error('[WhatsApp Network Error]', err?.message || err);
    return { ok: false, error: err?.message || 'Network error' };
  }
}

/** Send standard text message */
export async function sendWhatsAppText(to: string, text: string, senderPhoneNumberId?: string) {
  const recipient = normalizeWhatsAppRecipient(to);
  const safeText = String(text || '').slice(0, 4090);
  return callWhatsAppGraphApi(
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { preview_url: true, body: safeText },
    },
    senderPhoneNumberId
  );
}

/** Send interactive reply buttons (up to 3 buttons) */
export async function sendWhatsAppButtons(
  to: string,
  bodyText: string,
  buttons: WhatsAppButton[],
  senderPhoneNumberId?: string
) {
  const recipient = normalizeWhatsAppRecipient(to);
  const safeBody = String(bodyText || '').slice(0, 1020);
  const formattedButtons = buttons.slice(0, 3).map((b) => ({
    type: 'reply',
    reply: {
      id: b.id,
      title: b.title.slice(0, 20),
    },
  }));

  return callWhatsAppGraphApi(
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: safeBody },
        action: { buttons: formattedButtons },
      },
    },
    senderPhoneNumberId
  );
}

/** Send interactive list picker (e.g. books or subject choices) */
export async function sendWhatsAppList(
  to: string,
  bodyText: string,
  buttonLabel: string,
  sections: WhatsAppListSection[],
  senderPhoneNumberId?: string
) {
  const recipient = normalizeWhatsAppRecipient(to);
  const safeBody = String(bodyText || '').slice(0, 1020);
  return callWhatsAppGraphApi(
    {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: safeBody },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: sections.map((sec) => ({
            title: sec.title.slice(0, 24),
            rows: sec.rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: r.description ? r.description.slice(0, 72) : undefined,
            })),
          })),
        },
      },
    },
    senderPhoneNumberId
  );
}

/** Send order confirmation message upon verified payment */
import { generateTrackingToken } from '@/lib/trackToken';
import { publicSiteOrigin } from '@/lib/publicSiteUrl';

export async function sendWhatsAppOrderConfirmed(
  phone: string,
  details: {
    orderNumber: string;
    totalAmount: number;
    itemCount: number;
    customerName?: string;
    customerEmail?: string;
  }
) {
  const siteUrl = publicSiteOrigin();
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const trackToken = cleanPhone ? generateTrackingToken(details.orderNumber, cleanPhone) : '';
  const tokenParam = trackToken ? `&t=${trackToken}` : '';
  const liveTrackLink = `${siteUrl}/track?order=${encodeURIComponent(details.orderNumber)}${tokenParam}`;
  const emailLine =
    details.customerEmail && !details.customerEmail.includes('@blessingpowerguide.in')
      ? `🌐 *Website Sync*: Log in with *${details.customerEmail}* at ${siteUrl}/orders to view GST invoice & tracking.`
      : '';

  const msg = [
    `✅ *PAYMENT VERIFIED & ORDER CONFIRMED!*`,
    ``,
    `Hello ${details.customerName ? details.customerName : 'Valued Student'}! 🙏`,
    `Your order has been safely placed with *Blessing Power Guide Chennai*.`,
    ``,
    `📋 *Order ID*: #${details.orderNumber}`,
    `📚 *Items*: ${details.itemCount} Guide(s)`,
    `💰 *Amount Paid*: ₹${details.totalAmount}`,
    `🚚 *Delivery*: 100% Free Doorstep Delivery via ST Courier`,
    ``,
    `📦 We are currently packing your books in tamper-proof packaging.`,
    `📍 *Live Order Tracker*:`,
    `${liveTrackLink}`,
    emailLine ? `\n${emailLine}\n` : '',
    `As soon as your parcel is handed to ST Courier Express, we will send your official tracking docket right here! 🚀`,
    ``,
    `Thank you for studying with Blessing Power Guide! 🌟`,
  ].filter(Boolean).join('\n');

  return sendWhatsAppText(phone, msg);
}

/** Send courier dispatch tracking link in the same chat */
export async function sendWhatsAppTrackingUpdate(
  phone: string,
  details: {
    orderNumber: string;
    awb: string;
    courierName: string;
    trackingUrl?: string;
  }
) {
  const siteUrl = publicSiteOrigin();
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const trackToken = cleanPhone ? generateTrackingToken(details.orderNumber, cleanPhone) : '';
  const tokenParam = trackToken ? `&t=${trackToken}` : '';
  const liveTrackLink = details.trackingUrl || `${siteUrl}/track?order=${encodeURIComponent(details.orderNumber)}${tokenParam}`;

  const msg = [
    `🚚 *YOUR PARCEL HAS BEEN DISPATCHED!*`,
    ``,
    `Great news! Your books for Order *#${details.orderNumber}* have been scanned and handed to our delivery partner.`,
    ``,
    `📦 *Courier Partner*: ${details.courierName || 'ST Courier Express'}`,
    `📍 *ST Courier Docket (AWB)*: \`${details.awb}\``,
    `⏱️ *Estimated Delivery*: 24 to 48 hours across Tamil Nadu`,
    ``,
    `👉 *Click to Track Live Location*:`,
    `${liveTrackLink}`,
    ``,
    `Our delivery executive will call your mobile number before doorstep delivery. For any queries, reply right here to talk with our Chennai office team! 📞`,
  ].join('\n');

  return sendWhatsAppText(phone, msg);
}
