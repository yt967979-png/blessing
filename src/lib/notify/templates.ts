/** WhatsApp transactional templates — Baileys text now; Meta templates later. */

const siteBase = () =>
  (process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.in').replace(/\/$/, '');

export function trackUrl(orderId: string) {
  return `${siteBase()}/track?orderId=${encodeURIComponent(orderId)}`;
}

export function confirmRequestMessage(opts: {
  customerName?: string;
  orderId: string;
  totalAmount: number | string;
  bookTitle?: string;
}) {
  // Legacy event name — prepaid Razorpay flow confirms on payment; no YES/NO gate.
  const name = opts.customerName || 'Student';
  const book = opts.bookTitle || 'Blessing Power Guide';
  return (
    `*BLESSING POWER GUIDE*\n*✅ ORDER CONFIRMED*\n\n` +
    `Dear *${name}*,\n` +
    `Your order is confirmed and paid online.\n\n` +
    `📦 *Order ID:* ${opts.orderId}\n` +
    `📖 *Books:* ${book}\n` +
    `💰 *Total:* ₹${opts.totalAmount}\n\n` +
    `We will pack and ship via ST Courier soon.\n` +
    `👉 Track: ${trackUrl(opts.orderId)}`
  );
}

export function confirmYesReplyMessage(opts: {
  customerName?: string;
  orderId: string;
}) {
  const name = opts.customerName || 'Student';
  return (
    `*BLESSING POWER GUIDE*\n*✅ ORDER CONFIRMED*\n\n` +
    `Dear *${name}*,\n` +
    `Thank you! Your order *${opts.orderId}* is confirmed. We will pack and ship soon.\n\n` +
    `👉 Track: ${trackUrl(opts.orderId)}`
  );
}

export function confirmNoReplyMessage(opts: {
  customerName?: string;
  orderId: string;
}) {
  const name = opts.customerName || 'Student';
  // Legacy helper — customers can no longer cancel via WhatsApp NO.
  return (
    `*BLESSING POWER GUIDE*\n\n` +
    `Dear *${name}*,\n` +
    `Customers cannot cancel orders from WhatsApp. Order *${opts.orderId}* stays active unless the shop cancels it.\n\n` +
    `Track / help:\n${siteBase()}`
  );
}

export function orderCancelledMessage(opts: {
  customerName?: string;
  orderId: string;
  cancelReason?: string;
  refunded?: boolean;
  totalAmount?: number | string;
}) {
  const name = opts.customerName || 'Student';
  const reason = String(opts.cancelReason || '').toLowerCase();
  let body =
    `Your order *${opts.orderId}* has been cancelled by the shop. Stock is restored — you can order again anytime.`;
  if (reason.includes('24h') || reason.includes('expired') || reason.includes('timeout')) {
    body =
      `Your order *${opts.orderId}* was cancelled automatically after no confirmation within 24 hours. Stock is restored.`;
  } else if (reason.includes('admin')) {
    body = `Your order *${opts.orderId}* was cancelled by the shop. Stock is restored.`;
  }
  // Never claim the customer cancelled — customers cannot cancel prepaid orders.
  const amount =
    opts.totalAmount != null && opts.totalAmount !== ''
      ? `₹${opts.totalAmount}`
      : 'your payment';
  const refundLine = opts.refunded
    ? `\n\n💰 *Refund:* ${amount} will return to your original payment method (Razorpay UPI / card / netbanking). Banks usually take 5–7 working days.`
    : '';
  return (
    `*BLESSING POWER GUIDE*\n*❌ ORDER CANCELLED*\n\n` +
    `Dear *${name}*,\n` +
    `${body}` +
    `${refundLine}\n\n` +
    `Order again:\n${siteBase()}`
  );
}

export function paymentConfirmedMessage(opts: {
  customerName?: string;
  orderId: string;
  totalAmount: number | string;
}) {
  const name = opts.customerName || 'Student';
  return (
    `*BLESSING POWER GUIDE*\n*✅ ORDER CONFIRMED — PAID ONLINE*\n\n` +
    `Dear *${name}*,\n` +
    `Payment of *₹${opts.totalAmount}* for order *${opts.orderId}* is verified.\n` +
    `Your order is confirmed. We will pack and ship via ST Courier soon.\n\n` +
    `👉 Track: ${trackUrl(opts.orderId)}`
  );
}

export function orderPackedMessage(opts: {
  customerName?: string;
  orderId: string;
}) {
  const name = opts.customerName || 'Student';
  return (
    `*BLESSING POWER GUIDE*\n*📦 ORDER PACKED & SEALED*\n\n` +
    `Dear *${name}*,\n` +
    `Your books for *${opts.orderId}* have been packed and sealed for shipment.\n\n` +
    `👉 Track: ${trackUrl(opts.orderId)}`
  );
}

export function orderShippedMessage(opts: {
  customerName?: string;
  orderId: string;
  awbNumber?: string;
}) {
  const name = opts.customerName || 'Student';
  const awb = opts.awbNumber ? `\n📍 *Docket AWB:* ${opts.awbNumber}` : '';
  return (
    `*BLESSING POWER GUIDE*\n*🚚 HANDED TO ST COURIER*\n\n` +
    `Dear *${name}*,\n` +
    `Your order *${opts.orderId}* has been handed to ST Courier Express.${awb}\n\n` +
    `👉 Track: ${trackUrl(opts.orderId)}`
  );
}

export function orderOfdMessage(opts: {
  customerName?: string;
  orderId: string;
  awbNumber?: string;
}) {
  const name = opts.customerName || 'Student';
  const awb = opts.awbNumber ? `\n📍 *Docket:* ${opts.awbNumber}` : '';
  return (
    `*BLESSING POWER GUIDE*\n*🛵 OUT FOR DELIVERY TODAY*\n\n` +
    `Dear *${name}*,\n` +
    `ST Courier is out to deliver *${opts.orderId}* today. Please be available.${awb}\n\n` +
    `👉 Track: ${trackUrl(opts.orderId)}`
  );
}

export function orderDeliveredMessage(opts: {
  customerName?: string;
  orderId: string;
}) {
  const name = opts.customerName || 'Student';
  return (
    `*BLESSING POWER GUIDE*\n*✅ ORDER DELIVERED*\n\n` +
    `Dear *${name}*,\n` +
    `Your order *${opts.orderId}* was delivered. Thank you for choosing Blessing Power Guide!\n\n` +
    `👉 Track: ${trackUrl(opts.orderId)}`
  );
}

export function orderInTransitMessage(opts: {
  customerName?: string;
  orderId: string;
  awbNumber?: string;
}) {
  const name = opts.customerName || 'Student';
  const awb = opts.awbNumber ? `\n📍 *Docket:* ${opts.awbNumber}` : '';
  return (
    `*BLESSING POWER GUIDE*\n*⚡ PARCEL IN TRANSIT*\n\n` +
    `Dear *${name}*,\n` +
    `Your order *${opts.orderId}* is moving between ST Courier hubs towards your city.${awb}\n\n` +
    `👉 Track: ${trackUrl(opts.orderId)}`
  );
}

export function adminOrderConfirmedMessage(opts: {
  orderId: string;
  customerName?: string;
  customerPhone?: string;
  totalAmount: number | string;
  city?: string;
  paymentMethod?: string;
  itemsSummary?: string;
}) {
  const pay = opts.paymentMethod ? `\n💳 ${opts.paymentMethod}` : '';
  const items = opts.itemsSummary ? `\n📖 ${opts.itemsSummary}` : '';
  return (
    `*BLESSING POWER GUIDE*\n*🛒 ORDER RECEIVED (CONFIRMED)*\n\n` +
    `📦 *${opts.orderId}*\n` +
    `👤 ${opts.customerName || 'Customer'}\n` +
    `📞 ${opts.customerPhone || '—'}\n` +
    `📍 ${opts.city || '—'}\n` +
    `💰 ₹${opts.totalAmount}${pay}${items}\n\n` +
    `Open Admin → Orders to add ST Courier AWB or cancel.`
  );
}

export function adminLowStockMessage(opts: {
  title: string;
  stockLeft: number | string;
  bookId?: string;
  orderId?: string;
}) {
  const ord = opts.orderId ? `\nOrder: ${opts.orderId}` : '';
  const id = opts.bookId ? `\nID: ${opts.bookId}` : '';
  return (
    `*BLESSING POWER GUIDE*\n*LOW STOCK*\n\n` +
    `${opts.title}\n` +
    `Remaining: *${opts.stockLeft}*${id}${ord}`
  );
}
