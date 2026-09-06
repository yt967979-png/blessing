import { NextRequest } from 'next/server';
import { Client } from 'pg';
import { getDbClient, releaseDbClient, resolveDbConnectionConfig, queryDb } from '@/lib/db';
import { applyRateLimitAsync } from '@/lib/serverSecurity';
import { resolveTunedNumber, shouldRunBackgroundTask } from '@/lib/runtimeProfile';
import { isBookInStock } from '@/lib/stock';

/**
 * Customer-facing realtime stock push — Postgres LISTEN/NOTIFY + SSE, same
 * pattern as the admin order bus (`api/orders/stream`) but public (no auth):
 * stock/price/availability are already public catalog data. Every write path
 * that changes `books.stock` or `books.status` (admin edit, Razorpay stock
 * hold reserve/release, order placement fail-safe decrement, admin cancel
 * restore) calls `notifyStockChanged([bookId, ...])` right after its COMMIT,
 * so a book going out of stock reaches every open tab in well under a second
 * instead of waiting for the 15s catalog poll.
 */

export interface StockChangeEntry {
  id: string;
  stock: number;
  status: string;
  inStock: boolean;
}

const clients = new Set<ReadableStreamDefaultController>();
let listenReady: Promise<void> | null = null;
let listenClient: Client | null = null;
let listenPingInterval: NodeJS.Timeout | null = null;
let listenBackoffMs = 1000;
const LISTEN_BACKOFF_MAX = 30000;
let reconnectScheduled = false;

export function broadcastStockChange(data: any) {
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

/**
 * Call this right after committing any change to `books.stock` / `books.status`.
 * Re-reads the affected rows (authoritative post-commit snapshot) and pushes
 * them to every replica's SSE clients via Postgres NOTIFY — cheap, batched,
 * and correct even when the writer and the SSE connection are on different
 * instances behind a load balancer.
 */
export async function notifyStockChanged(bookIds: Array<string | number | null | undefined>): Promise<void> {
  const ids = [...new Set(bookIds.map((id) => (id === null || id === undefined ? '' : String(id))).filter(Boolean))];
  if (ids.length === 0) return;
  try {
    const res = await queryDb(`SELECT id, stock, status FROM books WHERE id = ANY($1::text[])`, [ids]);
    const books: StockChangeEntry[] = (res.rows || []).map((r: any) => ({
      id: String(r.id),
      stock: Number(r.stock ?? 0),
      status: String(r.status || ''),
      inStock: isBookInStock(r),
    }));
    if (books.length === 0) return;
    // Server memory cache (GET /api/products) has a long TTL for CDN-friendliness —
    // without this, a plain (non-fresh) refetch after the push would still return
    // stale stock/status for up to 15 minutes. Dynamic import avoids a static
    // circular dependency between this route and api/products/route.
    try {
      const { invalidateProductsCache } = await import('@/app/api/products/route');
      invalidateProductsCache();
    } catch (_) {}
    const payload = { type: 'STOCK_CHANGED', books, timestamp: Date.now() };
    // Same-process SSE clients must get the event even if LISTEN is down/slow
    broadcastStockChange(payload);
    const client = await getDbClient();
    if (!client) return;
    try {
      await client.query(`SELECT pg_notify('stock_changed', $1)`, [JSON.stringify(payload)]);
    } finally {
      releaseDbClient(client);
    }
  } catch (err: any) {
    console.error('[stock-notify] failed:', err?.message || err);
  }
}

/**
 * Full catalog refresh signal — use after product create / delete / title-price
 * edits. Stock-only patches use `notifyStockChanged`; those cannot invent a new
 * card on the shop home for an id the client has never seen.
 */
export async function notifyCatalogChanged(
  bookIds?: Array<string | number | null | undefined>
): Promise<void> {
  const ids = bookIds
    ? [...new Set(bookIds.map((id) => (id == null ? '' : String(id))).filter(Boolean))]
    : [];
  try {
    try {
      const { invalidateProductsCache } = await import('@/app/api/products/route');
      invalidateProductsCache();
    } catch (_) {}
    const payload = {
      type: 'CATALOG_CHANGED',
      bookIds: ids,
      timestamp: Date.now(),
    };
    broadcastStockChange(payload);
    const client = await getDbClient();
    if (!client) return;
    try {
      await client.query(`SELECT pg_notify('stock_changed', $1)`, [JSON.stringify(payload)]);
    } finally {
      releaseDbClient(client);
    }
    } catch (err: any) {
    console.error('[catalog-notify] failed:', err?.message || err);
  }
}

/** Shop home / hero / profile refetch coupon cards after admin create/edit/delete. */
export async function notifyCouponsChanged(): Promise<void> {
  try {
    const payload = { type: 'COUPONS_CHANGED', timestamp: Date.now() };
    broadcastStockChange(payload);
    const client = await getDbClient();
    if (!client) return;
    try {
      await client.query(`SELECT pg_notify('stock_changed', $1)`, [JSON.stringify(payload)]);
    } finally {
      releaseDbClient(client);
    }
  } catch (err: any) {
    console.error('[coupon-notify] failed:', err?.message || err);
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
  console.warn(`[stock-listen] reconnect scheduled (${reason}) in ${listenBackoffMs}ms`);
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
        console.warn('[stock-listen] client error:', err.message);
        scheduleListenReconnect(err.message || 'error');
      });

      client.on('end', () => {
        scheduleListenReconnect('connection ended');
      });

      await client.connect();
      await client.query('LISTEN stock_changed');
      listenClient = client;
      listenBackoffMs = 1000;

      client.on('notification', (msg: { channel: string; payload?: string }) => {
        if (msg.channel !== 'stock_changed' || !msg.payload) return;
        try {
          broadcastStockChange(JSON.parse(msg.payload));
        } catch {
          /* malformed payload — skip rather than broadcast noise */
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
      }, resolveTunedNumber('STOCK_LISTEN_PING_MS', 'orderListenPingMs'));

      console.log('[stock-listen] LISTEN stock_changed active');
    } catch (err: any) {
      console.error('LISTEN stock_changed failed:', err?.message || err);
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

/** Start NOTIFY listener at boot — every replica needs this since customers can land on any instance. */
export function startStockListenBroker() {
  if (process.env.DISABLE_STOCK_LISTEN === 'true') {
    console.log('[stock-listen] disabled (DISABLE_STOCK_LISTEN=true)');
    return;
  }
  const dbUrl = process.env.DATABASE_URL || '';
  const hasUnpooled = Boolean(
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_DIRECT_URL
  );
  // Neon pooled (PgBouncer) cannot LISTEN; without a direct URL, skip instead of reconnect-storm.
  if (dbUrl.includes('neon.tech') && dbUrl.includes('-pooler.') && !hasUnpooled) {
    console.log(
      '[stock-listen] skipped — Neon pooler URL has no LISTEN support; set DATABASE_URL_UNPOOLED or DISABLE_STOCK_LISTEN=true'
    );
    return;
  }
  if (!shouldRunBackgroundTask('listen')) {
    console.log('[stock-listen] skipped — runtime load/profile');
    return;
  }
  void ensureListen();
}

export async function GET(req: NextRequest) {
  // Public stream — stock/availability is already public catalog data (no auth needed),
  // but still rate-limited so it can't be used to open unbounded connections.
  const rl = await applyRateLimitAsync(req, 'stock-stream', 30, 60000);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Too many connections. Please wait.' }), {
      status: 429,
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
