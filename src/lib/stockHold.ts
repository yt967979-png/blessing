/**
 * Stock reservation ("hold") model — shared by Razorpay order create, order
 * confirm, the release endpoint, the Razorpay webhook, and the TTL sweeper.
 *
 * Design (Option A — ledger table, `books.stock` stays the single source of
 * truth for "sellable right now"):
 *   1. POST /api/razorpay decrements `books.stock` atomically the instant a
 *      Razorpay order is created, and writes one `stock_holds` row per book
 *      (status='held'). This is what makes the reduction visible everywhere
 *      that already reads `books.stock` (catalog, cart validate, checkout) —
 *      no other file needs to change to "see" a hold.
 *   2. POST /api/orders (payment success) calls `confirmStockHolds`, which
 *      atomically flips 'held' -> 'confirmed' for that Razorpay order. Once
 *      confirmed, the stock stays decremented permanently (the sale is real)
 *      and nothing ever restores it. No second decrement happens.
 *   3. Anything else (explicit cancel/dismiss, Razorpay payment.failed
 *      webhook, or the TTL sweeper for abandoned sessions) calls
 *      `releaseStockHolds`, which atomically flips 'held'/'confirmed' ->
 *      'released' and adds the qty back to `books.stock`.
 *
 * Every transition is a single `UPDATE ... WHERE status IN (...) RETURNING`
 * statement, so concurrent callers (webhook + sweeper + explicit release +
 * order confirm racing each other) can only ever claim a row once — this is
 * what keeps release/confirm idempotent without extra locking.
 */
import { queryDb, getDbClient } from '@/lib/db';

/** Lazy import — avoids a hard dependency cycle with the route module at load time. */
async function pushStockChanged(bookIds: Array<string | number>): Promise<void> {
  try {
    const { notifyStockChanged } = await import('@/app/api/stock/stream/route');
    await notifyStockChanged(bookIds);
  } catch (_) {
    /* best-effort — the 15s catalog poll is still a correctness fallback */
  }
}

export const STOCK_HOLD_TTL_MINUTES = Math.max(
  5,
  Number(process.env.STOCK_HOLD_TTL_MINUTES || 20)
);

async function execQuery(client: any, sql: string, params?: any[]): Promise<any> {
  if (client && typeof client.query === 'function') {
    return client.query(sql, params);
  }
  return queryDb(sql, params);
}

export interface HoldItemInput {
  id: string | number;
  qty: number;
  title?: string;
}

export type CreateHoldsResult =
  | { ok: true; holdGroupId: string }
  | { ok: false; error: string; status: number };

/**
 * Reserve stock for a Razorpay checkout attempt: atomic per-book decrement
 * (same race-safe `WHERE stock >= qty` guard as order placement) plus one
 * ledger row per book, all in a single transaction. Call this BEFORE asking
 * Razorpay to create the order, then `attachRazorpayOrderId` once you have
 * the Razorpay order id back.
 */
export async function createStockHolds(opts: {
  items: HoldItemInput[];
  userId: string;
}): Promise<CreateHoldsResult> {
  const items = Array.isArray(opts.items) ? opts.items : [];
  if (items.length === 0) {
    return { ok: false, error: 'Cart is empty.', status: 400 };
  }

  const holdGroupId = `hold-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const client = await getDbClient();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      const qty = Math.max(1, Math.floor(Number(item.qty) || 0));
      const bookRes = await client.query(
        `UPDATE books
         SET stock = COALESCE(stock, 0) - $1,
             status = CASE WHEN COALESCE(stock, 0) - $1 <= 0 THEN 'out_of_stock' ELSE status END,
             updated_at = NOW()
         WHERE id = $2 AND COALESCE(stock, 0) >= $1
         RETURNING id, title`,
        [qty, item.id]
      );
      if (bookRes.rowCount === 0) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          error: `"${item.title || item.id}" went out of stock. Please refresh your cart.`,
          status: 409,
        };
      }
      await client.query(
        `INSERT INTO stock_holds (id, hold_group_id, book_id, user_id, qty, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'held', NOW() + ($6 || ' minutes')::interval)`,
        [
          `sh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          holdGroupId,
          item.id,
          opts.userId || null,
          qty,
          String(STOCK_HOLD_TTL_MINUTES),
        ]
      );
    }
    await client.query('COMMIT');
    void pushStockChanged(items.map((i) => i.id));
    return { ok: true, holdGroupId };
  } catch (err: any) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    return { ok: false, error: err?.message || 'Could not reserve stock.', status: 500 };
  } finally {
    client.end();
  }
}

