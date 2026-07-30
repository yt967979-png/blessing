/** Shared cancelled-order helpers — use everywhere status/revenue/AWB matter. */

export function isOrderCancelled(status: string | null | undefined): boolean {
  return String(status || '').toLowerCase().includes('cancel');
}

export function paymentStatusAfterCancel(paymentMethod: string | null | undefined): string {
  const m = String(paymentMethod || '').toLowerCase();
  if (m.includes('cod')) return 'Cancelled — COD not collectible';
  return 'Cancelled';
}
