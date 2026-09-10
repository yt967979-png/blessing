/** Shared order status helpers — cancel, awaiting confirmation, AWB gates. */

export const AWAITING_CONFIRMATION = 'Awaiting Confirmation';
export const ORDER_PLACED = 'Order Placed';
export const ORDER_CANCELLED = 'Cancelled';

export function isOrderCancelled(status: string | null | undefined): boolean {
  return String(status || '').toLowerCase().includes('cancel');
}

/** Mapped order rows from GET /api/orders (admin + customer). */
export type OrderStatusLike = {
  isCancelled?: boolean;
  order_status?: string | null;
  orderStatus?: string | null;
  status?: string | null;
  courierStatus?: string | null;
  paymentStatus?: string | null;
};

/** True if any status field (or API flag) says the order is cancelled. */
export function isRecordCancelled(order: OrderStatusLike | null | undefined): boolean {
  if (!order) return false;
  if (order.isCancelled === true) return true;
  return (
    isOrderCancelled(order.order_status) ||
    isOrderCancelled(order.orderStatus) ||
    isOrderCancelled(order.status) ||
    isOrderCancelled(order.courierStatus) ||
    isOrderCancelled(order.paymentStatus)
  );
}

/** Label for packing stamps — cancelled wins over courier/payment lag. */
export function fulfillmentStatus(order: OrderStatusLike | null | undefined): string {
  if (!order) return '';
  if (isRecordCancelled(order)) {
    const labelled = [
      order.order_status,
      order.orderStatus,
      order.status,
      order.courierStatus,
      order.paymentStatus,
    ]
      .map((s) => String(s || ''))
      .find((s) => isOrderCancelled(s));
    return labelled || 'Cancelled';
  }
  return String(
    order.courierStatus || order.status || order.orderStatus || order.order_status || ''
  );
}

export function isAwaitingConfirmation(status: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase();
  return s.includes('awaiting confirmation') || s.includes('awaiting_confirmation') || s.includes('awaiting');
}

/** Pack / AWB / courier advances blocked for cancelled or legacy awaiting rows. */
export function blocksShippingActions(status: string | null | undefined): boolean {
  return isOrderCancelled(status) || isAwaitingConfirmation(status);
}

/**
 * payment_status after cancel.
 * Paid Razorpay admin-cancel → Refunded (money returned via Razorpay).
 * Unpaid / no payment id → Cancelled.
 * Legacy COD rows (if any ever existed) → not collectible.
 */
export function paymentStatusAfterCancel(
  paymentMethod: string | null | undefined,
  opts?: { refunded?: boolean }
): string {
  if (opts?.refunded) return 'Refunded';
  const m = String(paymentMethod || '').toLowerCase();
  if (m.includes('cod')) return 'Cancelled — COD not collectible';
  return 'Cancelled';
}

export function isPaymentRefunded(paymentStatus: string | null | undefined): boolean {
  return String(paymentStatus || '').toLowerCase().includes('refund');
}

/** True only when the parcel was handed to the customer — not a failed attempt or RTO. */
export function isParcelDelivered(status: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase();
  if (!s) return false;
  if (s.includes('attempt') || s.includes('undeliver') || s.includes('fail') || s.includes('rto')) {
    return false;
  }
  return s.includes('delivered') || s === 'dlv';
}

export function isDeliveryAttempted(status: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase();
  if (s.includes('rto')) return false;
  return (
    s.includes('attempt') ||
    s.includes('undeliver') ||
    s.includes('not delivered') ||
    (s.includes('deliver') && s.includes('fail'))
  );
}

export function isRtoStatus(status: string | null | undefined): boolean {
  return String(status || '').toLowerCase().includes('rto');
}

export function classifyCourierActivity(
  text: string | null | undefined
): 'delivered' | 'attempted' | 'ofd' | 'rto' | 'transit' | 'other' {
  const s = String(text || '').toLowerCase();
  if (!s) return 'other';
  if (s.includes('rto')) return 'rto';
  if (
    s.includes('attempt') ||
    s.includes('undeliver') ||
    s.includes('not delivered') ||
    s.includes('not home') ||
    s.includes('consignee not') ||
    (s.includes('deliver') && s.includes('fail'))
  ) {
    return 'attempted';
  }
  if (s.includes('delivered') || s === 'dlv') return 'delivered';
  if (s.includes('out for delivery') || s.includes('ofd') || s.includes('reattempt') || s.includes('re-attempt')) {
    return 'ofd';
  }
  if (s.includes('transit') || s.includes('hub') || s.includes('dispatched')) return 'transit';
  return 'other';
}