/** Link the freshly-created Razorpay order id to its hold group. */
export async function attachRazorpayOrderId(holdGroupId: string, razorpayOrderId: string): Promise<void> {
  if (!holdGroupId || !razorpayOrderId) return;
  await queryDb(
    `UPDATE stock_holds SET razorpay_order_id = $2, updated_at = NOW()
     WHERE hold_group_id = $1 AND status = 'held'`,
    [holdGroupId, razorpayOrderId]
  );
}

export interface ConfirmedHoldItem {
  bookId: string;
  qty: number;
}

/**
 * Payment succeeded — convert this Razorpay order's holds from 'held' to
 * 'confirmed'. Idempotent: a second call (retry, webhook racing the client)
 * finds nothing left in 'held' and returns []. Pass the order's own
 * transactional `client` so a later rollback in the same request correctly
 * un-confirms these rows back to 'held' too.
 */
export async function confirmStockHolds(razorpayOrderId: string, client?: any): Promise<ConfirmedHoldItem[]> {
  const rzpOrderId = String(razorpayOrderId || '').trim();
  if (!rzpOrderId) return [];
  const res = await execQuery(
    client,
    `UPDATE stock_holds
     SET status = 'confirmed', updated_at = NOW()
     WHERE razorpay_order_id = $1 AND status = 'held'
     RETURNING book_id, qty`,
    [rzpOrderId]
  );
  return (res.rows || []).map((r: any) => ({ bookId: String(r.book_id), qty: Number(r.qty) || 0 }));
}

/**
 * Record an extra confirmed-hold ledger row when an order needed to decrement
 * `books.stock` directly (fail-safe path — hold missing or short). Keeps the
 * `stock_holds` table an accurate audit trail of every unit sold.
 */
