import { publicSiteOrigin } from '@/lib/publicSiteUrl';

export interface WhatsAppAwbShareParams {
  orderNumber: string;
  customerName?: string;
  customerPhone?: string;
  customerAltPhone?: string;
  trackingNumber: string; // ST Courier AWB docket
  courierName?: string;
  items?: Array<{ title?: string; qty?: number; medium?: string; price?: number; subtotal?: number }>;
  address?: string;
  city?: string;
  pincode?: string;
  state?: string;
  totalAmount?: number;
  paymentMethod?: string;
  paymentStatus?: string;
}

/**
 * Builds direct WhatsApp customer notification link with ST Courier AWB docket,
 * official ST Courier tracking website URL, and our Blessing Power Guide live tracking URL.
 */
export function buildWhatsAppAwbShareUrl(params: WhatsAppAwbShareParams): string {
  const cleanPhone = String(params.customerPhone || '').replace(/\D/g, '').slice(-10);
  const cleanName = params.customerName || 'Student';
  const orderNumber = params.orderNumber.replace(/^#+/, '');
  const awb = String(params.trackingNumber || '').trim().toUpperCase();
  const courier = params.courierName || 'ST Courier Express';

  const siteOrigin = publicSiteOrigin();
  const stCourierTrackUrl = `https://stcourier.com/track/shipment?docket=${encodeURIComponent(awb)}`;
  const siteTrackUrl = `${siteOrigin}/track?orderId=${encodeURIComponent(orderNumber)}${cleanPhone ? `&phone=${encodeURIComponent(cleanPhone)}` : ''}`;

  const items = Array.isArray(params.items) ? params.items : [];
  const itemsText = items.length > 0
    ? items.map((i) => `• ${i.qty || 1}x ${i.title}${i.medium ? ` (${i.medium})` : ''}`).join('\n')
    : '• Educational School Guides';

  const addrParts = [params.address, params.city, params.pincode, params.state].filter(Boolean);
  const addrText = addrParts.join(', ');

  const lines = [
    `Dear ${cleanName},`,
    '',
    `🚀 *Good news! Your Blessing Power Guide order has been dispatched!*`,
    '',
    `📋 *Order ID*: #${orderNumber}`,
    `🚚 *Courier Partner*: ${courier}`,
    `📦 *ST Courier Docket (AWB)*: ${awb}`,
    '',
    `🌐 *ST Courier Official Tracking*:`,
    stCourierTrackUrl,
    '',
    `📍 *Blessing Power Guide Live Tracking*:`,
    siteTrackUrl,
    '',
    `📚 *Books Ordered*:`,
    itemsText,
  ];

  if (params.totalAmount) {
    lines.push('');
    lines.push(`💰 *Amount Paid*: ₹${Number(params.totalAmount).toLocaleString('en-IN')} (Prepaid)`);
  }

  if (addrText) {
    lines.push('');
    lines.push(`🏠 *Delivery Address*:`);
    lines.push(addrText);
  }

  lines.push('');
  lines.push('Our delivery executive will call your mobile before doorstep delivery.');
  lines.push('📞 *Helpline & Support*: +91 94860 17820 / +91 63829 63350');
  lines.push('Blessing Power Guide · Chennai');

  const text = lines.join('\n');
  return cleanPhone
    ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/**
 * Builds prefilled WhatsApp order summary link (pre-dispatch or general status).
 */
export function buildWhatsAppOrderSummaryUrl(params: {
  orderNumber: string;
  customerName?: string;
  customerPhone?: string;
  items?: Array<{ title?: string; qty?: number; medium?: string; price?: number; subtotal?: number }>;
  address?: string;
  city?: string;
  pincode?: string;
  state?: string;
  totalAmount?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  trackingNumber?: string;
  status?: string;
}): string {
  if (params.trackingNumber && !params.trackingNumber.startsWith('SHP-') && !params.trackingNumber.toLowerCase().includes('pending')) {
    return buildWhatsAppAwbShareUrl({
      ...params,
      trackingNumber: params.trackingNumber,
    });
  }

  const cleanPhone = String(params.customerPhone || '').replace(/\D/g, '').slice(-10);
  const cleanName = params.customerName || 'Student';
  const orderNumber = params.orderNumber.replace(/^#+/, '');
  const siteOrigin = publicSiteOrigin();
  const siteTrackUrl = `${siteOrigin}/track?orderId=${encodeURIComponent(orderNumber)}${cleanPhone ? `&phone=${encodeURIComponent(cleanPhone)}` : ''}`;

  const items = Array.isArray(params.items) ? params.items : [];
  const itemsText = items.length > 0
    ? items.map((i) => `• ${i.qty || 1}x ${i.title}${i.medium ? ` (${i.medium})` : ''}`).join('\n')
    : '• Educational School Guides';

  const lines = [
    `Dear ${cleanName},`,
    '',
    `Thank you for your order with Blessing Power Guide.`,
    '',
    `📋 *Order ID*: #${orderNumber}`,
    params.totalAmount ? `💰 *Amount*: ₹${Number(params.totalAmount).toLocaleString('en-IN')}` : '',
    params.status ? `📦 *Status*: ${params.status}` : '',
    '',
    `📍 *Track your order live*:`,
    siteTrackUrl,
    '',
    `📚 *Items*:`,
    itemsText,
    '',
    'Your order will be dispatched via ST Courier Express.',
    '📞 *Helpline & Support*: +91 94860 17820 / +91 63829 63350',
    'Blessing Power Guide · Chennai',
  ].filter(Boolean);

  const text = lines.join('\n');
  return cleanPhone
    ? `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}
