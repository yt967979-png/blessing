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
  const raw = String(text || '').trim();
  const t = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t && !raw) return null;

  // Tamil & Multilingual YES variations
  if (raw.includes('ஆம்') || raw.includes('சரி') || raw.includes('ஆமாம்')) {
    return 'yes';
  }

  if (
    t === 'yes' ||
    t === 'y' ||
    t === 'ha' ||
    t === '1' ||
    t === 'ok' ||
    t === 'okay' ||
    t === 'ya' ||
    t === 'yep' ||
    t === 'yup' ||
    t === 'sure' ||
    t === 'agree' ||
    t === 'accept' ||
    t === 'confirm' ||
    t === 'confirmed' ||
    t === 'ama' ||
    t === 'aama' ||
    t.includes('yes') ||
    t.includes('confirm') ||
    t.includes('send it') ||
    t.includes('proceed') ||
    t.includes('pack it') ||
    t.startsWith('yes ') ||
    t.startsWith('ha ')
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
    t.includes('cancel') ||
    t.startsWith('no ')
  ) {
    return 'no';
  }

  return null;
}