export async function recordConfirmedSale(
  client: any,
  opts: { razorpayOrderId: string; bookId: string | number; userId: string; qty: number }
): Promise<void> {
  if (opts.qty <= 0) return;
  await execQuery(
    client,
    `INSERT INTO stock_holds (id, hold_group_id, razorpay_order_id, book_id, user_id, qty, status, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'confirmed', NOW())`,
    [
      `sh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      `direct-${opts.razorpayOrderId}`,
      opts.razorpayOrderId,
      opts.bookId,
      opts.userId || null,
      opts.qty,
    ]
  );
}

/** Shrink a confirmed hold's recorded qty (cart qty dropped between Razorpay order create and order confirm). */
export async function shrinkConfirmedHold(
  client: any,
  opts: { razorpayOrderId: string; bookId: string | number; newQty: number }
): Promise<void> {
  await execQuery(
    client,
    `UPDATE stock_holds SET qty = $3, updated_at = NOW()
     WHERE razorpay_order_id = $1 AND book_id = $2 AND status = 'confirmed'`,
    [opts.razorpayOrderId, opts.bookId, Math.max(0, Math.floor(opts.newQty))]
  );
}

export interface ReleaseIdentifier {
  razorpayOrderId?: string | null;
  holdGroupId?: string | null;
  /** Extra safety check for the customer-triggered release endpoint. */
  userId?: string | null;
}

export interface ReleaseResult {
  releasedCount: number;
  releasedQtyByBook: Record<string, number>;
}

/**
 * Not paid (or no longer needed) — restore reserved qty back to
 * `books.stock` and mark the ledger rows 'released'. Idempotent: only rows
 * still 'held' or 'confirmed' are claimed, so calling this twice (sweeper +
 * webhook + explicit client release racing each other) never double-restores
 * stock — the second caller's UPDATE matches zero rows.
 */
export async function releaseStockHolds(
  identifier: ReleaseIdentifier,
  reason: string,
  client?: any
): Promise<ReleaseResult> {
  const whereParts: string[] = [];
  const params: any[] = [];
  if (identifier.razorpayOrderId) {
    params.push(identifier.razorpayOrderId);
    whereParts.push(`razorpay_order_id = $${params.length}`);
  }
  if (identifier.holdGroupId) {
    params.push(identifier.holdGroupId);
    whereParts.push(`hold_group_id = $${params.length}`);
  }
  if (whereParts.length === 0) {
    return { releasedCount: 0, releasedQtyByBook: {} };
  }

  let userClause = '';
  if (identifier.userId) {
    params.push(identifier.userId);
    userClause = ` AND user_id = $${params.length}`;
  }

  params.push(String(reason || 'released').slice(0, 100));
  const reasonIdx = params.length;

  const res = await execQuery(
    client,
    `UPDATE stock_holds
     SET status = 'released', released_at = NOW(), release_reason = $${reasonIdx}, updated_at = NOW()
     WHERE (${whereParts.join(' OR ')}) AND status IN ('held', 'confirmed')${userClause}
     RETURNING book_id, qty`,
    params
  );

  const byBook: Record<string, number> = {};
  for (const row of res.rows || []) {
    const id = String(row.book_id);
    byBook[id] = (byBook[id] || 0) + (Number(row.qty) || 0);
  }

  for (const [bookId, qty] of Object.entries(byBook)) {
    if (qty <= 0) continue;
    await execQuery(
      client,
      `UPDATE books
       SET stock = COALESCE(stock, 0) + $1,
           status = CASE WHEN COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
           updated_at = NOW()
       WHERE id = $2`,
      [qty, bookId]
    );
  }

  const changedIds = Object.keys(byBook).filter((id) => byBook[id] > 0);
  if (changedIds.length > 0) void pushStockChanged(changedIds);

  return { releasedCount: res.rowCount || 0, releasedQtyByBook: byBook };
}

/**
 * TTL sweeper — releases stock for abandoned Razorpay sessions (customer
 * closed the tab, killed the app, or never opened the payment sheet at all).
 * Safe to run frequently and from every replica: each expired hold group can
 * only be claimed once thanks to the `status IN (...)` guard above.
 */
export async function sweepExpiredStockHolds(): Promise<number> {
  try {
    const expired = await queryDb(
      `SELECT DISTINCT hold_group_id FROM stock_holds
       WHERE status = 'held' AND expires_at < NOW()
       LIMIT 200`
    );
    let releasedGroups = 0;
    for (const row of expired.rows) {
      const result = await releaseStockHolds({ holdGroupId: row.hold_group_id }, 'ttl_expired');
      if (result.releasedCount > 0) releasedGroups++;
    }
    return releasedGroups;
  } catch (err: any) {
    console.warn('[stockHold] sweep failed:', err?.message || err);
    return 0;
  }
}

/** Admin visibility — active reservations right now (units held, not yet sold or released). */
export async function getActiveHoldsSummary(limit = 100) {
  const res = await queryDb(
    `SELECT sh.id, sh.book_id, b.title, sh.qty, sh.razorpay_order_id, sh.expires_at, sh.created_at
     FROM stock_holds sh
     LEFT JOIN books b ON b.id = sh.book_id
     WHERE sh.status = 'held'
     ORDER BY sh.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((r: any) => ({
    id: r.id,
    bookId: r.book_id,
    title: r.title || r.book_id,
    qty: Number(r.qty) || 0,
    razorpayOrderId: r.razorpay_order_id,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  }));
}
