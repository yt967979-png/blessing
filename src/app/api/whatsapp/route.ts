import { NextResponse } from 'next/server';

/**
 * META WHATSAPP CLOUD API AUTOMATED NOTIFICATION SERVICE
 * Supported Event Steps:
 * 1. ORDER_PLACED - Instant order confirmation & payment receipt
 * 2. PACKED_DISPATCHED - Guide books packed at Medavakkam logistics hub
 * 3. SHIPPED_AWB - ST Courier docket AWB number assigned
 * 4. OUT_FOR_DELIVERY - Courier delivery executive out for delivery today
 * 5. DELIVERED - Order successfully delivered to student
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
      courierStatus,
    } = body;

    const cleanPhone = (customerPhone || '9840418228').replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const trackingNo = trackingNumber || 'Pending AWB Assignment';
    const bookTitle = items?.[0]?.title || 'Blessing Power Guide Study Book';
    const websiteTrackingUrl = `https://blessing-production.up.railway.app/orders?orderId=${encodeURIComponent(orderId || '')}`;

    // Meta Cloud API Credentials from Environment
    const metaApiToken = process.env.WHATSAPP_CLOUD_API_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    // Build step-specific message content
    let stepTitle = '📚 ORDER CONFIRMED';
    let stepDescription = 'Your study guide order has been received and verified!';
    let actionButtonText = '🚚 TRACK LIVE ON WEBSITE';

    if (step === 'PACKED_DISPATCHED') {
      stepTitle = '📦 ORDER PACKED & DISPATCHED';
      stepDescription = 'Your guide books have been inspected, packed, and handed to ST Courier.';
    } else if (step === 'SHIPPED_AWB') {
      stepTitle = '🚚 SHIPPED VIA ST COURIER';
      stepDescription = `Your parcel is in transit! ST Courier Docket AWB: *${trackingNo}*.`;
    } else if (step === 'OUT_FOR_DELIVERY') {
      stepTitle = '📍 OUT FOR DELIVERY TODAY';
      stepDescription = 'Your ST Courier delivery executive is out for delivery to your address.';
    } else if (step === 'DELIVERED') {
      stepTitle = '🎉 ORDER DELIVERED';
      stepDescription = 'Your guide books were successfully delivered! Good luck with your exams!';
      actionButtonText = '⭐ RATE YOUR GUIDE BOOK';
    }

    // 1. If Meta Cloud API credentials exist, send official Meta WhatsApp API Template Message
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
      } catch (e: any) {
        console.error('Meta API Dispatch Error:', e.message);
      }
    }

    // 2. Fallback / Direct WhatsApp Link Generator for Instant Admin 1-Click Messaging
    const whatsappMessage = `*BLESSING POWER GUIDE*\n*${stepTitle}*\n\nDear *${customerName || 'Student'}*,\n${stepDescription}\n\n📦 *Order ID:* ${orderId || ''}\n📖 *Books:* ${bookTitle}\n💰 *Total:* ₹${totalAmount || 0}\n🚚 *Courier:* ST Courier Express\n📍 *Docket AWB:* ${trackingNo}\n\n👉 *Click to Track Live on Website:* ${websiteTrackingUrl}`;

    const encodedMsg = encodeURIComponent(whatsappMessage);
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
