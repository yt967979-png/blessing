import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingWhatsAppMessage } from '@/lib/whatsappCommerce';

export const runtime = 'nodejs';

/**
 * Meta WhatsApp Cloud API Webhook Handshake (GET)
 * Used by Meta Developers Console to verify webhook ownership.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN || 'blessing_power_guide_webhook_token';

  if (mode === 'subscribe' && token === configuredToken) {
    console.log('[WhatsApp Webhook] Handshake verified successfully with Meta!');
    return new Response(challenge || '', { status: 200 });
  }

  console.warn('[WhatsApp Webhook] Handshake verification failed. Check WHATSAPP_VERIFY_TOKEN.');
  return new Response('Forbidden', { status: 403 });
}

/**
 * Meta WhatsApp Cloud API Event Consumer (POST)
 * Receives incoming customer messages, quick button taps, and list selections.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    if (!body || body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 });
    }

    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value || !Array.isArray(value.messages)) continue;

        const contact = (value.contacts && value.contacts[0]) || {};
        const senderName = contact?.profile?.name || undefined;

        for (const message of value.messages) {
          const fromPhone = message.from;
          if (!fromPhone) continue;

          let incomingText = '';
          let interactiveId: string | undefined = undefined;

          if (message.type === 'text') {
            incomingText = message.text?.body || '';
          } else if (message.type === 'interactive') {
            const interactive = message.interactive;
            if (interactive.type === 'button_reply') {
              interactiveId = interactive.button_reply?.id;
              incomingText = interactive.button_reply?.title || '';
            } else if (interactive.type === 'list_reply') {
              interactiveId = interactive.list_reply?.id;
              incomingText = interactive.list_reply?.title || '';
            }
          }

          // Process the conversational state machine
          if (incomingText || interactiveId) {
            await handleIncomingWhatsAppMessage(fromPhone, incomingText, interactiveId, senderName).catch(
              (err) => {
                console.error('[WhatsApp Consumer Error]', err?.message || err);
              }
            );
          }
        }
      }
    }

    // Always return 200 OK immediately to Meta
    return NextResponse.json({ status: 'EVENT_RECEIVED' }, { status: 200 });
  } catch (error: any) {
    console.error('[WhatsApp Webhook POST Error]', error?.message || error);
    return NextResponse.json({ status: 'ERROR', error: error?.message }, { status: 200 });
  }
}
