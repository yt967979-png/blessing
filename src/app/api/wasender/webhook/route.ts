import { NextRequest, NextResponse } from 'next/server';
import { handleInboundYesNo } from '@/lib/orderConfirm';
import { sendViaWasender } from '@/lib/wasender';

/**
 * WasenderAPI Inbound Webhook Receiver
 * Receives incoming customer messages (YES / NO / TRACK) from WasenderAPI.
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json().catch(() => ({}));
    const phoneRaw = String(payload.phone || payload.from || payload.sender || payload.data?.from || '').trim();
    const textRaw = String(payload.message || payload.text || payload.body || payload.data?.message || '').trim();

    if (!phoneRaw || !textRaw) {
      return NextResponse.json({ status: 'ignored', reason: 'missing phone or text' }, { status: 200 });
    }

    const cleanPhone = phoneRaw.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return NextResponse.json({ status: 'ignored', reason: 'invalid phone' }, { status: 200 });
    }

    console.log(`[wasender-webhook] 💬 Inbound text from +${cleanPhone}: "${textRaw}"`);

    const result = await handleInboundYesNo(cleanPhone, textRaw);
    if (result.handled) {
      const replyMsg = (result as any).result?.message;
      if (replyMsg) {
        await sendViaWasender(cleanPhone, replyMsg);
      }
      return NextResponse.json({ status: 'handled', answer: result.answer }, { status: 200 });
    }

    return NextResponse.json({ status: 'unhandled', reason: (result as any)?.reason }, { status: 200 });
  } catch (err: any) {
    console.error('[wasender-webhook error]', err?.message || err);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'online', service: 'WasenderAPI Webhook Receiver' });
}
