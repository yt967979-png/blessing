/**
 * Shared cancel execution — used by API, WhatsApp NO, Admin CANCEL command, and 24h timeout.
 */
import { queryDb } from '@/lib/db';
import { paymentStatusAfterCancel, isOrderCancelled } from '@/lib/orderStatus';
import { broadcastOrderChange, notifyOrderChanged } from '@/app/api/orders/stream/route';
import { notify } from '@/lib/notify/send';
import { getAdminAlertPhones } from '@/lib/orderConfirm';

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

  try {
    const ord = await queryDb(
      `SELECT id, order_number, user_id, order_status, payment_method, payment_status,
              shipping_address, coupon_id
       FROM orders WHERE order_number = $1 OR id = $1 LIMIT 1`,
      [orderId]
    );
    if (!ord.rows.length) {
      return { ok: false, error: 'Order not found', status: 404 };
    }

    const row = ord.rows[0];
    if (opts.userId && opts.actor === 'customer' && row.user_id !== opts.userId) {
      return { ok: false, error: 'You can only cancel your own orders.', status: 403 };
    }

    const status = String(row.order_status || '').toLowerCase();
    if (isOrderCancelled(status)) {
      return { ok: true, orderNumber: row.order_number, duplicate: true };
    }

    if (opts.actor === 'customer') {
      if (BLOCKED_AFTER.some((s) => status.includes(s)) || status.includes('packed')) {
        return {
          ok: false,
          error: 'Order already packed or shipped. Contact support on WhatsApp to cancel.',
          status: 409,
        };
      }
    } else if (opts.actor === 'admin' && status.includes('delivered')) {
      return { ok: false, error: 'Delivered orders cannot be cancelled.', status: 409 };
    }

    const items = await queryDb(`SELECT book_id, quantity FROM order_items WHERE order_id = $1`, [
      row.id,
    ]);
    for (const item of items.rows) {
      await queryDb(
        `UPDATE books
         SET stock = COALESCE(stock, 0) + $1,
             status = CASE WHEN COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
             updated_at = NOW()
         WHERE id = $2`,
        [Number(item.quantity) || 0, item.book_id]
      );
    }

    const payStatus = paymentStatusAfterCancel(row.payment_method);
    await queryDb(
      `UPDATE orders
       SET order_status = 'Cancelled',
           payment_status = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [row.id, payStatus]
    );
    await queryDb(
      `INSERT INTO order_timeline (id, order_id, status, remarks)
       VALUES ($1, $2, 'Cancelled', $3)`,
      [`tl-cancel-${Date.now()}`, row.id, reason]
    );

    if (row.coupon_id) {
      try {
        await queryDb(
          `UPDATE coupons
           SET used_count = GREATEST(COALESCE(used_count, 0) - 1, 0)
           WHERE id = $1`,
          [row.coupon_id]
        );
        await queryDb(`DELETE FROM coupon_redemptions WHERE order_id = $1 OR order_id = $2`, [
          row.id,
          row.order_number,
        ]);
      } catch (e: any) {
        console.warn('[cancel] coupon rollback skipped:', e?.message);
      }
    }

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

    // Always notify Admin alert phones when an order is cancelled!
    try {
      const admins = await getAdminAlertPhones();
      if (admins.length > 0) {
        await notify('admin.low_stock', {
          adminPhones: admins,
          title: `❌ ORDER CANCELLED: #${row.order_number}`,
          stockLeft: `Reason: ${reason} (Customer: ${name})`,
        });
      }
    } catch (_) {}

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
    return { ok: false, error: err?.message || 'Cancel failed', status: 500 };
  }
}
