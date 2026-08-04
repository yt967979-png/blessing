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
