import { NextResponse } from 'next/server';

/**
 * UNIVERSAL MULTI-PROVIDER WHATSAPP AUTOMATION SERVICE
 * Priority Order:
 * 1. Baileys Free Unlimited Engine (Self-Hosted Node/Railway Service — $0.00 / 100% FREE UNLIMITED!)
 * 2. UltraMsg / Whapi.cloud (QR API)
 * 3. Meta Cloud API (Official Template API)
 * 4. Direct 1-Click WhatsApp Link (`wa.me`)
 */

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      step = 'ORDER_PLACED',
      orderId,
      customerName,
      customerPhone,
      totalAmount,
      items,
      trackingNumber,
      customMessage,
    } = body;

    let rawPhone = (customerPhone || '').replace(/\D/g, '');
    if (rawPhone.length < 10) {
      rawPhone = '9840418228';
    }
    const phoneWithCountry = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const trackingNo = trackingNumber || 'Pending AWB Assignment';
    const bookTitle = items?.[0]?.title || 'Blessing Power Guide Study Book';
    const websiteTrackingUrl = `https://blessing-production.up.railway.app/orders?orderId=${encodeURIComponent(orderId || '')}`;

    // Environment API Credentials
    const ultramsgInstanceId = process.env.ULTRAMSG_INSTANCE_ID;
    const ultramsgToken = process.env.ULTRAMSG_TOKEN;

    const metaApiToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const statusClean = (step || body.status || '').toUpperCase();
    let stepTitle = '📚 ORDER CONFIRMED';
    let stepDescription = 'Your study guide order has been received and verified!';

    if (statusClean.includes('DELIVERED')) {
      stepTitle = '🎉 ORDER DELIVERED SUCCESSFULLY';
      stepDescription = 'Your guide books were successfully delivered to your address! Thank you for choosing Blessing Power Guide. Good luck with your studies!';
    } else if (statusClean.includes('OUT_FOR_DELIVERY') || statusClean.includes('OUT FOR DELIVERY')) {
      stepTitle = '🛵 OUT FOR DELIVERY TODAY';
      stepDescription = 'Your ST Courier delivery executive is out to deliver your parcel today. Please ensure someone is available at your address to receive it.';
    } else if (statusClean.includes('IN_TRANSIT') || statusClean.includes('IN TRANSIT')) {
      stepTitle = '⚡ PARCEL IN TRANSIT (ST COURIER)';
      stepDescription = `Your order is currently moving between ST Courier sorting hubs towards your city. ST Courier Docket: *${trackingNo}*.`;
    } else if (statusClean.includes('HANDED TO ST COURIER') || statusClean.includes('SHIPPED') || statusClean.includes('HANDED_TO_ST_COURIER')) {
      stepTitle = '🚚 HANDED TO ST COURIER EXPRESS';
      stepDescription = `Your order has been handed to ST Courier for fast delivery! Official ST Courier Docket AWB: *${trackingNo}*.`;
    } else if (statusClean.includes('PACKED')) {
      stepTitle = '📦 ORDER PACKED & SEALED';
      stepDescription = 'Your books have been quality checked, packed in a protective mailer, and sealed for shipment.';
    } else if (statusClean.includes('PREPARING')) {
      stepTitle = '📚 PREPARING YOUR ORDER';
      stepDescription = 'Our warehouse team is retrieving your ordered guide books from inventory.';
    } else if (statusClean.includes('PAYMENT') || statusClean.includes('PAID')) {
      stepTitle = '💳 PAYMENT CONFIRMED';
      stepDescription = 'Your payment has been successfully verified! Order processing is underway.';
    } else {
      stepTitle = '🎉 ORDER CONFIRMED';
      stepDescription = 'Thank you for placing your order with Blessing Power Guide! We are processing it right now.';
    }

    const fullFormattedText = customMessage || `*BLESSING POWER GUIDE*\n*${stepTitle}*\n\nDear *${customerName || 'Student'}*,\n${stepDescription}\n\n📦 *Order ID:* ${orderId || ''}\n📖 *Books:* ${bookTitle}\n💰 *Total Amount:* ₹${totalAmount || body.totalAmount || 0}\n🚚 *Logistics Partner:* ST Courier Express\n📍 *Docket AWB:* ${trackingNo}\n\n👉 *Track Live on Website:* ${websiteTrackingUrl}`;

    // Priority Strategy 1: In-Process Baileys Free Unlimited WhatsApp Engine (100% Reliable & Permanent)
    try {
      const { sendWhatsAppMessageInProcess } = await import('@/lib/whatsapp');
      const sendResult = await sendWhatsAppMessageInProcess(phoneWithCountry, fullFormattedText);
      return NextResponse.json({
        success: true,
        provider: 'BAILEYS_IN_PROCESS',
        response: sendResult,
        message: `Instant FREE WhatsApp message sent to +${phoneWithCountry} via in-process Baileys Engine!`,
      });
    } catch (e: any) {
      console.error('In-process Baileys dispatch error:', e.message);
    }

    // Priority Strategy 2: UltraMsg / Whapi (QR API)
    if (ultramsgInstanceId && ultramsgToken) {
      try {
        const uRes = await fetch(`https://api.ultramsg.com/${ultramsgInstanceId}/messages/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            token: ultramsgToken,
            to: `+${phoneWithCountry}`,
            body: fullFormattedText,
          }),
        });
        const uData = await uRes.json();
        if (uRes.ok && uData.sent === 'true') {
          return NextResponse.json({
            success: true,
            provider: 'ULTRAMSG_QR_API',
            response: uData,
            message: `Instant WhatsApp notification sent to +${phoneWithCountry} via UltraMsg!`,
          });
        }
      } catch (e: any) {}
    }

    // Priority Strategy 3: Official Meta Cloud API
    if (metaApiToken && phoneNumberId) {
      try {
        const metaRes = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${metaApiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phoneWithCountry,
            type: 'template',
            template: {
              name: 'bpg_order_status_update',
              language: { code: 'en' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: customerName || 'Student' },
                    { type: 'text', text: orderId || 'BPG-1082' },
                    { type: 'text', text: stepTitle },
                    { type: 'text', text: trackingNo },
                  ],
                },
                {
                  type: 'button',
                  sub_type: 'url',
                  index: '0',
                  parameters: [
                    { type: 'text', text: orderId || '' },
                  ],
                },
              ],
            },
          }),
        });

        const metaData = await metaRes.json();
        if (metaRes.ok) {
          return NextResponse.json({
            success: true,
            provider: 'META_CLOUD_API',
            metaResponse: metaData,
            message: `Official Meta WhatsApp notification sent to +${phoneWithCountry}`,
          });
        }
      } catch (e: any) {}
    }

    // Priority Strategy 4: Direct 1-Click WhatsApp Link Generator (Guaranteed Fallback)
    const encodedMsg = encodeURIComponent(fullFormattedText);
    const fallbackLink = `https://wa.me/${phoneWithCountry}?text=${encodedMsg}`;

    return NextResponse.json({
      success: true,
      provider: 'DIRECT_WHATSAPP_LINK',
      whatsappLink: fallbackLink,
      trackingUrl: websiteTrackingUrl,
      message: 'WhatsApp notification payload generated.',
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
