/**
 * WhatsApp YES/NO order confirmation + admin alert phones + Admin AWB/CANCEL + Customer TRACK status commands.
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

  // Direct SQL search for phone number in shipping_address with awaiting/pending/placed confirmation
  const res = await queryDb(
    `SELECT id, order_number, order_status, total_amount, shipping_address, ordered_at
     FROM orders
     WHERE (order_status ILIKE '%awaiting%' OR order_status ILIKE '%pending%' OR order_status ILIKE '%placed%')
       AND (shipping_address ILIKE $1 OR shipping_address ILIKE $2)
     ORDER BY ordered_at DESC NULLS LAST
     LIMIT 1`,
    [`%${dig}%`, `%${dig.slice(0, 5)}%${dig.slice(5)}%`]
  );
  if (res.rows.length > 0) return res.rows[0];

  // Fallback: search last 50 orders of any awaiting confirmation status
  const fallback = await queryDb(
    `SELECT id, order_number, order_status, total_amount, shipping_address, ordered_at
     FROM orders
     ORDER BY ordered_at DESC NULLS LAST
     LIMIT 50`
  );
  for (const row of fallback.rows) {
    if (isAwaitingConfirmation(row.order_status)) {
      const addr = parseAddr(row.shipping_address);
      if (last10(addr.phone) === dig || last10(addr.alternatePhone || '') === dig) return row;
    }
  }
  return null;
}

export async function confirmAwaitingOrder(orderId: string): Promise<
  | { ok: true; orderNumber: string; already?: boolean }
  | { ok: false; error: string }
> {
  try {
    const ord = await queryDb(
      `SELECT id, order_number, order_status, total_amount, shipping_address, payment_method, items
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

    return { ok: true, orderNumber: row.order_number };
  } catch (err: any) {
    return { ok: false, error: err.message || 'Confirmation failed' };
  }
}

/** Customer WhatsApp command: "TRACK" or "STATUS" */
export async function handleCustomerTrackRequest(fromPhone: string, text: string) {
  const dig = last10(fromPhone);
  if (dig.length !== 10) return { handled: false as const };

  const trimmed = text.trim().toUpperCase();
  if (!['TRACK', 'STATUS', 'MY ORDER', 'TRACK ORDER', 'WHERE IS MY ORDER'].includes(trimmed)) {
    return { handled: false as const };
  }

  try {
    const res = await queryDb(
      `SELECT order_number, order_status, total_amount, awb_number, tracking_url, shipping_address, ordered_at
       FROM orders
       ORDER BY ordered_at DESC NULLS LAST
       LIMIT 40`
    );

    let matchRow: any = null;
    for (const row of res.rows) {
      const addr = parseAddr(row.shipping_address);
      if (last10(addr.phone) === dig || last10(addr.alternatePhone || '') === dig) {
        matchRow = row;
        break;
      }
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';
    if (!matchRow) {
      return {
        handled: true as const,
        message: `ℹ️ No active orders found for +91 ${dig}.\n\nBrowse & Order online: ${siteUrl}`,
      };
    }

    const awb = matchRow.awb_number ? `\n🚚 *AWB Docket:* ${matchRow.awb_number}` : '';
    const track = matchRow.tracking_url || `${siteUrl}/track?orderId=${matchRow.order_number}`;

    return {
      handled: true as const,
      message:
        `📦 *BLESSING POWER GUIDE ORDER STATUS*\n\n` +
        `Order ID: *${matchRow.order_number}*\n` +
        `Status: *${matchRow.order_status || 'Processing'}*${awb}\n` +
        `Amount: ₹${matchRow.total_amount}\n\n` +
        `👉 Live Track: ${track}`,
    };
  } catch (err: any) {
    return { handled: true as const, message: 'Could not fetch order status. Please try again.' };
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
      const refundNote = res.refunded
        ? ` Razorpay refund issued (${res.refundId || 'ok'}) — money returns to customer’s payment method.`
        : '';
      return {
        handled: true as const,
        message: `❌ Order #${res.orderNumber} cancelled by Admin. Stock restored.${refundNote} Customer notified on WhatsApp.`,
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
  // 1. Check if customer is asking for order tracking "TRACK" or "STATUS"
  const trackCmd = await handleCustomerTrackRequest(fromPhone, text);
  if (trackCmd.handled) {
    return { handled: true as const, answer: 'track_status', result: trackCmd };
  }

  // 2. Check if it's an Admin AWB or CANCEL command
  const adminCmd = await handleAdminAwbReply(fromPhone, text);
  if (adminCmd.handled) {
    return { handled: true as const, answer: 'admin_command', result: adminCmd };
  }

  // 3. Handle YES / NO confirmation reply
  const answer = parseYesNoReply(text);
  if (!answer) return { handled: false as const };

  const pending = await findAwaitingOrderByPhone(fromPhone);
  if (!pending) return { handled: false as const, reason: 'no_pending' as const };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

  if (answer === 'yes') {
    const r = await confirmAwaitingOrder(pending.order_number);
    const confirmMsg = (r as any).already
      ? `✅ Your Order #${pending.order_number} is ALREADY CONFIRMED and is being prepared for ST Courier dispatch! 🚚\n\nTrack status: ${siteUrl}/track?orderId=${pending.order_number}`
      : `✅ Thank you! Your Order #${pending.order_number} HAS BEEN CONFIRMED! 🚚\nWe are now packing your guides for ST Courier dispatch.\n\nTrack status: ${siteUrl}/track?orderId=${pending.order_number}`;
    return { handled: true as const, answer, result: { message: confirmMsg } };
  }

  // Customers cannot cancel — WhatsApp NO is a no-op for cancel (prepaid / final-sale policy).
  const noCancelMsg =
    `ℹ️ Customers cannot cancel orders from WhatsApp.\n\n` +
    `Order #${pending.order_number} stays active. For help, WhatsApp the shop — an admin may cancel and refund a paid Razorpay order if needed.\n\n` +
    `Track: ${siteUrl}/track?orderId=${pending.order_number}`;

  return { handled: true as const, answer, result: { message: noCancelMsg } };
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
        reason: `Auto-cancelled after ${maxAgeHours}h without WhatsApp confirmation`,
        actor: 'system',
      });
      if (r.ok && !r.duplicate) cancelled++;
    }
  } catch (_) {}
  return cancelled;
}
