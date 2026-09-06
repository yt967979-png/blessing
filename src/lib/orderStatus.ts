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
