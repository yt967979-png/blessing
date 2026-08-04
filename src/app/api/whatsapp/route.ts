import { NextResponse } from 'next/server';
import { notify, statusToNotifyEvent, notifyWhatsApp } from '@/lib/notify/send';
import type { NotifyEvent } from '@/lib/notify/types';
import { applyRateLimitAsync, clientIp, verifyAdminRequest, unauthorizedResponse, forbiddenResponse } from '@/lib/serverSecurity';

/**
 * Admin-only WhatsApp resend API.
 * Prefer notify() from server code for transactional messages.
 */
export async function POST(request: Request) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) {
    if (!admin.user) return unauthorizedResponse(admin.error || 'Unauthorized');
    return forbiddenResponse(admin.error || 'Admin only');
  }

  const rl = await applyRateLimitAsync(`wa-send:${admin.user?.userId || clientIp(request)}`, 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many WhatsApp sends. Wait a minute.' }, { status: 429 });
  }

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

    // Free-form text is high-risk — allow only short admin notes
    if (customMessage) {
      const text = String(customMessage).slice(0, 500);
      const r = await notifyWhatsApp(rawPhone, text);
      if (r.ok) {
        return NextResponse.json({
          success: true,
          provider: 'BAILEYS_IN_PROCESS',
          queued: r.queued,
        });
      }
      return NextResponse.json({ error: r.error || 'Send failed' }, { status: 503 });
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
      // Prepaid flow: no YES gate — send paid/confirmed copy
      event = 'payment.confirmed';
    } else if (statusClean.includes('PAYMENT') || statusClean.includes('PAID')) {
      event = 'payment.confirmed';
    } else if (
      statusClean.includes('ORDER_PLACED') ||
      statusClean === 'ORDER PLACED' ||
      statusClean === 'CONFIRMED' ||
      statusClean.includes('CONFIRMED')
    ) {
      event = 'order.confirmed';
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
