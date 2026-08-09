import { OFFICE_ADDRESS_LINES, OFFICE_COMPANY_NAME } from '@/lib/officeLocation';

export type ShippingLabelSize = 'sticker' | 'a5' | 'a4';

export interface ShippingLabelOrder {
  orderId: string;
  customerName?: string;
  customerPhone?: string;
  customerAltPhone?: string;
  address?: string;
  city?: string;
  pincode?: string;
  state?: string;
  totalAmount?: number;
  paymentMethod?: string;
  courierStatus?: string;
  trackingNumber?: string;
  courierName?: string;
  createdAt?: string;
  items?: Array<{ title?: string; qty?: number; price?: number; subtotal?: number }>;
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function numberToWords(num: number): string {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const n = Math.floor(Math.abs(num));
  if (n === 0) return 'Zero';
  const inWords = (val: number): string => {
    if (val < 20) return a[val];
    if (val < 100) return b[Math.floor(val / 10)] + (val % 10 ? ' ' + a[val % 10] : '');
    if (val < 1000) return a[Math.floor(val / 100)] + ' Hundred' + (val % 100 ? ' ' + inWords(val % 100) : '');
    if (val < 100000) return inWords(Math.floor(val / 1000)) + ' Thousand' + (val % 1000 ? ' ' + inWords(val % 1000) : '');
    return inWords(Math.floor(val / 100000)) + ' Lakh' + (val % 100000 ? ' ' + inWords(val % 100000) : '');
  };
  return 'Rupees ' + inWords(n) + ' Only';
}

/** Compact face for pasting on courier packet (normal paper + tape). */
function stickerFaceHtml(o: ShippingLabelOrder, opts: {
  isCancelled: boolean;
  hasOfficialAwb: boolean;
  totalAmount: number;
  orderDate: string;
  barcodeUrl: string;
  qrUrl: string;
  itemsLine: string;
  totalItems: number;
}): string {
  const {
    isCancelled, hasOfficialAwb, totalAmount, orderDate,
    barcodeUrl, qrUrl, itemsLine, totalItems,
  } = opts;

  return `
  <div class="sticker">
    ${isCancelled ? `<div class="cancel-banner">⚠ CANCELLED — DO NOT SHIP</div>` : ''}
    <div class="sticker-top">
      <div>
        <div class="brand">BLESSING POWER GUIDE</div>
        <div class="sub">ST Courier Express · Ship label</div>
      </div>
      <div class="oid">#${esc(o.orderId)}</div>
    </div>

    <div class="pay-row ${isCancelled ? 'pay-cancel' : 'pay-paid'}">
      <span>${isCancelled ? 'CANCELLED — DO NOT COLLECT' : '✓ PREPAID — DO NOT COLLECT'}</span>
      <strong>₹${totalAmount.toLocaleString('en-IN')}</strong>
    </div>

    <div class="ship-grid">
      <div class="ship-to">
        <div class="lbl">SHIP TO</div>
        <div class="name">${esc(o.customerName || 'Customer')}</div>
        <div class="addr">${esc(o.address || '')}<br>${esc(o.city || '')} — ${esc(o.pincode || '')}<br>${esc(o.state || 'Tamil Nadu')}, India</div>
        <div class="phone">☎ +91 ${esc(o.customerPhone || '')}${
          o.customerAltPhone ? ` · Alt +91 ${esc(o.customerAltPhone)}` : ''
        }</div>
      </div>
      <div class="qr-box">
        <img src="${qrUrl}" alt="QR" />
        <div>Track</div>
      </div>
    </div>

    ${hasOfficialAwb ? `
    <div class="awb-row">
      <div>
        <div class="lbl">AWB / DOCKET</div>
        <div class="awb">${esc(o.trackingNumber || '')}</div>
        <div class="courier">${esc(o.courierName || 'ST Courier Express')}</div>
      </div>
      <img src="${barcodeUrl}" class="barcode" alt="Barcode" />
    </div>` : `
    <div class="awb-pending">
      <span>AWB: PENDING — book on ST Courier, then paste docket sticker</span>
    </div>`}

    <div class="items">
      <div class="lbl">CONTENTS (${totalItems} item${totalItems === 1 ? '' : 's'})</div>
      <div class="items-line">${itemsLine}</div>
    </div>

    <div class="from-row">
      <div>
        <div class="lbl">FROM / RETURN</div>
        <div class="from-text"><strong>Blessing Power Guide</strong><br>${esc(OFFICE_ADDRESS_LINES[1] || '')}<br>+91 9840418228</div>
      </div>
      <div class="meta-right">
        <div>Date: ${esc(orderDate)}</div>
        <div>Cut along edge · tape on packet</div>
      </div>
    </div>
  </div>`;
}

function a5FullHtml(o: ShippingLabelOrder, opts: {
  isCancelled: boolean;
  hasOfficialAwb: boolean;
  totalAmount: number;
  orderDate: string;
  invoiceNum: string;
  barcodeUrl: string;
  qrUrl: string;
  itemsHtml: string;
  totalItems: number;
  estWeight: number;
}): string {
  const {
    isCancelled, hasOfficialAwb, totalAmount, orderDate, invoiceNum,
    barcodeUrl, qrUrl, itemsHtml, totalItems, estWeight,
  } = opts;

  return `
<div class="label-container">
  ${isCancelled ? `<div class="cancel-banner">⚠ CANCELLED — DO NOT SHIP</div>` : ''}
  <div class="top-banner">
    <div class="brand-left">
      <div class="logo-box">B</div>
      <div class="brand-titles">
        <h1>BLESSING POWER GUIDE</h1>
        <p>Premium Educational Books · Chennai</p>
      </div>
    </div>
    <div class="invoice-title-right">
      <h2>SHIPPING LABEL / INVOICE</h2>
      <p>Paste on courier package</p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-item"><div class="lbl">ORDER ID</div><div class="val">#${esc(o.orderId)}</div></div>
    <div class="meta-item"><div class="lbl">INVOICE NO.</div><div class="val-sm">${esc(invoiceNum)}</div></div>
    <div class="meta-item"><div class="lbl">ORDER DATE</div><div class="val-sm">${esc(orderDate)}</div></div>
    <div class="meta-item"><div class="lbl">PAYMENT</div><div class="val-sm">PREPAID</div></div>
  </div>

  <div class="shipping-row" style="${hasOfficialAwb ? '' : 'grid-template-columns:1fr;'}">
    <div>
      <div class="ship-to-title">SHIP TO</div>
      <div class="customer-name">${esc(o.customerName || 'Customer')}</div>
      <div class="customer-address">
        ${esc(o.address || '')}<br>
        ${esc(o.city || '')} — ${esc(o.pincode || '')}<br>
        ${esc(o.state || 'Tamil Nadu')}, INDIA
      </div>
      <div class="customer-phone">
        <span class="phone-badge">☎</span> +91 ${esc(o.customerPhone || '')}${
          o.customerAltPhone ? ` · Alt +91 ${esc(o.customerAltPhone)}` : ''
        }
      </div>
    </div>
    ${hasOfficialAwb ? `
    <div class="awb-card">
      <div class="awb-lbl">AWB / TRACKING</div>
      <div class="awb-val">${esc(o.trackingNumber || '')}</div>
      <div class="courier-lbl">COURIER</div>
      <div class="courier-val">${esc(o.courierName || 'ST Courier Express')}</div>
      <img src="${barcodeUrl}" class="barcode-img" alt="Barcode" />
    </div>` : ''}
  </div>

  <div class="payment-bar">
    <div class="${isCancelled ? 'badge-cod' : 'badge-prepaid'}" style="${isCancelled ? 'background:#fef2f2;border-color:#991b1b;color:#991b1b;' : ''}">
      ${isCancelled ? '🚫 CANCELLED — DO NOT COLLECT / DO NOT SHIP' : '✓ PREPAID — DO NOT COLLECT'}
    </div>
    <div class="total-amount-display">₹${totalAmount.toLocaleString('en-IN')}</div>
  </div>

  <div class="table-section">
    <div class="table-section-title">PACKAGE DETAILS</div>
    <table class="pkg-table">
      <thead><tr><th>#</th><th>ITEM</th><th>QTY</th><th>UNIT</th><th>AMOUNT</th></tr></thead>
      <tbody>${itemsHtml}</tbody>
    </table>
  </div>

  <div class="metrics-grid">
    <div class="metric-box"><div class="metric-icon">📦</div><div class="metric-val">${totalItems}</div><div class="metric-lbl">ITEMS</div></div>
    <div class="metric-box"><div class="metric-icon">⚖</div><div class="metric-val">${estWeight}g</div><div class="metric-lbl">EST. WT</div></div>
    <div class="metric-box"><div class="metric-icon">💳</div><div class="metric-val">PAID</div><div class="metric-lbl">PAYMENT</div></div>
    <div class="metric-box"><div class="metric-icon">🚚</div><div class="metric-val">${esc((o.courierName || 'ST Courier').slice(0, 12))}</div><div class="metric-lbl">COURIER</div></div>
  </div>

  <div class="bottom-grid">
    <div class="summary-col">
      <h3>AMOUNT</h3>
      <div class="summary-line total"><span>Total</span><span>₹${totalAmount.toLocaleString('en-IN')}</span></div>
      <div class="words-text">${esc(numberToWords(totalAmount))}</div>
    </div>
    <div class="return-col">
      <h3>RETURN TO</h3>
      <p><strong>${esc(OFFICE_COMPANY_NAME)}</strong><br>${esc(OFFICE_ADDRESS_LINES[1] || '')}<br>+91 9840418228</p>
    </div>
    <div class="qr-col">
      <img src="${qrUrl}" alt="QR" />
      <div class="qr-lbl">SCAN TO TRACK</div>
    </div>
  </div>

  <div class="notice-bar">Do not accept if seal is broken. Support +91 9840418228</div>
  <div class="footer-banner">BLESSING POWER GUIDE <span>Books that Guide. Knowledge that Lasts.</span></div>
</div>`;
}

const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #e2e8f0; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .toolbar { position: sticky; top: 0; z-index: 20; background: #001B3A; color: #fff; padding: 10px 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center; }
  .toolbar span { font-size: 11px; font-weight: 700; opacity: 0.9; margin-right: 6px; }
  .toolbar button { border: 0; border-radius: 8px; padding: 8px 12px; font-size: 11px; font-weight: 800; cursor: pointer; background: #fbbf24; color: #001B3A; }
  .toolbar button.secondary { background: #fff; color: #001B3A; }
  .toolbar button.active { outline: 2px solid #fbbf24; background: #2874f0; color: #fff; }
  .hint { font-size: 10px; opacity: 0.75; width: 100%; text-align: center; }
  .sheet { background: #fff; margin: 12px auto; }
  .cancel-banner { background: #991b1b; color: #fff; text-align: center; padding: 8px; font-size: 13px; font-weight: 900; letter-spacing: 1px; }

  /* Compact sticker */
  .sticker { border: 2px solid #001B3A; border-radius: 8px; overflow: hidden; background: #fff; width: 100%; height: 100%; display: flex; flex-direction: column; }
  .sticker-top { background: #001B3A; color: #fff; padding: 8px 10px; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .brand { font-size: 12px; font-weight: 900; letter-spacing: 0.4px; }
  .sub { font-size: 8px; opacity: 0.85; margin-top: 2px; font-weight: 600; }
  .oid { font-size: 13px; font-weight: 900; font-family: ui-monospace, monospace; }
  .pay-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 10px; font-size: 11px; font-weight: 900; border-bottom: 1px solid #e2e8f0; }
  .pay-cod { background: #fffbeb; color: #92400e; }
  .pay-paid { background: #f0fdf4; color: #166534; }
  .pay-cancel { background: #fef2f2; color: #991b1b; }
  .ship-grid { display: grid; grid-template-columns: 1fr 64px; gap: 8px; padding: 10px; border-bottom: 1px solid #e2e8f0; }
  .lbl { font-size: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #64748b; margin-bottom: 3px; }
  .name { font-size: 15px; font-weight: 900; text-transform: uppercase; line-height: 1.2; }
  .addr { font-size: 11px; font-weight: 600; color: #334155; margin-top: 4px; line-height: 1.4; }
  .phone { margin-top: 6px; font-size: 12px; font-weight: 800; color: #001B3A; }
  .qr-box { text-align: center; }
  .qr-box img { width: 60px; height: 60px; display: block; margin: 0 auto; }
  .qr-box div { font-size: 7px; font-weight: 800; text-transform: uppercase; margin-top: 2px; color: #64748b; }
  .awb-row { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
  .awb { font-family: ui-monospace, monospace; font-size: 14px; font-weight: 900; letter-spacing: 1px; }
  .courier { font-size: 10px; font-weight: 700; color: #001B3A; margin-top: 2px; }
  .barcode { max-height: 40px; max-width: 55%; object-fit: contain; }
  .awb-pending { padding: 8px 10px; font-size: 10px; font-weight: 700; color: #92400e; background: #fffbeb; border-bottom: 1px dashed #f59e0b; }
  .items { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
  .items-line { font-size: 11px; font-weight: 700; color: #0f172a; line-height: 1.35; }
  .from-row { display: flex; justify-content: space-between; gap: 8px; padding: 8px 10px; margin-top: auto; background: #f8fafc; }
  .from-text { font-size: 9px; font-weight: 600; color: #334155; line-height: 1.35; }
  .meta-right { font-size: 8px; color: #64748b; font-weight: 700; text-align: right; line-height: 1.4; }

  /* A5 full (legacy detailed) */
  .label-container { border: 2px solid #001B3A; border-radius: 10px; overflow: hidden; background: #fff; display: flex; flex-direction: column; min-height: 190mm; }
  .top-banner { background: #001B3A; color: #fff; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; }
  .brand-left { display: flex; align-items: center; gap: 10px; }
  .logo-box { width: 36px; height: 36px; background: #fff; color: #001B3A; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px; }
  .brand-titles h1 { font-size: 14px; font-weight: 900; }
  .brand-titles p { font-size: 9px; opacity: 0.85; font-weight: 600; }
  .invoice-title-right { text-align: right; }
  .invoice-title-right h2 { font-size: 10px; font-weight: 800; letter-spacing: 1px; }
  .invoice-title-right p { font-size: 8px; opacity: 0.8; margin-top: 2px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; border-bottom: 1.5px solid #001B3A; background: #f8fafc; }
  .meta-item { padding: 7px 10px; border-right: 1px solid #e2e8f0; }
  .meta-item:last-child { border-right: none; }
  .meta-item .lbl { font-size: 7px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
  .meta-item .val { font-size: 13px; font-weight: 900; color: #001B3A; margin-top: 2px; }
  .meta-item .val-sm { font-size: 10px; font-weight: 800; color: #334155; margin-top: 2px; }
  .shipping-row { display: grid; grid-template-columns: 1.3fr 1fr; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; }
  .ship-to-title { font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 3px; }
  .customer-name { font-size: 15px; font-weight: 900; text-transform: uppercase; }
  .customer-address { font-size: 11px; color: #334155; margin-top: 4px; line-height: 1.4; font-weight: 600; }
  .customer-phone { margin-top: 6px; font-size: 12px; font-weight: 800; color: #001B3A; display: flex; align-items: center; gap: 6px; }
  .phone-badge { width: 16px; height: 16px; background: #001B3A; color: #fff; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; }
  .awb-card { border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 8px; }
  .awb-card .awb-lbl, .awb-card .courier-lbl { font-size: 7px; font-weight: 800; text-transform: uppercase; color: #64748b; }
  .awb-card .awb-val { font-family: monospace; font-size: 13px; font-weight: 900; margin: 2px 0 4px; letter-spacing: 1px; }
  .awb-card .courier-val { font-size: 10px; font-weight: 900; color: #001B3A; margin-bottom: 4px; }
  .barcode-img { width: 100%; max-height: 42px; object-fit: contain; }
  .payment-bar { padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #e2e8f0; }
  .badge-cod { background: #fffbeb; border: 2px dashed #d97706; color: #92400e; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 900; }
  .badge-prepaid { background: #f0fdf4; border: 2px solid #16a34a; color: #166534; padding: 5px 10px; border-radius: 6px; font-size: 11px; font-weight: 900; }
  .total-amount-display { font-size: 22px; font-weight: 900; }
  .table-section { padding: 8px 14px; border-bottom: 1.5px solid #e2e8f0; }
  .table-section-title { font-size: 8px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
  .pkg-table { width: 100%; border-collapse: collapse; }
  .pkg-table th { font-size: 8px; font-weight: 800; text-transform: uppercase; color: #64748b; padding: 5px 8px; border-bottom: 1.5px solid #cbd5e1; text-align: left; }
  .pkg-table th:first-child, .pkg-table th:nth-child(3) { text-align: center; }
  .pkg-table th:nth-child(4), .pkg-table th:last-child { text-align: right; }
  .metrics-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; border-bottom: 1.5px solid #e2e8f0; }
  .metric-box { padding: 8px 6px; border-right: 1px solid #e2e8f0; text-align: center; }
  .metric-box:last-child { border-right: none; }
  .metric-icon { font-size: 14px; margin-bottom: 2px; }
  .metric-val { font-size: 11px; font-weight: 900; }
  .metric-lbl { font-size: 7px; font-weight: 800; text-transform: uppercase; color: #64748b; }
  .bottom-grid { display: grid; grid-template-columns: 1.2fr 1fr 0.8fr; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #e2e8f0; align-items: center; }
  .summary-col h3, .return-col h3 { font-size: 8px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
  .summary-line { display: flex; justify-content: space-between; font-size: 10px; font-weight: 600; color: #334155; }
  .summary-line.total { border-top: 1px solid #cbd5e1; padding-top: 4px; margin-top: 4px; font-size: 12px; font-weight: 900; color: #0f172a; }
  .words-text { font-size: 9px; font-style: italic; color: #475569; margin-top: 4px; }
  .return-col p { font-size: 9.5px; color: #334155; line-height: 1.4; font-weight: 600; }
  .qr-col { border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 6px; text-align: center; }
  .qr-col img { width: 64px; height: 64px; display: block; margin: 0 auto; }
  .qr-col .qr-lbl { font-size: 7px; font-weight: 900; letter-spacing: 1px; text-transform: uppercase; color: #001B3A; margin-top: 3px; }
  .notice-bar { background: #f8fafc; padding: 5px 10px; text-align: center; font-size: 8px; color: #475569; font-weight: 600; }
  .footer-banner { background: #001B3A; color: #fff; padding: 7px; text-align: center; font-size: 9px; font-weight: 900; letter-spacing: 1px; }
  .footer-banner span { font-weight: 500; text-transform: none; font-size: 8px; opacity: 0.85; margin-left: 6px; }

  /* Size layouts */
  .view-sticker .sheet { width: 100mm; min-height: 140mm; padding: 0; }
  .view-sticker .sticker { min-height: 140mm; }
  .view-a5 .sheet { width: 148mm; padding: 6px; }
  .view-a4 .sheet { width: 210mm; min-height: 297mm; padding: 10mm; }
  .view-a4 .slot { width: 100mm; min-height: 140mm; }
  .view-a4 .cut-hint { margin-top: 8px; font-size: 10px; color: #64748b; font-weight: 700; }

  @media print {
    body { background: #fff; }
    .toolbar { display: none !important; }
    .sheet { margin: 0; box-shadow: none; }
    .view-sticker .sheet { width: 100mm; }
    .view-a5 .sheet { width: 148mm; }
    .view-a4 .sheet { width: 210mm; min-height: 297mm; }
    .view-sticker { }
  }
  @page sticker {
    size: 100mm 140mm;
    margin: 0;
  }
  @page a5 {
    size: A5 portrait;
    margin: 0;
  }
  @page a4 {
    size: A4 portrait;
    margin: 0;
  }
`;

/**
 * Shipping label HTML with on-screen size switcher.
 * Default: compact sticker (cheap normal paper + tape on packet).
 */
export function generateShippingLabelHtml(
  o: ShippingLabelOrder,
  initialSize: ShippingLabelSize = 'a4'
): string {
  const isCancelled = String(o.courierStatus || '').toLowerCase().includes('cancel');
  const orderDate = o.createdAt
    ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const hasOfficialAwb = Boolean(o.trackingNumber && !String(o.trackingNumber).startsWith('SHP-'));
  const barcodeText = hasOfficialAwb ? String(o.trackingNumber) : String(o.orderId || 'BPG');
  const invoiceNum = `BPG/INV/${String(o.orderId || '').replace(/\D/g, '') || '0000'}`;
  const totalAmount = Number(o.totalAmount || 0);
  const totalItems = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0);
  const estWeight = totalItems * 400;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessing-production.up.railway.app';
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(barcodeText)}&scale=2&height=12&textsize=10&includetext`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(`${siteUrl}/track?orderId=${o.orderId}`)}`;

  const itemsLine = (o.items || [])
    .map((it) => `${esc(it.title || 'Guide Book')} × ${it.qty || 1}`)
    .join(' · ') || 'Educational Guide Books';

  const itemsHtml = (o.items || [])
    .map(
      (item, i) => `
      <tr>
        <td style="padding:6px 8px;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0;text-align:center">${i + 1}</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:700;border-bottom:1px solid #e2e8f0">${esc(item.title || 'Educational Book')}</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:center">${item.qty || 1}</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:700;border-bottom:1px solid #e2e8f0;text-align:right">₹${Number(item.price || item.subtotal || totalAmount).toLocaleString('en-IN')}</td>
        <td style="padding:6px 8px;font-size:11px;font-weight:800;border-bottom:1px solid #e2e8f0;text-align:right">₹${(Number(item.price || item.subtotal || totalAmount) * (item.qty || 1)).toLocaleString('en-IN')}</td>
      </tr>`
    )
    .join('');

  const faceOpts = {
    isCancelled,
    hasOfficialAwb,
    totalAmount,
    orderDate,
    barcodeUrl,
    qrUrl,
    itemsLine,
    totalItems,
  };

  const sticker = stickerFaceHtml(o, faceOpts);
  const a5 = a5FullHtml(o, {
    ...faceOpts,
    invoiceNum,
    itemsHtml,
    estWeight,
  });

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Ship label #${esc(o.orderId)}</title>
<style>
${SHARED_CSS}
@page { size: A4 portrait; margin: 0; }
body.view-sticker { }
</style>
</head>
<body class="view-${initialSize}">
  <div class="toolbar no-print">
    <span>1 label per order — pick paper size:</span>
    <button type="button" data-size="a4" class="${initialSize === 'a4' ? 'active' : ''}">1× on A4</button>
    <button type="button" data-size="sticker" class="secondary ${initialSize === 'sticker' ? 'active' : ''}">1× Sticker</button>
    <button type="button" data-size="a5" class="secondary ${initialSize === 'a5' ? 'active' : ''}">1× A5 full</button>
    <button type="button" onclick="window.print()">Print</button>
    <div class="hint">Default A4 · 1 sticker only · cut &amp; tape on that customer&apos;s packet</div>
  </div>

  <div id="panel-sticker" class="sheet" style="${initialSize === 'sticker' ? '' : 'display:none'}">${sticker}</div>
  <div id="panel-a4" class="sheet" style="${initialSize === 'a4' ? '' : 'display:none'}">
    <div class="slot">${sticker}</div>
    <div class="cut-hint">✂ Cut around this one sticker · tape on packet #${esc(o.orderId)}</div>
  </div>
  <div id="panel-a5" class="sheet" style="${initialSize === 'a5' ? '' : 'display:none'}">${a5}</div>

<script>
(function(){
  function show(size){
    document.body.className = 'view-' + size;
    ['sticker','a4','a5'].forEach(function(s){
      var el = document.getElementById('panel-' + s);
      if (el) el.style.display = s === size ? '' : 'none';
    });
    document.querySelectorAll('.toolbar button[data-size]').forEach(function(btn){
      btn.classList.toggle('active', btn.getAttribute('data-size') === size);
    });
    var style = document.getElementById('page-style');
    if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.appendChild(style); }
    if (size === 'sticker') style.textContent = '@page { size: 100mm 140mm; margin: 0; }';
    else if (size === 'a5') style.textContent = '@page { size: A5 portrait; margin: 0; }';
    else style.textContent = '@page { size: A4 portrait; margin: 0; }';
  }
  document.querySelectorAll('.toolbar button[data-size]').forEach(function(btn){
    btn.addEventListener('click', function(){ show(btn.getAttribute('data-size')); });
  });
  show('${initialSize}');
})();
</script>
</body></html>`;
}

export function openShippingLabelPrint(
  o: ShippingLabelOrder,
  size: ShippingLabelSize = 'a4'
): void {
  const pw = window.open('', '_blank', 'width=900,height=1100');
  if (!pw) return;
  pw.document.write(generateShippingLabelHtml(o, size));
  pw.document.close();
}
