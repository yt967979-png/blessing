/** Shared order status helpers — cancel, awaiting confirmation, AWB gates. */

export const AWAITING_CONFIRMATION = 'Awaiting Confirmation';
export const ORDER_PLACED = 'Order Placed';
export const ORDER_CANCELLED = 'Cancelled';

export function isOrderCancelled(status: string | null | undefined): boolean {
  return String(status || '').toLowerCase().includes('cancel');
}

export function isAwaitingConfirmation(status: string | null | undefined): boolean {
  const s = String(status || '').toLowerCase();
  return s.includes('awaiting confirmation') || s.includes('awaiting_confirmation');
}

/** Pack / AWB / courier advances blocked until customer YES. */
export function blocksShippingActions(status: string | null | undefined): boolean {
  return isOrderCancelled(status) || isAwaitingConfirmation(status);
}

export function paymentStatusAfterCancel(paymentMethod: string | null | undefined): string {
  const m = String(paymentMethod || '').toLowerCase();
  if (m.includes('cod')) return 'Cancelled — COD not collectible';
  return 'Cancelled';
}

/** Normalize inbound WhatsApp reply to yes / no / null. */
export function parseYesNoReply(text: string): 'yes' | 'no' | null {
  const t = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return null;
  if (
    t === 'yes' ||
    t === 'y' ||
    t === '1' ||
    t === 'ok' ||
    t === 'okay' ||
    t === 'confirm' ||
    t === 'confirmed' ||
    t.startsWith('yes ')
  ) {
    return 'yes';
  }
  if (
    t === 'no' ||
    t === 'n' ||
    t === '2' ||
    t === 'cancel' ||
    t === 'cancelled' ||
    t === 'canceled' ||
    t.startsWith('no ')
  ) {
    return 'no';
  }
  return null;
}
