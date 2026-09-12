import { Client } from 'pg';
import { getDbClient, releaseDbClient, resolveDbConnectionConfig } from '@/lib/db';
import { shouldRunBackgroundTask } from '@/lib/runtimeProfile';

export type SupportStreamEvent = {
  type: 'NEW_MESSAGE' | 'CONVERSATION_UPDATED' | 'SUPPORT_REQUESTED' | 'CHAT_CLAIMED' | 'CHAT_RESOLVED' | 'TYPING';
  conversationId: string;
  senderType?: 'CUSTOMER' | 'AI' | 'ADMIN' | 'SYSTEM';
  senderName?: string;
  text?: string;
  assignedAdminName?: string;
  status?: string;
  data?: any;
  timestamp: string;
};

type SupportClient = {
  controller: ReadableStreamDefaultController;
  conversationId?: string;
  userId?: string;
  isAdmin: boolean;
};

const supportClients = new Set<SupportClient>();
let supportListenReady: Promise<void> | null = null;
let supportListenClient: Client | null = null;
let supportPingInterval: NodeJS.Timeout | null = null;

function clientCanReceive(c: SupportClient, ev: SupportStreamEvent): boolean {
  if (c.isAdmin) return true;
  // Customers only receive events destined for their specific conversation
  return Boolean(c.conversationId && c.conversationId === ev.conversationId);
}

export function registerSupportClient(c: SupportClient) {
  supportClients.add(c);
  ensureSupportListen();
  return () => {
    supportClients.delete(c);
  };
}

export function broadcastSupportEvent(ev: SupportStreamEvent) {
  const message = `data: ${JSON.stringify(ev)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  for (const c of [...supportClients]) {
    if (!clientCanReceive(c, ev)) continue;
    try {
      c.controller.enqueue(encoded);
    } catch {
      supportClients.delete(c);
    }
  }
}

/** Broadcast across instances via PostgreSQL NOTIFY */
export async function notifySupportEvent(ev: SupportStreamEvent) {
  // Broadcast locally first for instant zero-latency feedback
  broadcastSupportEvent(ev);

  let client: any = null;
  try {
    client = await getDbClient();
    if (!client) return;
    await client.query(`SELECT pg_notify('support_stream_events', $1)`, [JSON.stringify(ev)]);
  } catch (err) {
    console.error('NOTIFY support_stream_events failed:', err);
  } finally {
    releaseDbClient(client);
  }
}

function ensureSupportListen() {
  if (supportListenReady) return supportListenReady;
  supportListenReady = (async () => {
    if (!shouldRunBackgroundTask('listen')) return;

    let client: Client | null = null;
    try {
      const cfg = await resolveDbConnectionConfig();
      client = new Client(cfg);

      client.on('error', (err: Error) => {
        console.warn('[support-listen] error:', err.message);
        stopSupportListen();
      });

      await client.connect();
      await client.query('LISTEN support_stream_events');
      supportListenClient = client;

      client.on('notification', (msg) => {
        if (msg.channel === 'support_stream_events' && msg.payload) {
          try {
            const ev: SupportStreamEvent = JSON.parse(msg.payload);
            broadcastSupportEvent(ev);
          } catch (_) {}
        }
      });

      if (!supportPingInterval) {
        supportPingInterval = setInterval(() => {
          if (supportListenClient) {
            void supportListenClient.query('SELECT 1').catch(() => {});
          }
        }, 25000);
      }
    } catch (err: any) {
      console.warn('[support-listen] connect failed:', err?.message || err);
      stopSupportListen();
    }
  })();
  return supportListenReady;
}

function stopSupportListen() {
  if (supportPingInterval) {
    clearInterval(supportPingInterval);
    supportPingInterval = null;
  }
  supportListenReady = null;
  const c = supportListenClient;
  supportListenClient = null;
  if (c) {
    try {
      void c.end();
    } catch (_) {}
  }
}
