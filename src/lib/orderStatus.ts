/** Shared order status helpers — cancel, awaiting confirmation, AWB gates. */

export const AWAITING_CONFIRMATION = 'Awaiting Confirmation';
export const ORDER_PLACED = 'Order Placed';
export const ORDER_CANCELLED = 'Cancelled';

export function isOrderCancelled(status: string | null | undefined): boolean {
  return String(status || '').toLowerCase().includes('cancel');
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
 * Legacy COD → not collectible. Unpaid / no payment id → Cancelled.
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
