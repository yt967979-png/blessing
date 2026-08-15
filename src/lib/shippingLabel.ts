import { OFFICE_ADDRESS_LINES, OFFICE_COMPANY_NAME } from '@/lib/officeLocation';
import { generateCode128Svg } from '@/lib/barcode128';
import { generateQrDataUrl } from '@/lib/qrCode';

export type ShippingLabelSize = 'thermal4x6' | 'a4' | 'a5';

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
  paymentStatus?: string;
  courierStatus?: string;
  trackingNumber?: string;
  courierName?: string;
  createdAt?: string;
  items?: Array<{ title?: string; qty?: number; price?: number; subtotal?: number }>;
  qrDataUrl?: string;
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates the pure monochrome 4×6 inch (101.6mm × 152.4mm) thermal shipping label HTML.
 * Engineered specifically for 203/300 DPI direct thermal printers (TVS, TSC, Zebra, Rollo).
 */
export function generateSingleThermalLabelHtml(o: ShippingLabelOrder, qrDataUrl: string = ''): string {
  const isCancelled = String(o.courierStatus || o.paymentStatus || '').toLowerCase().includes('cancel');
  const hasAwb = Boolean(o.trackingNumber && !String(o.trackingNumber).startsWith('SHP-') && !String(o.trackingNumber).includes('Pending'));
  const barcodeText = hasAwb ? String(o.trackingNumber) : String(o.orderId || 'BPG-00000');
  const barcodeSvg = generateCode128Svg(barcodeText, { height: 42, barWidth: 2, showText: true });

  const totalAmount = Number(o.totalAmount || 0);
  const totalItems = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0);
  const estWeightGrams = totalItems * 400; // ~400g per guide book

  const orderDate = o.createdAt
    ? new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const itemsLine = (o.items || [])
    .map((it) => `${esc(it.title || 'Guide Book')} × ${it.qty || 1}`)
    .join(' · ') || 'Educational School Guides';

  return `
<div class="thermal-label-page">
  <div class="label-border">
    {/* CANCELLED OVERLAY */}
    ${isCancelled ? `<div class="cancel-banner">⚠️ ORDER CANCELLED — DO NOT DISPATCH / DO NOT COLLECT</div>` : ''}

    {/* TOP BAR: Brand & Order Number */}
    <div class="top-row">
      <div>
        <div class="brand-name">BLESSING POWER GUIDE</div>
        <div class="brand-sub">ST COURIER EXPRESS DOORSTEP DISPATCH</div>
      </div>
      <div class="order-id-box">
        <div class="order-id-lbl">ORDER REF</div>
        <div class="order-id-val">#${esc(o.orderId)}</div>
      </div>
    </div>

    {/* PAYMENT & ROUTING STATUS */}
    <div class="pay-strip ${isCancelled ? 'pay-cancel' : 'pay-prepaid'}">
      <div class="pay-tag">${isCancelled ? '🚫 VOID / CANCELLED' : '✓ PREPAID — DO NOT COLLECT CASH'}</div>
      <div class="pay-val">₹${totalAmount.toLocaleString('en-IN')}</div>
    </div>

    {/* SHIP TO (RECEIVER) */}
    <div class="ship-to-section">
      <div class="section-lbl">DELIVER TO (STUDENT / PARENT)</div>
      <div class="customer-name">${esc(o.customerName || 'Customer')}</div>
      <div class="customer-addr">
        ${esc(o.address || '')}<br>
        <strong>${esc(o.city || 'Chennai')}</strong> — <span class="pincode-highlight">${esc(o.pincode || '600001')}</span><br>
        ${esc(o.state || 'Tamil Nadu')}, INDIA
      </div>
      <div class="customer-phone">
        <span>☎ MOBILE:</span> <strong>+91 ${esc(o.customerPhone || '—')}</strong>
        ${o.customerAltPhone ? `<span>· ALT:</span> <strong>+91 ${esc(o.customerAltPhone)}</strong>` : ''}
      </div>
    </div>

    {/* AWB BARCODE SECTION */}
    <div class="awb-barcode-section">
      <div class="awb-header">
        <div class="awb-lbl">ST COURIER DOCKET / AWB NUMBER</div>
        <div class="awb-status">${hasAwb ? 'OFFICIAL DOCKET ASSIGNED' : 'MANUAL DISPATCH DOCKET'}</div>
      </div>
      <div class="barcode-container">
        ${barcodeSvg}
      </div>
    </div>

    {/* PACKAGE CONTENTS & METRICS */}
    <div class="contents-grid">
      <div class="contents-box">
        <div class="section-lbl">CONTENTS (${totalItems} BOOK${totalItems === 1 ? '' : 'S'} · ~${estWeightGrams}g)</div>
        <div class="contents-line">${itemsLine}</div>
      </div>
      <div class="qr-box">
        ${qrDataUrl ? `<img src="${qrDataUrl}" class="qr-img" alt="Track QR" />` : ''}
        <div class="qr-lbl">SCAN TRACK</div>
      </div>
    </div>

    {/* SENDER & HANDLING FOOTER */}
    <div class="footer-row">
      <div class="sender-info">
        <div class="section-lbl">RETURN IF UNDELIVERED TO (SENDER):</div>
        <strong>${esc(OFFICE_COMPANY_NAME)}</strong><br>
        Trust Square, Ayanavaram, Chennai - 600012, TN<br>
        Helpline: +91 98404 18228
      </div>
      <div class="handling-box">
        <div class="handling-tag">📚 EDUCATIONAL BOOKS</div>
        <div class="handling-sub">DO NOT BEND · WATER RESISTANT</div>
        <div class="date-sub">Date: ${esc(orderDate)}</div>
      </div>
    </div>
  </div>
</div>`;
}

