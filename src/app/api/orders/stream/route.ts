import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { getDbClient, getDbConnectionConfig } from '@/lib/db';
import { getAuthenticatedUser } from '@/lib/serverSecurity';

const clients = new Set<ReadableStreamDefaultController>();
let listenReady: Promise<void> | null = null;
let listenClient: Client | null = null;

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
    if (client) {
      try {
        await client.end();
      } catch (_) {}
    }
  }
}

function ensureListen() {
  if (listenReady) return listenReady;
  listenReady = (async () => {
    try {
      // Dedicated Client — must NOT use the pool (LISTEN holds the connection forever)
      const cfg = getDbConnectionConfig();
      listenClient = new Client(cfg);
      await listenClient.connect();
      await listenClient.query('LISTEN order_changed');
      listenClient.on('notification', (msg: { channel: string; payload?: string }) => {
        if (msg.channel !== 'order_changed' || !msg.payload) return;
        try {
          broadcastOrderChange(JSON.parse(msg.payload));
        } catch {
          broadcastOrderChange({ type: 'ORDER_UPDATED', timestamp: Date.now() });
        }
      });
      listenClient.on('error', () => {
        listenReady = null;
        try {
          void listenClient?.end();
        } catch (_) {}
        listenClient = null;
      });
    } catch (err) {
      console.error('LISTEN order_changed failed:', err);
      listenReady = null;
      listenClient = null;
    }
  })();
  return listenReady;
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
