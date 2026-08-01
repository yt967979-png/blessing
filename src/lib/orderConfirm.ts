/**
 * WhatsApp YES/NO order confirmation + admin alert phones + Admin AWB / CANCEL reply commands.
 */
import { queryDb } from '@/lib/db';
import {
  AWAITING_CONFIRMATION,
  ORDER_PLACED,
  isAwaitingConfirmation,
  parseYesNoReply,
} from '@/lib/orderStatus';
import { executeOrderCancel } from '@/lib/orderCancel';
import { notify } from '@/lib/notify/send';
import { broadcastOrderChange, notifyOrderChanged } from '@/app/api/orders/stream/route';

function last10(phone: string) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function parseAddr(raw: unknown): {
  phone: string;
  alternatePhone?: string;
  name: string;
  city?: string;
} {
  try {
    const addr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      phone: String((addr as any)?.phone || ''),
      alternatePhone: String((addr as any)?.alternatePhone || (addr as any)?.altPhone || ''),
      name: String((addr as any)?.name || 'Student'),
      city: String((addr as any)?.city || (addr as any)?.district || ''),
    };
  } catch {
    return { phone: '', name: 'Student' };
  }
}

/** Phones saved in Admin UI (settings.admin_alert_phones only). */
export async function getStoredAdminAlertPhones(): Promise<string[]> {
  try {
    const res = await queryDb(
      `SELECT admin_alert_phones FROM settings WHERE id = 'main' LIMIT 1`
    );
    const raw = String(res.rows[0]?.admin_alert_phones || '');
    return [
      ...new Set(
        raw
          .split(/[,;\s]+/)
          .map(last10)
          .filter((p) => p.length === 10)
      ),
    ];
  } catch {
    return [];
  }
}

/**
 * Phones that get "order confirmed" WhatsApp.
 * Uses saved alert phones; if none saved, falls back to ADMIN_PHONE.
 */
export async function getAdminAlertPhones(): Promise<string[]> {
  const stored = await getStoredAdminAlertPhones();
  if (stored.length > 0) return stored;

  const envPhone = last10(
    process.env.ADMIN_NOTIFY_PHONE || process.env.ADMIN_PHONE || '9840418228'
  );
  return envPhone.length === 10 ? [envPhone] : [];
}

