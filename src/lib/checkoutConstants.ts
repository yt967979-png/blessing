/**
 * Client-safe Checkout Constants and Types
 * Safe to import in both Client ('use client') and Server components.
 * Zero database or Node.js dependencies.
 */

export const DEFAULT_CHECKOUT_PAUSE_MESSAGE =
  'Online checkout is temporarily paused. For inquiries or book orders, please contact our support team on WhatsApp (+91-9486017820).';

// Backward-compatible synchronous fallback evaluated from public environment variable
export const IS_CHECKOUT_PAUSED =
  process.env.NEXT_PUBLIC_CHECKOUT_PAUSED !== 'false' &&
  process.env.CHECKOUT_PAUSED !== 'false';

export const CHECKOUT_PAUSE_MESSAGE = DEFAULT_CHECKOUT_PAUSE_MESSAGE;

export interface CheckoutControlState {
  paused: boolean;
  message: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
}
