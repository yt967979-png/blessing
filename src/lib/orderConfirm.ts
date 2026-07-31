/**
 * WhatsApp YES/NO order confirmation + admin alert phones.
 */
import { getDbClient, releaseDbClient, queryDb } from '@/lib/db';
import {
  AWAITING_CONFIRMATION,
  ORDER_PLACED,
  isAwaitingConfirmation,
  parseYesNoReply,
} from '@/lib/orderStatus';
import { executeOrderCancel } from '@/lib/orderCancel';
import {
  adminOrderConfirmedMessage,
  confirmYesReplyMessage,
} from '@/lib/notify/templates';
import { notifyWhatsApp, notifyWhatsAppMany } from '@/lib/notify/send';
import { broadcastOrderChange, notifyOrderChanged } from '@/app/api/orders/stream/route';

function last10(phone: string) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

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

  const envPhone = last10(process.env.ADMIN_PHONE || '9840418228');
  return envPhone.length === 10 ? [envPhone] : [];
}

export async function setAdminAlertPhones(raw: string): Promise<string[]> {
  const cleaned = String(raw || '')
    .split(/[,;\n]+/)
    .map(last10)
    .filter((p) => p.length === 10);
  const unique = [...new Set(cleaned)];
  const value = unique.join(',');

  const client = await getDbClient();
  try {
    await client.query(
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_alert_phones TEXT DEFAULT ''`
    );
    await client.query(
      `INSERT INTO settings (id, admin_alert_phones)
       VALUES ('main', $1)
       ON CONFLICT (id) DO UPDATE SET admin_alert_phones = EXCLUDED.admin_alert_phones`,
      [value]
    );
  } finally {
    releaseDbClient(client);
  }
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
    if (last10(addr.phone) === dig) return row;
  }
  return null;
}

export async function confirmAwaitingOrder(orderId: string): Promise<
  | { ok: true; orderNumber: string; already?: boolean }
  | { ok: false; error: string }
> {
  let client: any = null;
  try {
    client = await getDbClient();
    await client.query('BEGIN');

    const ord = await client.query(
      `SELECT id, order_number, order_status, total_amount, shipping_address
       FROM orders WHERE order_number = $1 OR id = $1 LIMIT 1 FOR UPDATE`,
      [orderId]
    );
    if (!ord.rows.length) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Order not found' };
    }

    const row = ord.rows[0];
    if (!isAwaitingConfirmation(row.order_status)) {
      await client.query('ROLLBACK');
      if (String(row.order_status || '').toLowerCase().includes('cancel')) {
        return { ok: false, error: 'Order already cancelled' };
      }
      return { ok: true, orderNumber: row.order_number, already: true };
    }

    await client.query(
      `UPDATE orders SET order_status = $2, updated_at = NOW() WHERE id = $1`,
      [row.id, ORDER_PLACED]
    );
    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks)
       VALUES ($1, $2, $3, $4)`,
      [
        `tl-confirm-${Date.now()}`,
        row.id,
        ORDER_PLACED,
        'Customer confirmed via WhatsApp YES',
      ]
    );
    await client.query('COMMIT');

    const { phone, name, city } = parseAddr(row.shipping_address);

    if (phone) {
      await notifyWhatsApp(
        phone,
        confirmYesReplyMessage({ customerName: name, orderId: row.order_number })
      );
    }

    const adminMsg = adminOrderConfirmedMessage({
      orderId: row.order_number,
      customerName: name,
      customerPhone: phone,
      totalAmount: row.total_amount,
      city,
    });
    const admins = await getAdminAlertPhones();
    await notifyWhatsAppMany(admins, adminMsg);

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
    try {
      await client?.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    return { ok: false, error: err?.message || 'Confirm failed' };
  } finally {
    releaseDbClient(client);
  }
}

/** Handle inbound WhatsApp text from a customer phone. */
export async function handleInboundYesNo(fromPhone: string, text: string) {
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