export async function setAdminAlertPhones(raw: string): Promise<string[]> {
  const cleaned = String(raw || '')
    .split(/[,;\n]+/)
    .map(last10)
    .filter((p) => p.length === 10);
  const unique = [...new Set(cleaned)];
  const value = unique.join(',');

  try {
    await queryDb(
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_alert_phones TEXT DEFAULT ''`
    );
    await queryDb(
      `INSERT INTO settings (id, admin_alert_phones)
       VALUES ('main', $1)
       ON CONFLICT (id) DO UPDATE SET admin_alert_phones = EXCLUDED.admin_alert_phones`,
      [value]
    );
  } catch (_) {}
  return unique;
}

export async function findAwaitingOrderByPhone(phone: string) {
  const dig = last10(phone);
  if (dig.length !== 10) return null;

  const res = await queryDb(
    `SELECT id, order_number, order_status, total_amount, shipping_address, ordered_at
     FROM orders
     WHERE order_status ILIKE '%Awaiting Confirmation%'
     ORDER BY ordered_at DESC NULLS LAST
     LIMIT 40`
  );
  for (const row of res.rows) {
    const addr = parseAddr(row.shipping_address);
    if (last10(addr.phone) === dig || last10(addr.alternatePhone || '') === dig) return row;
  }
  return null;
}

export async function confirmAwaitingOrder(orderId: string): Promise<
  | { ok: true; orderNumber: string; already?: boolean }
  | { ok: false; error: string }
> {
  try {
    const ord = await queryDb(
      `SELECT id, order_number, order_status, total_amount, shipping_address, payment_method
       FROM orders WHERE order_number = $1 OR id = $1 LIMIT 1`,
      [orderId]
    );
    if (!ord.rows.length) {
      return { ok: false, error: 'Order not found' };
    }

    const row = ord.rows[0];
    if (!isAwaitingConfirmation(row.order_status)) {
      if (String(row.order_status || '').toLowerCase().includes('cancel')) {
        return { ok: false, error: 'Order already cancelled' };
      }
      return { ok: true, orderNumber: row.order_number, already: true };
    }

    await queryDb(
      `UPDATE orders SET order_status = $2, updated_at = NOW() WHERE id = $1`,
      [row.id, ORDER_PLACED]
    );
    await queryDb(
      `INSERT INTO order_timeline (id, order_id, status, remarks)
       VALUES ($1, $2, $3, $4)`,
      [
        `tl-confirm-${Date.now()}`,
        row.id,
        ORDER_PLACED,
        'Customer confirmed via WhatsApp YES',
      ]
    );

    const { phone, name, city } = parseAddr(row.shipping_address);

    if (phone) {
      await notify('order.confirmed', {
        customerPhone: phone,
        customerName: name,
        orderId: row.order_number,
      });
    }

    const admins = await getAdminAlertPhones();
    await notify('admin.new_order', {
      orderId: row.order_number,
      customerName: name,
      customerPhone: phone,
      totalAmount: row.total_amount,
      city,
      paymentMethod: row.payment_method,
      adminPhones: admins,
    });

    const event = {
      type: 'ORDER_UPDATED',
      orderId: row.order_number,
      status: ORDER_PLACED,
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
    return { ok: false, error: err?.message || 'Confirm failed' };
  }
}

/** Admin WhatsApp reply command: "AWB STC123456" or "CANCEL BPG-12345" */
export async function handleAdminAwbReply(fromPhone: string, text: string) {
  const admins = await getAdminAlertPhones();
  const isAdmin = admins.includes(last10(fromPhone));
  if (!isAdmin) return { handled: false as const };

  const trimmed = text.trim();

  // Match Admin CANCEL command: "CANCEL BPG-12345" or "CANCEL 12345"
  const cancelMatch = trimmed.match(/^CANCEL\s+(BPG-\w+|\w+)/i);
  if (cancelMatch) {
    const cancelOrderId = cancelMatch[1];
    const res = await executeOrderCancel({
      orderId: cancelOrderId,
      reason: 'Cancelled by Admin via WhatsApp',
      actor: 'admin',
      skipCustomerWhatsApp: false,
    });
    if (res.ok) {
      return {
        handled: true as const,
        message: `❌ Order #${res.orderNumber} has been cancelled by Admin. Stock restored and customer notified on WhatsApp!`,
      };
    }
    return { handled: true as const, message: `Failed to cancel order: ${res.error}` };
  }

  // Match patterns like "AWB BPG-12345 STC999888", "AWB STC999888", or "STC999888"
  const awbMatch = trimmed.match(/(?:AWB\s+)?(?:(BPG-\w+)\s+)?(STC\w+|\d{6,14})/i);
  if (!awbMatch) return { handled: false as const };

  const targetOrderId = awbMatch[1];
  const awbNumber = awbMatch[2].toUpperCase();

  try {
    let orderRow: any = null;
    if (targetOrderId) {
      const res = await queryDb(
        `SELECT id, order_number, shipping_address FROM orders WHERE order_number ILIKE $1 OR id = $1 LIMIT 1`,
        [targetOrderId]
      );
      orderRow = res.rows[0];
    } else {
      // Latest unfulfilled placed order
      const res = await queryDb(
        `SELECT id, order_number, shipping_address FROM orders 
         WHERE order_status ILIKE '%Placed%' OR order_status ILIKE '%Packed%'
         ORDER BY ordered_at DESC LIMIT 1`
      );
      orderRow = res.rows[0];
    }

    if (!orderRow) {
      return { handled: true as const, message: 'No matching order found for AWB update.' };
    }

    const isOfficial = awbNumber.startsWith('STC') || !awbNumber.startsWith('SHP-');
    const trackingUrl = isOfficial
      ? `https://stcourier.com/track/shipment?docket=${awbNumber}`
      : 'https://stcourier.com';

    await queryDb(
      `UPDATE orders SET order_status = 'In Transit', awb_number = $1, tracking_url = $2, shipped_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [awbNumber, trackingUrl, orderRow.id]
    );

    const { phone: custPhone, name: custName } = parseAddr(orderRow.shipping_address);
    if (custPhone) {
      await notify('order.shipped', {
        customerPhone: custPhone,
        customerName: custName,
        orderId: orderRow.order_number,
        awbNumber,
        trackingUrl,
      });
    }

    return {
      handled: true as const,
      message: `✅ Order #${orderRow.order_number} updated to In Transit with AWB ${awbNumber}. Customer notified on WhatsApp!`,
    };
  } catch (err: any) {
    return { handled: true as const, message: `Failed to update AWB: ${err.message}` };
  }
}

/** Handle inbound WhatsApp text from customer OR admin. */
export async function handleInboundYesNo(fromPhone: string, text: string) {
  // First check if it's an Admin AWB or CANCEL command
  const adminCmd = await handleAdminAwbReply(fromPhone, text);
  if (adminCmd.handled) {
    return { handled: true as const, answer: 'admin_command', result: adminCmd };
  }

  const answer = parseYesNoReply(text);
  if (!answer) return { handled: false as const };

  const pending = await findAwaitingOrderByPhone(fromPhone);
  if (!pending) return { handled: false as const, reason: 'no_pending' as const };

  if (answer === 'yes') {
    const r = await confirmAwaitingOrder(pending.order_number);
    return { handled: true as const, answer, result: r };
  }

  const r = await executeOrderCancel({
    orderId: pending.order_number,
    reason: 'Customer replied NO on WhatsApp',
    actor: 'whatsapp_no',
    skipCustomerWhatsApp: false,
  });
  return { handled: true as const, answer, result: r };
}

/** Auto-cancel awaiting orders older than 24h. */
export async function expireAwaitingConfirmations(maxAgeHours = 24) {
  let cancelled = 0;
  try {
    const res = await queryDb(
      `SELECT order_number FROM orders
       WHERE order_status ILIKE '%Awaiting Confirmation%'
       AND COALESCE(ordered_at, updated_at, NOW()) < NOW() - ($1::int * INTERVAL '1 hour')
       ORDER BY COALESCE(ordered_at, updated_at) ASC
       LIMIT 20`,
      [maxAgeHours]
    );
    for (const row of res.rows) {
      const r = await executeOrderCancel({
        orderId: row.order_number,
        reason: 'No YES within 24h — auto-cancelled',
        actor: 'system',
      });
      if (r.ok && !r.duplicate) cancelled += 1;
    }
  } catch (e: any) {
    console.warn('[confirm-timeout]', e?.message || e);
  }
  return cancelled;
}

export { AWAITING_CONFIRMATION, ORDER_PLACED };
