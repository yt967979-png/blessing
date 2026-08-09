import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { getDbClient, releaseDbClient, resolveDbConnectionConfig } from '@/lib/db';
import { getAuthenticatedUser, verifyAdminRequest } from '@/lib/serverSecurity';
import { resolveTunedNumber, shouldRunBackgroundTask } from '@/lib/runtimeProfile';

type StreamClient = {
  controller: ReadableStreamDefaultController;
  userId: string;
  isAdmin: boolean;
};

const clients = new Set<StreamClient>();
let listenReady: Promise<void> | null = null;
let listenClient: Client | null = null;
let listenPingInterval: NodeJS.Timeout | null = null;
let listenBackoffMs = 1000;
const LISTEN_BACKOFF_MAX = 30000;
let reconnectScheduled = false;

function clientMayReceive(meta: StreamClient, data: any): boolean {
  if (meta.isAdmin) return true;
  if (data?.type === 'CONNECTED') return true;
  // Customers only see their own order events (never other users' AWB/status)
  const eventUser = data?.userId != null ? String(data.userId) : '';
  return Boolean(eventUser) && eventUser === String(meta.userId);
}

export function broadcastOrderChange(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  for (const meta of [...clients]) {
    if (!clientMayReceive(meta, data)) continue;
    try {
      meta.controller.enqueue(encoded);
    } catch {
      clients.delete(meta);
    }
  }
}

/** Cross-instance broadcast via Postgres NOTIFY */
export async function notifyOrderChanged(data: any) {
  let client: any = null;
  try {
    client = await getDbClient();
    if (!client) return;
    await client.query(`SELECT pg_notify('order_changed', $1)`, [JSON.stringify(data)]);
  } catch (err) {
    console.error('NOTIFY order_changed failed:', err);
  } finally {
    releaseDbClient(client);
  }
}

function stopListenClient() {
  if (listenPingInterval) {
    clearInterval(listenPingInterval);
    listenPingInterval = null;
  }
  listenReady = null;
  const c = listenClient;
  listenClient = null;
  if (c) {
    try {
      void c.end();
    } catch (_) {}
  }
}

function scheduleListenReconnect(reason: string) {
  if (reconnectScheduled) return;
  reconnectScheduled = true;
  stopListenClient();
  console.warn(`[order-listen] reconnect scheduled (${reason}) in ${listenBackoffMs}ms`);
  setTimeout(() => {
    reconnectScheduled = false;
    void ensureListen();
  }, listenBackoffMs);
  listenBackoffMs = Math.min(listenBackoffMs * 2, LISTEN_BACKOFF_MAX);
}

function ensureListen() {
  if (listenReady) return listenReady;
  listenReady = (async () => {
    let client: Client | null = null;
    try {
      const cfg = await resolveDbConnectionConfig();
      client = new Client(cfg);

      client.on('error', (err: Error) => {
        console.warn('[order-listen] client error:', err.message);
        scheduleListenReconnect(err.message || 'error');
      });

      client.on('end', () => {
        scheduleListenReconnect('connection ended');
      });

      await client.connect();
      await client.query('LISTEN order_changed');
      listenClient = client;
      listenBackoffMs = 1000;

      client.on('notification', (msg: { channel: string; payload?: string }) => {
        if (msg.channel !== 'order_changed' || !msg.payload) return;
        try {
          broadcastOrderChange(JSON.parse(msg.payload));
        } catch {
          broadcastOrderChange({ type: 'ORDER_UPDATED', timestamp: Date.now() });
        }
      });

      if (listenPingInterval) clearInterval(listenPingInterval);
      listenPingInterval = setInterval(async () => {
        try {
          if (!listenClient) return;
          await listenClient.query('SELECT 1');
        } catch (err: any) {
          scheduleListenReconnect(err?.message || 'ping failed');
        }
      }, resolveTunedNumber('ORDER_LISTEN_PING_MS', 'orderListenPingMs'));

      console.log('[order-listen] LISTEN order_changed active');
    } catch (err: any) {
      console.error('LISTEN order_changed failed:', err?.message || err);
      if (client) {
        try {
          await client.end();
        } catch (_) {}
      }
      listenClient = null;
      scheduleListenReconnect('initial connect failed');
    }
  })();
  return listenReady;
}

/** Start NOTIFY listener at boot — keeps admin + customer order streams aligned. */
export function startOrderListenBroker() {
  if (process.env.DISABLE_ORDER_LISTEN === 'true') {
    console.log('[order-listen] disabled (DISABLE_ORDER_LISTEN=true)');
    return;
  }
  const dbUrl = process.env.DATABASE_URL || '';
  const hasUnpooled = Boolean(
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_DIRECT_URL
  );
  if (dbUrl.includes('neon.tech') && dbUrl.includes('-pooler.') && !hasUnpooled) {
    console.log(
      '[order-listen] skipped — Neon pooler URL has no LISTEN support; set DATABASE_URL_UNPOOLED or DISABLE_ORDER_LISTEN=true'
    );
    return;
  }
  if (!shouldRunBackgroundTask('listen')) {
    console.log('[order-listen] skipped — runtime load/profile');
    return;
  }
  void ensureListen();
}

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedUser(req);
  if (!session?.userId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const admin = await verifyAdminRequest(req);
  const isAdmin = Boolean(admin.isAdmin);
  const userId = String(session.userId);

  void ensureListen();

  let metaRef: StreamClient | null = null;

  const stream = new ReadableStream({
    start(controller) {
      metaRef = { controller, userId, isAdmin };
      clients.add(metaRef);
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: 'CONNECTED', isAdmin, timestamp: Date.now() })}\n\n`
        )
      );

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(heartbeat);
        }
      }, 25000);

      const cleanup = () => {
        clearInterval(heartbeat);
        if (metaRef) clients.delete(metaRef);
        try {
          controller.close();
        } catch (_) {}
      };

      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (metaRef) clients.delete(metaRef);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
