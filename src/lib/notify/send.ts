import type { NotifyEvent, NotifyPayload, NotifyResult } from '@/lib/notify/types';
import { sendViaBaileys } from '@/lib/notify/transport/baileys';
import {
  adminLowStockMessage,
  adminOrderConfirmedMessage,
  confirmRequestMessage,
  confirmYesReplyMessage,
  orderCancelledMessage,
  orderDeliveredMessage,
  orderInTransitMessage,
  orderOfdMessage,
  orderPackedMessage,
  orderShippedMessage,
  paymentConfirmedMessage,
} from '@/lib/notify/templates';

/** Product default: WhatsApp disabled. Set DISABLE_WHATSAPP=false only to re-enable. */
export function isWhatsAppDisabled() {
  return process.env.DISABLE_WHATSAPP !== 'false';
}

function last10(phone: string) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

/** Default admin notify targets from env (settings list resolved by callers when needed). */
export function getEnvAdminNotifyPhones(): string[] {
  const raw =
    process.env.ADMIN_NOTIFY_PHONE ||
    process.env.ADMIN_PHONE ||
    '8248345770,9840418228';
  return [
    ...new Set(
      String(raw)
        .split(/[,;\s]+/)
        .map(last10)
        .filter((p) => p.length === 10)
    ),
  ];
}

function buildMessage(event: NotifyEvent, payload: NotifyPayload): string | null {
  const orderId = String(payload.orderId || '');
  const name = payload.customerName;

  switch (event) {
    case 'order.confirm_request':
      if (!orderId) return null;
      return confirmRequestMessage({
        customerName: name,
        orderId,
        totalAmount: payload.totalAmount ?? 0,
        bookTitle: payload.bookTitle || payload.itemsSummary,
      });
    case 'order.confirmed':
      if (!orderId) return null;
      return confirmYesReplyMessage({ customerName: name, orderId });
    case 'payment.confirmed':
      if (!orderId) return null;
      return paymentConfirmedMessage({
        customerName: name,
        orderId,
        totalAmount: payload.totalAmount ?? 0,
      });
    case 'order.packed':
      if (!orderId) return null;
      return orderPackedMessage({ customerName: name, orderId });
    case 'order.shipped':
      if (!orderId) return null;
      return orderShippedMessage({
        customerName: name,
        orderId,
        awbNumber: payload.awbNumber,
      });
    case 'order.ofd':
      if (!orderId) return null;
      return orderOfdMessage({
        customerName: name,
        orderId,
        awbNumber: payload.awbNumber,
      });
    case 'order.delivered':
      if (!orderId) return null;
      return orderDeliveredMessage({ customerName: name, orderId });
    case 'order.cancelled':
      if (!orderId) return null;
      return orderCancelledMessage({
        customerName: name,
        orderId,
        cancelReason: payload.cancelReason,
        refunded: !!payload.refunded,
        totalAmount: payload.totalAmount,
      });
    case 'admin.new_order':
      if (!orderId) return null;
      return adminOrderConfirmedMessage({
        orderId,
        customerName: name,
        customerPhone: payload.customerPhone,
        totalAmount: payload.totalAmount ?? 0,
        city: payload.city,
        paymentMethod: payload.paymentMethod,
        itemsSummary: payload.itemsSummary,
      });
    case 'admin.low_stock':
      if (!payload.title) return null;
      return adminLowStockMessage({
        title: String(payload.title),
        stockLeft: payload.stockLeft ?? 0,
        bookId: payload.bookId,
        orderId: payload.orderId,
      });
    default:
      return null;
  }
}

/** Map courier / timeline status labels to notify events (in-transit uses shipped-style template). */
export function statusToNotifyEvent(status: string): NotifyEvent | 'order.in_transit' | null {
  const s = String(status || '').toUpperCase().replace(/\s+/g, '_');
  if (s.includes('PACKED')) return 'order.packed';
  if (s.includes('HANDED') || s.includes('SHIPPED')) return 'order.shipped';
  if (s.includes('OUT_FOR_DELIVERY') || s.includes('OUT FOR DELIVERY') || s.includes('OFD')) {
    return 'order.ofd';
  }
  if (s.includes('DELIVERED')) return 'order.delivered';
  if (s.includes('IN_TRANSIT') || s.includes('IN TRANSIT')) return 'order.in_transit';
  if (s.includes('CANCEL')) return 'order.cancelled';
  return null;
}

async function sendToCustomer(phone: string | undefined, message: string) {
  if (!phone) return { ok: false as const, error: 'no customer phone' };
  return sendViaBaileys(phone, message);
}

async function sendToAdmins(phones: string[], message: string) {
  const seen = new Set<string>();
  let anyOk = false;
  let lastErr: string | undefined;
  for (const p of phones) {
    const d = last10(p);
    if (d.length !== 10 || seen.has(d)) continue;
    seen.add(d);
    const r = await sendViaBaileys(d, message);
    if (r.ok) anyOk = true;
    else lastErr = r.error;
  }
  if (seen.size === 0) return { ok: false as const, error: 'no admin phones' };
  return anyOk ? { ok: true as const } : { ok: false as const, error: lastErr || 'admin send failed' };
}

/**
 * Transactional notify entry. WhatsApp is product-disabled (no-op by default).
 */
export async function notify(
  event: NotifyEvent | 'order.in_transit',
  payload: NotifyPayload
): Promise<NotifyResult> {
  const resolvedEvent: NotifyEvent =
    event === 'order.in_transit' ? 'order.shipped' : event;

  if (isWhatsAppDisabled()) {
    return { ok: false, error: 'WhatsApp disabled', event: resolvedEvent };
  }

  let message: string | null = null;
  if (event === 'order.in_transit' && payload.orderId) {
    message = orderInTransitMessage({
      customerName: payload.customerName,
      orderId: String(payload.orderId),
      awbNumber: payload.awbNumber,
    });
  } else {
    message = buildMessage(resolvedEvent, payload);
  }

  if (!message) {
    return { ok: false, error: 'missing template fields', event: resolvedEvent };
  }

  if (resolvedEvent === 'admin.new_order' || resolvedEvent === 'admin.low_stock') {
    const phones =
      payload.adminPhones && payload.adminPhones.length > 0
        ? payload.adminPhones
        : getEnvAdminNotifyPhones();
    const r = await sendToAdmins(phones, message);
    return { ok: r.ok, error: r.ok ? undefined : r.error, event: resolvedEvent };
  }

  const r = await sendToCustomer(payload.customerPhone, message);
  return {
    ok: r.ok,
    queued: 'queued' in r ? r.queued : undefined,
    error: r.ok ? undefined : r.error,
    event: resolvedEvent,
  };
}

/** @deprecated Prefer notify(event, payload) — kept for gradual migration */
export async function notifyWhatsApp(to: string, message: string) {
  if (isWhatsAppDisabled()) {
    return { ok: false as const, queued: false, error: 'WhatsApp disabled' };
  }
  return sendViaBaileys(to, message);
}

export async function notifyWhatsAppMany(phones: string[], message: string) {
  if (isWhatsAppDisabled()) return;
  await sendToAdmins(phones, message);
}
