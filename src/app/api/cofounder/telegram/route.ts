import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramWebhook } from '@/lib/cofounder/telegram';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cofounder/telegram
 * Webhook endpoint registered with Telegram Bot API (setWebhook).
 * Free 2-way chat with your AI Co-Founder.
 */
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-telegram-bot-api-secret-token');
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

    if (expectedSecret && secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized webhook secret' }, { status: 401 });
    }

    const payload = await req.json().catch(() => ({}));
    const result = await handleTelegramWebhook(payload);

    return NextResponse.json({ ok: true, handled: result.handled, replyText: result.replyText });
  } catch (err: any) {
    console.error('[CoFounder Telegram Webhook Error]:', err);
    return NextResponse.json({ error: 'Internal webhook error' }, { status: 500 });
  }
}

export async function GET() {
  const isConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return NextResponse.json({
    status: 'ok',
    service: 'Blessing Power Guide AI Co-Founder Telegram Webhook',
    telegramConfigured: isConfigured,
    timestamp: new Date().toISOString(),
  });
}
