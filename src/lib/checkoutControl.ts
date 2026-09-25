/**
 * Global Checkout Kill-Switch / Pause Control
 * Set NEXT_PUBLIC_CHECKOUT_PAUSED=false or CHECKOUT_PAUSED=false to re-enable.
 * Currently paused as requested to prevent new payments.
 */
export const IS_CHECKOUT_PAUSED =
  process.env.NEXT_PUBLIC_CHECKOUT_PAUSED !== 'false' &&
  process.env.CHECKOUT_PAUSED !== 'false';

export const CHECKOUT_PAUSE_MESSAGE =
  'Online checkout is temporarily paused. For inquiries or book orders, please contact our support team on WhatsApp (+91-9486017820).';
