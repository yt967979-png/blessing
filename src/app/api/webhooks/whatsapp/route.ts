import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { handleIncomingWhatsAppMessage } from '@/lib/whatsappCommerce';
import { queryDb } from '@/lib/db';
import { getRedisClient } from '@/lib/redis';

export const runtime = 'nodejs';

/**
 * Meta X-Hub-Signature-256 HMAC verification
 * Uses constant-time buffer comparison to prevent timing attacks.
 */
function verifyMetaSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const signatureHex = signatureHeader.slice('sha256='.length).trim();
  const hmac = crypto.createHmac('sha256', appSecret);
  const expectedHex = hmac.update(rawBody, 'utf8').digest('hex');

  try {
    const sigBuffer = Buffer.from(signatureHex, 'hex');
    const expectedBuffer = Buffer.from(expectedHex, 'hex');
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Multi-layer event deduplication (Redis SETNX + PostgreSQL ledger)
 * Prevents Meta webhook retries from causing duplicate messages, double cart actions, or duplicate orders.
 */
async function isEventAlreadyProcessed(eventId: string, eventType: string = 'whatsapp_message'): Promise<boolean> {
  if (!eventId) return false;

  // 1. Fast Redis check (10 min TTL)
  try {
    const redis = getRedisClient();
    if (redis) {
      const setRes = await redis.set(`wa:event:${eventId}`, '1', 'EX', 600, 'NX');
      if (!setRes) {
        return true; // Already processed!
      }
    }
  } catch (err: any) {
    console.warn('[WhatsApp Dedup] Redis check skipped:', err?.message || err);
  }

  // 2. Persistent PostgreSQL ledger check
  try {
    const dbRes = await queryDb(
      `INSERT INTO whatsapp_processed_events (event_id, event_type, processed_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [eventId, eventType]
    );
    if (dbRes.rowCount === 0) {
      return true; // Already processed!
    }
  } catch (err: any) {
    console.warn('[WhatsApp Dedup] DB check skipped:', err?.message || err);
  }

  return false;
}

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
 * Enforces X-Hub-Signature-256 HMAC verification and message deduplication.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const appSecret = (process.env.WHATSAPP_APP_SECRET || '').trim();

    // 1. Meta Webhook HMAC-SHA256 Signature Verification (WA-03)
    if (appSecret) {
      const signatureHeader = request.headers.get('x-hub-signature-256');
      if (!signatureHeader || !verifyMetaSignature(rawBody, signatureHeader, appSecret)) {
        console.warn('[WhatsApp Webhook] SECURITY ALERT: Invalid or missing Meta X-Hub-Signature-256 received');
        return NextResponse.json({ error: 'Invalid or missing signature' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production' && (process.env.STRICT_WEBHOOK_SECURITY === 'true' || process.env.ENFORCE_META_SIGNATURE === 'true')) {
      console.error('[WhatsApp Webhook] STRICT MODE: WHATSAPP_APP_SECRET is not configured in production. Rejecting request.');
      return NextResponse.json({ error: 'Webhook signature verification required in production' }, { status: 401 });
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('[WhatsApp Webhook] WHATSAPP_APP_SECRET not configured. Please set WHATSAPP_APP_SECRET to prevent forged webhook requests.');
    }

    let body: any = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

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
          const messageId = String(message.id || '').trim();
          if (!fromPhone) continue;

          // 2. Webhook Event Deduplication (WA-04)
          if (messageId) {
            const isDuplicate = await isEventAlreadyProcessed(messageId, 'whatsapp_message');
            if (isDuplicate) {
              console.log(`[WhatsApp Webhook] Duplicate message skipped: ${messageId}`);
              continue;
            }
          }

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
