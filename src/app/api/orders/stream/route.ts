import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { getDbClient, releaseDbClient, resolveDbConnectionConfig } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/serverSecurity';

const clients = new Set<ReadableStreamDefaultController>();
let listenReady: Promise<void> | null = null;
let listenClient: Client | null = null;
let listenPingInterval: NodeJS.Timeout | null = null;
let listenBackoffMs = 1000;
const LISTEN_BACKOFF_MAX = 30000;
let reconnectScheduled = false;

export function broadcastOrderChange(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  for (const client of clients) {
    try {
      client.enqueue(encoded);
    } catch {
      clients.delete(client);
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
      }, 45000);

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

/** Start NOTIFY listener at boot — keeps admin order stream aligned 24/7. */
export function startOrderListenBroker() {
  if (process.env.DISABLE_ORDER_LISTEN === 'true') {
    console.log('[order-listen] disabled (DISABLE_ORDER_LISTEN=true)');
    return;
  }
  void ensureListen();
}

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedUser(req);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  void ensureListen();

  let controllerRef: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
      clients.add(controller);
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`)
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
        clients.delete(controller);
        try {
          controller.close();
        } catch (_) {}
      };

      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (controllerRef) clients.delete(controllerRef);
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
