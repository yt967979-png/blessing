import { NextResponse } from 'next/server';
import { notify, statusToNotifyEvent } from '@/lib/notify/send';
import type { NotifyEvent } from '@/lib/notify/types';

/**
 * Thin WhatsApp API — routes through shared notify layer (Baileys transport).
 * Prefer calling notify() from server code; this exists for admin resend / legacy clients.
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

    let rawPhone = String(customerPhone || '').replace(/\D/g, '');
    if (rawPhone.length < 10) {
      return NextResponse.json(
        { error: 'Valid customer phone number is required to send WhatsApp.' },
        { status: 400 }
      );
    }

    const bookTitle =
      items?.[0]?.title ||
      (Array.isArray(items) ? items.map((i: any) => i?.title).filter(Boolean).join(', ') : '') ||
      'Blessing Power Guide';

    const statusClean = String(step || body.status || '').toUpperCase();
    let event: NotifyEvent | 'order.in_transit' | null = statusToNotifyEvent(statusClean);

    if (
      statusClean.includes('CONFIRM_REQUEST') ||
      statusClean.includes('AWAITING_CONFIRMATION') ||
      statusClean.includes('AWAITING CONFIRMATION')
    ) {
      event = 'order.confirm_request';
    } else if (statusClean.includes('PAYMENT') || statusClean.includes('PAID')) {
      event = 'payment.confirmed';
    } else if (statusClean.includes('ORDER_PLACED') || statusClean === 'ORDER PLACED') {
      // After YES, status is Order Placed — treat resend as confirmed copy
      event = 'order.confirmed';
    }

    if (customMessage) {
      const { notifyWhatsApp } = await import('@/lib/notify/send');
      const r = await notifyWhatsApp(rawPhone, customMessage);
      if (r.ok) {
        return NextResponse.json({
          success: true,
          provider: 'BAILEYS_IN_PROCESS',
          queued: r.queued,
        });
      }
      return NextResponse.json({ error: r.error || 'Send failed' }, { status: 503 });
    }

    if (!event) {
      event = 'order.confirmed';
    }

    const result = await notify(event, {
      customerPhone: rawPhone,
      customerName,
      orderId,
      totalAmount,
      bookTitle,
      itemsSummary: bookTitle,
      awbNumber: trackingNumber || undefined,
    });

    if (result.ok) {
      return NextResponse.json({
        success: true,
        provider: 'BAILEYS_IN_PROCESS',
        event: result.event,
        queued: result.queued,
        message: `WhatsApp ${result.event} sent`,
      });
    }

    // Last-resort wa.me link for admin manual open
    const phoneWithCountry = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const fallbackLink = `https://wa.me/${phoneWithCountry}`;
    return NextResponse.json(
      {
        success: false,
        error: result.error || 'WhatsApp not linked',
        whatsappLink: fallbackLink,
        hint: 'Open Admin → WhatsApp and scan QR, then resend.',
      },
      { status: 503 }
    );
  } catch (err: any) {
    console.error('[whatsapp] route error:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'WhatsApp failed' }, { status: 500 });
  }
}
