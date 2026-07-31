/** Transactional WhatsApp notify event keys — Meta-swappable later. */

export type NotifyEvent =
  | 'order.confirm_request'
  | 'order.confirmed'
  | 'payment.confirmed'
  | 'order.packed'
  | 'order.shipped'
  | 'order.ofd'
  | 'order.delivered'
  | 'order.cancelled'
  | 'admin.new_order'
  | 'admin.low_stock';

export type NotifyPayload = {
  customerPhone?: string;
  customerName?: string;
  orderId?: string;
  totalAmount?: number | string;
  bookTitle?: string;
  itemsSummary?: string;
  paymentMethod?: string;
  awbNumber?: string;
  city?: string;
  /** cancel reason / actor nuance: requested | expired | admin | system */
  cancelReason?: string;
  /** low stock */
  title?: string;
  stockLeft?: number | string;
  bookId?: string;
  /** extra admin phones override (else ADMIN_NOTIFY_PHONE / ADMIN_PHONE / settings) */
  adminPhones?: string[];
};

export type NotifyResult = {
  ok: boolean;
  queued?: boolean;
  error?: string;
  event: NotifyEvent;
};