const THERMAL_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    color: #000000;
    background: #e2e8f0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #001b3a;
    color: #ffffff;
    padding: 12px 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  }
  .toolbar span { font-size: 12px; font-weight: 700; }
  .toolbar button {
    background: #fbbf24;
    color: #001b3a;
    border: 0;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .toolbar button.sec { background: #ffffff; color: #001b3a; }
  .toolbar button.active { background: #2874f0; color: #ffffff; outline: 2px solid #fbbf24; }

  /* Page Wrapper */
  .labels-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px 0;
    gap: 20px;
  }

  /* 4x6 Thermal Label Container (101.6mm x 152.4mm) */
  .thermal-label-page {
    width: 101.6mm;
    height: 152.4mm;
    background: #ffffff;
    padding: 3mm;
    page-break-after: always;
    page-break-inside: avoid;
    box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  }
  .label-border {
    border: 2.5px solid #000000;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }

  .cancel-banner {
    background: #000000;
    color: #ffffff;
    text-align: center;
    font-weight: 900;
    font-size: 11px;
    padding: 4px;
    letter-spacing: 0.5px;
  }

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 8px;
    border-bottom: 2px solid #000000;
  }
  .brand-name {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.5px;
  }
  .brand-sub {
    font-size: 7.5px;
    font-weight: 800;
    letter-spacing: 0.5px;
  }
  .order-id-box {
    text-align: right;
  }
  .order-id-lbl {
    font-size: 7px;
    font-weight: 800;
    text-transform: uppercase;
  }
  .order-id-val {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    font-weight: 900;
  }

  .pay-strip {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 5px 8px;
    border-bottom: 2px solid #000000;
    background: #f1f5f9;
  }
  .pay-prepaid {
    background: #000000;
    color: #ffffff;
  }
  .pay-cancel {
    background: #000000;
    color: #ffffff;
  }
  .pay-tag {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.5px;
  }
  .pay-val {
    font-size: 13px;
    font-weight: 900;
  }

  .ship-to-section {
    padding: 8px 10px;
    border-bottom: 2px solid #000000;
  }
  .section-lbl {
    font-size: 7.5px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 2px;
  }
  .customer-name {
    font-size: 15px;
    font-weight: 900;
    text-transform: uppercase;
    line-height: 1.15;
  }
  .customer-addr {
    font-size: 11px;
    font-weight: 600;
    line-height: 1.35;
    margin-top: 3px;
  }
  .pincode-highlight {
    font-size: 14px;
    font-weight: 900;
    letter-spacing: 1px;
    border-bottom: 1.5px solid #000000;
  }
  .customer-phone {
    font-size: 11.5px;
    font-weight: 800;
    margin-top: 4px;
    border-top: 1px dashed #000000;
    padding-top: 3px;
  }

  .awb-barcode-section {
    padding: 6px 8px;
    border-bottom: 2px solid #000000;
    text-align: center;
    background: #ffffff;
  }
  .awb-header {
    display: flex;
    justify-content: space-between;
    font-size: 7.5px;
    font-weight: 800;
    margin-bottom: 3px;
  }
  .barcode-container {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 2px 0;
  }

  .contents-grid {
    display: grid;
    grid-template-columns: 1fr 56px;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 2px solid #000000;
    align-items: center;
  }
  .contents-box {
    overflow: hidden;
  }
  .contents-line {
    font-size: 9.5px;
    font-weight: 700;
    line-height: 1.3;
    max-height: 28px;
    overflow: hidden;
  }
  .qr-box {
    text-align: center;
  }
  .qr-img {
    width: 52px;
    height: 52px;
    display: block;
    margin: 0 auto;
  }
  .qr-lbl {
    font-size: 6.5px;
    font-weight: 900;
    margin-top: 1px;
  }

  .footer-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 8px;
    gap: 8px;
    background: #ffffff;
    align-items: flex-end;
  }
  .sender-info {
    font-size: 8px;
    line-height: 1.3;
  }
  .handling-box {
    text-align: right;
  }
  .handling-tag {
    font-size: 8.5px;
    font-weight: 900;
  }
  .handling-sub {
    font-size: 7px;
    font-weight: 700;
  }
  .date-sub {
    font-size: 7px;
    font-weight: 600;
    margin-top: 2px;
  }

  /* A4 fallback styles */
  .view-a4 .thermal-label-page {
    width: 210mm;
    height: 297mm;
    padding: 15mm 20mm;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
  .view-a4 .label-border {
    width: 101.6mm;
    height: 152.4mm;
    margin: 0 auto;
  }
  .view-a4 .a4-cut-guide {
    display: block;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: #64748b;
    margin-top: 10px;
  }
  .a4-cut-guide { display: none; }

  @media print {
    body { background: #ffffff; padding: 0; }
    .toolbar { display: none !important; }
    .labels-container { padding: 0; gap: 0; }
    .thermal-label-page { box-shadow: none; margin: 0; }
    @page {
      size: 4in 6in;
      margin: 0;
    }
  }
`;

/**
 * Generates an HTML document containing 4×6" thermal shipping labels for one or multiple orders.
 */
export async function generateShippingLabelsHtml(
  orders: ShippingLabelOrder[],
  initialSize: ShippingLabelSize = 'thermal4x6'
): Promise<string> {
  const orderList = orders && orders.length > 0 ? orders : [];
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.com';

  const labelsHtmlPromises = orderList.map(async (o) => {
    const cleanPhone = (o.customerPhone || '').replace(/\D/g, '').slice(-10);
    const trackTargetUrl = `${siteUrl}/track?orderId=${encodeURIComponent(o.orderId)}${cleanPhone ? `&phone=${encodeURIComponent(cleanPhone)}` : ''}`;
    const qrDataUrl = await generateQrDataUrl(trackTargetUrl, { size: 120, margin: 0 });
    return generateSingleThermalLabelHtml(o, qrDataUrl);
  });

  const labelsHtmlArray = await Promise.all(labelsHtmlPromises);
  const labelsHtml = labelsHtmlArray.join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Shipping Labels (${orderList.length} Order${orderList.length === 1 ? '' : 's'}) — Blessing Power Guide</title>
  <style>
    ${THERMAL_CSS}
  </style>
</head>
<body class="view-${initialSize}">
  <div class="toolbar">
    <span>🖨️ Shipping Label Batch (${orderList.length} Package${orderList.length === 1 ? '' : 's'}):</span>
    <button type="button" data-size="thermal4x6" class="${initialSize === 'thermal4x6' ? 'active' : 'sec'}">4×6" Thermal Label</button>
    <button type="button" data-size="a4" class="${initialSize === 'a4' ? 'active' : 'sec'}">Standard A4 Sheet</button>
    <button type="button" onclick="window.print()">Print Labels Now</button>
  </div>

  <div class="labels-container">
    ${labelsHtml}
  </div>

  <script>
    (function(){
      document.querySelectorAll('.toolbar button[data-size]').forEach(function(btn){
        btn.addEventListener('click', function(){
          var sz = btn.getAttribute('data-size');
          document.body.className = 'view-' + sz;
          document.querySelectorAll('.toolbar button[data-size]').forEach(function(b){
            b.classList.toggle('active', b === btn);
            b.classList.toggle('sec', b !== btn);
          });
        });
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Opens a print window with the 4×6" thermal shipping label for an order.
 */
export async function openShippingLabelPrint(
  o: ShippingLabelOrder | ShippingLabelOrder[],
  size: ShippingLabelSize = 'thermal4x6'
): Promise<void> {
  const list = Array.isArray(o) ? o : [o];
  const pw = window.open('', '_blank', 'width=900,height=1100');
  if (!pw) return;
  const html = await generateShippingLabelsHtml(list, size);
  pw.document.write(html);
  pw.document.close();
}
