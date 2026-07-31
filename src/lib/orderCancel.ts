/**
 * Shared cancel execution — used by API, WhatsApp NO, and 24h timeout.
 */
import { getDbClient, releaseDbClient } from '@/lib/db';
import { paymentStatusAfterCancel, isOrderCancelled } from '@/lib/orderStatus';
import { broadcastOrderChange, notifyOrderChanged } from '@/app/api/orders/stream/route';
import { notify } from '@/lib/notify/send';

export type CancelActor = 'customer' | 'admin' | 'system' | 'whatsapp_no';

export type CancelResult =
  | { ok: true; orderNumber: string; duplicate?: boolean }
  | { ok: false; error: string; status?: number };

const BLOCKED_AFTER = ['handed to st courier', 'in transit', 'out for delivery', 'delivered', 'cancelled'];

function parseAddr(raw: unknown): { phone: string; name: string; city?: string } {
  try {
    const addr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      phone: String((addr as any)?.phone || ''),
      name: String((addr as any)?.name || 'Student'),
      city: String((addr as any)?.city || (addr as any)?.district || ''),
    };
  } catch {
    return { phone: '', name: 'Student' };
  }
}

export async function executeOrderCancel(opts: {
  orderId: string;
  reason: string;
  actor: CancelActor;
  /** When set, enforce ownership (customer / whatsapp). */
  userId?: string | null;
  skipCustomerWhatsApp?: boolean;
}): Promise<CancelResult> {
  const orderId = String(opts.orderId || '').trim();
  const reason = String(opts.reason || 'Cancelled').slice(0, 200);
  if (!orderId) return { ok: false, error: 'orderId required', status: 400 };

  let client: any = null;
  try {
    client = await getDbClient();
    await client.query('BEGIN');

    const ord = await client.query(
      `SELECT id, order_number, user_id, order_status, payment_method, payment_status,
              shipping_address, coupon_id
       FROM orders WHERE order_number = $1 OR id = $1 LIMIT 1 FOR UPDATE`,
      [orderId]
    );
    if (!ord.rows.length) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Order not found', status: 404 };
    }

    const row = ord.rows[0];
    if (opts.userId && opts.actor === 'customer' && row.user_id !== opts.userId) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'You can only cancel your own orders.', status: 403 };
    }

    const status = String(row.order_status || '').toLowerCase();
    if (isOrderCancelled(status)) {
      await client.query('ROLLBACK');
      return { ok: true, orderNumber: row.order_number, duplicate: true };
    }

    if (opts.actor === 'customer') {
      if (BLOCKED_AFTER.some((s) => status.includes(s)) || status.includes('packed')) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          error: 'Order already packed or shipped. Contact support on WhatsApp to cancel.',
          status: 409,
        };
      }
    } else if (opts.actor === 'admin' && status.includes('delivered')) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Delivered orders cannot be cancelled.', status: 409 };
    }

    const items = await client.query(`SELECT book_id, quantity FROM order_items WHERE order_id = $1`, [
      row.id,
    ]);
    for (const item of items.rows) {
      await client.query(
        `UPDATE books
         SET stock = COALESCE(stock, 0) + $1,
             status = CASE WHEN COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
             updated_at = NOW()
         WHERE id = $2`,
        [Number(item.quantity) || 0, item.book_id]
      );
    }

    const payStatus = paymentStatusAfterCancel(row.payment_method);
    await client.query(
      `UPDATE orders
       SET order_status = 'Cancelled',
           payment_status = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, payStatus]
    );
    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks)
       VALUES ($1, $2, 'Cancelled', $3)`,
      [`tl-cancel-${Date.now()}`, row.id, reason]
    );

    if (row.coupon_id) {
      try {
        await client.query(
          `UPDATE coupons
           SET used_count = GREATEST(COALESCE(used_count, 0) - 1, 0)
           WHERE id = $1`,
          [row.coupon_id]
        );
        await client.query(`DELETE FROM coupon_redemptions WHERE order_id = $1 OR order_id = $2`, [
          row.id,
          row.order_number,
        ]);
      } catch (e: any) {
        console.warn('[cancel] coupon rollback skipped:', e?.message);
      }
    }

    await client.query('COMMIT');

    const { phone, name } = parseAddr(row.shipping_address);
    if (phone && !opts.skipCustomerWhatsApp) {
      const cancelReason =
        opts.actor === 'system'
          ? reason
          : opts.actor === 'whatsapp_no' || opts.actor === 'customer'
            ? 'requested'
            : opts.actor === 'admin'
              ? `admin: ${reason}`
              : reason;
      await notify('order.cancelled', {
        customerPhone: phone,
        customerName: name,
        orderId: row.order_number,
        cancelReason,
      });
    }

    const event = {
      type: 'ORDER_UPDATED',
      orderId: row.order_number,
      status: 'Cancelled',
      timestamp: Date.now(),
    };
    try {
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch {
      /* ignore */
    }

    return { ok: true, orderNumber: row.order_number };
  } catch (err: any) {
    try {
      await client?.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    return { ok: false, error: err?.message || 'Cancel failed', status: 500 };
  } finally {
    releaseDbClient(client);
  }
}