/**
 * Admin Orders / Overview buckets. Last-mile (OFD, missed delivery, RTO)
 * stays under In Transit — never Unpacked and never Delivered.
 */
export type AdminFulfillmentBucket = 'cancelled' | 'pending' | 'packed' | 'dispatched' | 'delivered';

export function adminFulfillmentBucket(order: OrderStatusLike | null | undefined): AdminFulfillmentBucket {
  if (!order || isRecordCancelled(order)) return 'cancelled';
  const status = fulfillmentStatus(order);
  const s = String(status || '').toLowerCase();
  const kind = classifyCourierActivity(status);
  if (kind === 'delivered' || isParcelDelivered(status)) return 'delivered';
  if (
    kind === 'ofd' ||
    kind === 'attempted' ||
    kind === 'rto' ||
    kind === 'transit' ||
    s.includes('handed') ||
    s.includes('out for delivery') ||
    s.includes('dispatched')
  ) {
    return 'dispatched';
  }
  if (s.includes('pack')) return 'packed';
  return 'pending';
}

/** Customer-facing headline that matches ST last-mile, not a fake GPS label. */
export function customerCourierHeadline(status: string | null | undefined): string {
  const raw = String(status || '').trim();
  if (!raw) return 'With ST Courier';
  if (isRtoStatus(raw)) return 'Returning to shop (RTO)';
  if (isDeliveryAttempted(raw)) return 'Delivery attempted — ST will retry';
  if (isParcelDelivered(raw)) return 'Delivered';
  if (raw.toLowerCase().includes('out for delivery')) return 'Out for Delivery';
  return raw;
}

/**
 * Customer-facing refund stages after admin cancel.
 * Razorpay "processed" ≠ money already in bank — bank credit is usually 5–7 working days.
 */
export function customerRefundStage(opts: {
  orderCancelled: boolean;
  paymentStatus?: string | null;
  razorpayRefundId?: string | null;
}): {
  stage: 'none' | 'initiated' | 'processing' | 'successful';
  label: string;
  detail: string;
} {
  if (!opts.orderCancelled) {
    return { stage: 'none', label: '', detail: '' };
  }
  const refunded = isPaymentRefunded(opts.paymentStatus) || Boolean(String(opts.razorpayRefundId || '').trim());
  if (!refunded) {
    return {
      stage: 'none',
      label: 'No refund due',
      detail: 'This cancelled order did not have a successful online payment to refund.',
    };
  }
  const id = String(opts.razorpayRefundId || '').trim();
  if (id.startsWith('ref_manual') || id.startsWith('rfp_not_found')) {
    return {
      stage: 'processing',
      label: 'Refund processing',
      detail: 'Refund is being completed. Contact the shop with your order number if money is not returned in 5–7 working days.',
    };
  }
  // Razorpay accepted the refund — show success on gateway side; bank lag is normal.
  return {
    stage: 'successful',
    label: 'Refund successful (Razorpay)',
    detail:
      'Razorpay has accepted the full refund to your original UPI/card/bank. Banks usually show the credit in 5–7 working days (sometimes sooner).',
  };
}

/**
 * Structured JSON logging for all order state transitions (makes cloud log filtering trivial).
 */
export function logOrderStateTransition(opts: {
  orderNumber: string;
  fromStatus?: string | null;
  toStatus: string;
  actor: 'customer' | 'admin' | 'system' | 'courier_webhook';
  amount?: number;
  details?: Record<string, any>;
}): void {
  const payload = {
    level: 'info',
    event: 'ORDER_STATE_TRANSITION',
    orderNumber: opts.orderNumber,
    fromStatus: opts.fromStatus || 'none',
    toStatus: opts.toStatus,
    actor: opts.actor,
    amount: opts.amount,
    details: opts.details || {},
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(payload));
}
