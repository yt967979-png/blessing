import fs from 'fs';
import path from 'path';
import { formatGstinLine, getShopInvoiceAddress, getShopLegalName } from '@/lib/shopConfig';
import { OFFICE_COMPANY_NAME } from '@/lib/officeLocation';
import { generateQrSvg } from '@/lib/qrCode';
import { isOrderCancelled } from '@/lib/orderStatus';
import { publicSiteOrigin } from '@/lib/publicSiteUrl';

export function getFinancialYearString(date: Date = new Date()): string {
  const month = date.getMonth(); // 0 = Jan, 3 = Apr
  const year = date.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = (startYear + 1) % 100;
  return `${String(startYear).slice(-2)}-${String(endYear).padStart(2, '0')}`;
}

export function formatGstInvoiceNumber(orderId: string, createdAt?: string | Date, storedInvoiceNumber?: string | null): string {
  if (storedInvoiceNumber && storedInvoiceNumber.startsWith('BPG/')) {
    return storedInvoiceNumber;
  }
  const d = createdAt ? new Date(createdAt) : new Date();
  const fy = getFinancialYearString(isNaN(d.getTime()) ? new Date() : d);
  const cleanId = String(orderId || '').replace(/^BPG-?/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `BPG/${fy}/${cleanId || '00001'}`;
}

export async function generateNextGstInvoiceNumber(client: any, date: Date = new Date()): Promise<string> {
  const fy = getFinancialYearString(date);
  try {
    const res = await client.query(
      `INSERT INTO invoice_sequences (financial_year, last_number, updated_at)
       VALUES ($1, 1, NOW())
       ON CONFLICT (financial_year) DO UPDATE
       SET last_number = invoice_sequences.last_number + 1, updated_at = NOW()
       RETURNING last_number`,
      [fy]
    );
    const seqNum = Number(res.rows[0]?.last_number || 1);
    return `BPG/${fy}/${String(seqNum).padStart(5, '0')}`;
  } catch {
    return `BPG/${fy}/00001`;
  }
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function numberToIndianRupeesWords(num: number): string {
  const a = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const n = Math.floor(Math.abs(num));
  if (n === 0) return 'Rupees Zero Only';

  const inWords = (val: number): string => {
    if (val < 20) return a[val];
    if (val < 100) return b[Math.floor(val / 10)] + (val % 10 ? ' ' + a[val % 10] : '');
    if (val < 1000) return a[Math.floor(val / 100)] + ' Hundred' + (val % 100 ? ' ' + inWords(val % 100) : '');
    if (val < 100000) return inWords(Math.floor(val / 1000)) + ' Thousand' + (val % 1000 ? ' ' + inWords(val % 1000) : '');
    if (val < 10000000) return inWords(Math.floor(val / 100000)) + ' Lakh' + (val % 100000 ? ' ' + inWords(val % 100000) : '');
    return inWords(Math.floor(val / 10000000)) + ' Crore' + (val % 10000000 ? ' ' + inWords(val % 10000000) : '');
  };

  return `Rupees ${inWords(n)} Only`;
}

// In-memory cache for official logo base64
let cachedLogoDataUrl: string | null = null;
function getOfficialLogoDataUrl(siteUrl: string): string {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  try {
    const logoFilePath = path.join(process.cwd(), 'public', 'logo.png');
    if (fs.existsSync(logoFilePath)) {
      const buffer = fs.readFileSync(logoFilePath);
      cachedLogoDataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
      return cachedLogoDataUrl;
    }
  } catch {
    // fallback to static URL
  }
  return `${siteUrl}/logo.png?v=4`;
}

export interface InvoiceData {
  orderId: string;
  invoiceNumber?: string | null;
  customerName: string;
  customerPhone: string;
  customerAltPhone?: string;
  address?: string;
  city?: string;
  pincode?: string;
  state?: string;
  totalAmount: number;
  paymentMethod: string;
  items?: Array<{ title?: string; qty?: number; price?: number; subtotal?: number; hsn?: string; medium?: string; mrp?: number }>;
  trackingNumber?: string;
  courierName?: string;
  paymentStatus?: string;
  orderStatus?: string;
  courierStatus?: string;
  createdAt?: string;
  paymentId?: string;
  shippingCharge?: number;
  discount?: number;
}

/**
 * Generates an executive, award-winning A4 Bill of Supply for educational printed books (HSN 4901, 0% GST Exempt).
 * Uses official Blessing Power Guide logo, blank signature space for official stamp/signing, and precise 1-A4-sheet fit.
 */
export async function generateTaxInvoiceHtml(orderData: InvoiceData): Promise<string> {
  const dateStr = orderData.createdAt
    ? new Date(orderData.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const invoiceNumber = formatGstInvoiceNumber(orderData.orderId, orderData.createdAt, orderData.invoiceNumber);
  const itemsList = orderData.items && orderData.items.length > 0
    ? orderData.items
    : [{ title: 'Educational Guide Book', qty: 1, price: orderData.totalAmount, hsn: '4901' }];

  const cancelled = isOrderCancelled(orderData.orderStatus || orderData.courierStatus);
  const totalAmount = Number(orderData.totalAmount || 0);
  const wordsAmount = numberToIndianRupeesWords(totalAmount);
  const gstinLine = formatGstinLine();
  const legalName = getShopLegalName();
  const siteUrl = publicSiteOrigin();

  const logoSrc = getOfficialLogoDataUrl(siteUrl);

  const cleanPhone = (orderData.customerPhone || '').replace(/\D/g, '').slice(-10);
  const trackTargetUrl = `${siteUrl}/track?orderId=${encodeURIComponent(orderData.orderId)}${cleanPhone ? `&phone=${encodeURIComponent(cleanPhone)}` : ''}`;
  const qrSvg = await generateQrSvg(trackTargetUrl, { size: 100, margin: 0 });

  const itemsSubtotal = itemsList.reduce((sum, it) => sum + (Number(it.price || it.subtotal || 0) * (it.qty || 1)), 0);
  const discountAmount = Number(orderData.discount || 0);
  const shippingCharge = orderData.shippingCharge !== undefined ? orderData.shippingCharge : Math.max(0, totalAmount - itemsSubtotal + discountAmount);

  const hasAwb = Boolean(
    orderData.trackingNumber &&
    !String(orderData.trackingNumber).startsWith('SHP-') &&
    !String(orderData.trackingNumber).includes('Pending')
  );

  const transactionId = orderData.paymentId || (orderData.orderId ? `TXN_${orderData.orderId.replace(/[^a-zA-Z0-9]/g, '')}` : 'TXN_ONLINE');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Bill of Supply — ${esc(invoiceNumber)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    html, body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #e2e8f0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Screen Toolbar */
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: #001b3a;
      color: #ffffff;
      padding: 10px 16px;
      display: flex;
      gap: 12px;
      justify-content: center;
      align-items: center;
      box-shadow: 0 4px 12px rgba(0,0,0,0.18);
    }
    .toolbar span { font-size: 13px; font-weight: 700; letter-spacing: 0.3px; }
    .toolbar button {
      background: #fbbf24;
      color: #001b3a;
      border: 0;
      font-weight: 800;
      font-size: 12px;
      padding: 7px 16px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.2s;
    }
    .toolbar button:hover { background: #f59e0b; }

    /* A4 Document Container */
    .a4-page-wrapper {
      width: 210mm;
      min-height: 297mm;
      margin: 18px auto;
      background: #ffffff;
      box-shadow: 0 10px 30px rgba(0,0,0,0.12);
      border-radius: 6px;
      padding: 7mm 9mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      position: relative;
    }

    /* Top Accent Line */
    .top-brand-stripe {
      height: 4px;
      background: linear-gradient(90deg, #0044aa 0%, #0284c7 50%, #002952 100%);
      border-radius: 2px;
      margin-bottom: 7px;
    }

    /* Header Section */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 7px;
    }
    .brand-col {
      vertical-align: top;
      width: 63%;
    }
    .brand-flex {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }
    .official-logo-img {
      width: 52px;
      height: 52px;
      object-fit: contain;
      border-radius: 50%;
      border: 1.5px solid #0284c7;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      flex-shrink: 0;
    }
    .brand-name {
      font-size: 20px;
      font-weight: 900;
      color: #001b3a;
      letter-spacing: 0.6px;
      line-height: 1.1;
    }
    .brand-sub {
      font-size: 10.5px;
      font-weight: 800;
      color: #0044aa;
      letter-spacing: 1.5px;
      margin-top: 2px;
    }
    .brand-address {
      font-size: 9.5px;
      color: #475569;
      margin-top: 2px;
      font-weight: 500;
      line-height: 1.3;
    }
    .brand-contact-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 4px;
      font-size: 9px;
      font-weight: 700;
      color: #0044aa;
    }

    .doc-type-col {
      vertical-align: top;
      width: 37%;
      text-align: right;
    }
    .doc-type-title {
      font-size: 22px;
      font-weight: 900;
      color: #002952;
      letter-spacing: 0.5px;
      line-height: 1;
    }
    .doc-type-subtitle {
      font-size: 8px;
      font-weight: 800;
      color: #64748b;
      letter-spacing: 0.8px;
      margin-top: 3px;
      text-transform: uppercase;
    }
    
    .invoice-meta-box {
      margin-top: 6px;
      display: inline-block;
      text-align: left;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 6px 10px;
      min-width: 185px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      line-height: 1.5;
    }
    .meta-label {
      color: #475569;
      font-weight: 700;
      width: 65px;
    }
    .meta-sep {
      color: #94a3b8;
      margin-right: 6px;
    }
    .meta-value {
      color: #001b3a;
      font-weight: 800;
      font-family: ui-monospace, SFMono-Regular, monospace;
      text-align: right;
    }

    /* Sub-header Categories Strip */
    .categories-strip {
      background: #f0f7ff;
      border: 1px solid #e0e7ff;
      border-radius: 6px;
      padding: 3.5px 8px;
      font-size: 8px;
      font-weight: 800;
      color: #0044aa;
      letter-spacing: 1px;
      text-align: center;
      margin-bottom: 9px;
      text-transform: uppercase;
    }

    /* Cards Grid (Billed To + Delivery Info) */
    .party-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
      margin-bottom: 9px;
    }
    .party-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
    }
    .party-card-header {
      background: #eef2f6;
      border-bottom: 1px solid #cbd5e1;
      padding: 5px 9px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 9px;
      font-weight: 900;
      color: #002952;
      letter-spacing: 0.6px;
      text-transform: uppercase;
    }
    .party-card-body {
      padding: 7px 9px;
      font-size: 10px;
      color: #334155;
      line-height: 1.4;
    }
    .customer-name {
      font-size: 12px;
      font-weight: 900;
      color: #001b3a;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .customer-phone {
      margin-top: 4px;
      font-weight: 800;
      color: #0044aa;
      font-size: 10.5px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 3.5px;
      font-size: 9.5px;
    }
    .info-label {
      color: #64748b;
      font-weight: 700;
    }
    .info-val {
      font-weight: 800;
      color: #0f172a;
      text-align: right;
    }
    .badge-success {
      background: #dcfce7;
      color: #15803d;
      border: 1px solid #bbf7d0;
      padding: 1.5px 7px;
      border-radius: 12px;
      font-size: 9px;
      font-weight: 800;
    }
    .badge-blue {
      background: #e0f2fe;
      color: #0369a1;
      border: 1px solid #bae6fd;
      padding: 1.5px 7px;
      border-radius: 12px;
      font-size: 9px;
      font-weight: 800;
    }

    /* Goods Table */
    .goods-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 9px;
      font-size: 10px;
    }
    .goods-table th {
      background: #002952;
      color: #ffffff;
      padding: 7px 8px;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 8.5px;
      letter-spacing: 0.5px;
      border: 1px solid #002952;
    }
    .goods-table td {
      padding: 7px 8px;
      border: 1px solid #cbd5e1;
      vertical-align: middle;
    }
    .goods-table tbody tr:nth-child(even) {
      background: #f8fafc;
    }
    .item-title {
      font-weight: 800;
      color: #0f172a;
      font-size: 10.5px;
    }
    .item-sub {
      font-size: 8px;
      color: #64748b;
      margin-top: 1px;
    }
    .badge-medium {
      display: inline-block;
      font-size: 7.5px;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 4px;
      background: #e0f2fe;
      color: #0284c7;
      margin-right: 4px;
    }
    .tax-exempt-tag {
      color: #16a34a;
      font-weight: 800;
      font-size: 9px;
    }

    /* Middle Summary & Amounts Section */
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
      margin-bottom: 9px;
    }
    .words-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .box-header-sm {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 9px;
      font-weight: 900;
      color: #002952;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .words-val {
      font-size: 12px;
      font-weight: 900;
      color: #001b3a;
      margin: 3px 0;
      line-height: 1.3;
    }
    .exemption-clause {
      font-size: 7.5px;
      color: #64748b;
      line-height: 1.35;
      margin-top: 4px;
    }

    .order-summary-box {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      background: #ffffff;
    }
    .summary-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5px;
    }
    .summary-table td {
      padding: 4px 9px;
      border-bottom: 1px solid #e2e8f0;
    }
    .summary-total-strip {
      background: #002952;
      color: #ffffff;
      font-weight: 900;
      font-size: 12px;
    }
    .summary-total-strip td {
      padding: 7px 9px;
      border-bottom: 0;
    }

    /* Full-Width Payment Confirmation Strip */
    .payment-bar {
      background: #f0f7ff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 6px 12px;
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 10px;
      align-items: center;
      margin-bottom: 9px;
      font-size: 9px;
    }
    .pay-col {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pay-col-title {
      font-size: 8px;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
    }
    .pay-col-val {
      font-size: 10px;
      font-weight: 800;
      color: #001b3a;
    }

    /* Footer: QR + Terms + Signatory */
    .footer-grid {
      display: grid;
      grid-template-columns: 100px 1fr 180px;
      gap: 12px;
      align-items: stretch;
      margin-bottom: 9px;
    }
    .qr-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 6px;
      text-align: center;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .qr-card svg {
      width: 68px;
      height: 68px;
      display: block;
      margin: 0 auto;
    }
    .qr-card-title {
      font-size: 8px;
      font-weight: 900;
      color: #002952;
      margin-top: 3px;
    }
    .qr-card-sub {
      font-size: 6.5px;
      color: #64748b;
      line-height: 1.1;
      margin-top: 1px;
    }

    .terms-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 7px 9px;
      background: #f8fafc;
      font-size: 8px;
      color: #475569;
      line-height: 1.4;
    }
    .terms-list {
      margin-left: 12px;
      margin-top: 3px;
    }
    .terms-list li { margin-bottom: 1.5px; }

    .signatory-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 7px 9px;
      text-align: center;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .sig-for {
      font-size: 8px;
      font-weight: 800;
      color: #002952;
      text-transform: uppercase;
    }
    .sig-blank-area {
      height: 48px;
      width: 100%;
    }
    .sig-line {
      border-top: 1.5px solid #002952;
      padding-top: 4px;
      font-size: 8.5px;
      font-weight: 900;
      color: #002952;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    /* 3 Feature Trust Badges */
    .trust-strip {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 7px;
    }
    .trust-pill {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 5px 8px;
      display: flex;
      align-items: center;
      gap: 7px;
      background: #f8fafc;
    }
    .trust-pill-icon {
      width: 20px;
      height: 20px;
      color: #0044aa;
      flex-shrink: 0;
    }
    .trust-pill-text {
      font-size: 8.5px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
    }
    .trust-pill-sub {
      font-size: 7px;
      font-weight: 500;
      color: #64748b;
    }

    /* Bottom Dark Navy Ribbon */
    .bottom-ribbon {
      background: linear-gradient(90deg, #001b3a 0%, #002952 100%);
      color: #ffffff;
      padding: 5px 12px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .thank-you-script {
      font-family: 'Caveat', 'Segoe Script', 'Brush Script MT', cursive;
      font-size: 16px;
      color: #ffffff;
      letter-spacing: 0.5px;
    }
    .ribbon-brand {
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #cbd5e1;
    }

    .cancel-banner {
      background: #fee2e2;
      border: 2px solid #ef4444;
      color: #991b1b;
      padding: 6px;
      text-align: center;
      font-weight: 900;
      font-size: 11px;
      border-radius: 6px;
      margin-bottom: 8px;
    }

    /* Print Rules: Engineered for EXACTLY 1 A4 SHEET */
    @media print {
      html, body {
        width: 210mm !important;
        height: 297mm !important;
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .toolbar { display: none !important; }
      .a4-page-wrapper {
        width: 210mm !important;
        height: 297mm !important;
        max-height: 297mm !important;
        margin: 0 !important;
        padding: 6mm 8mm !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        page-break-after: avoid !important;
        page-break-inside: avoid !important;
        overflow: hidden !important;
      }
      @page {
        size: A4 portrait;
        margin: 0;
      }
    }
  </style>
</head>
<body>

  <div class="toolbar">
    <span>🖨️ Bill of Supply: #${esc(invoiceNumber)} (${esc(orderData.customerName || 'Customer')})</span>
    <button type="button" onclick="window.print()">Print / Save as PDF</button>
  </div>

  <div class="a4-page-wrapper">
    <div>
      <div class="top-brand-stripe"></div>

      ${cancelled ? '<div class="cancel-banner">⚠️ ORDER CANCELLED — BILL OF SUPPLY VOIDED / GOODS RELEASED</div>' : ''}

      <!-- Top Header -->
      <table class="header-table">
        <tr>
          <td class="brand-col">
            <div class="brand-flex">
              <!-- Official Crowned-B Blessing Power Guide Logo -->
              <img src="${logoSrc}" alt="Blessing Power Guide" class="official-logo-img" />
              <div>
                <div class="brand-name">BLESSING POWER GUIDE</div>
                <div class="brand-sub">${esc(legalName).toUpperCase()}</div>
                <div class="brand-address">Trust Square, Ayanavaram, Chennai - 600012, Tamil Nadu, India</div>
                <div class="brand-address">${esc(gstinLine || 'State: Tamil Nadu (Code: 33)')}</div>
                <div class="brand-contact-pills">
                  <span>📞 +91 94860 17820 / +91 63829 63350</span>
                  <span>✉️ blessingpowerguide@gmail.com</span>
                </div>
              </div>
            </div>
          </td>

          <td class="doc-type-col">
            <div class="doc-type-title">BILL OF SUPPLY</div>
            <div class="doc-type-subtitle">(COMPOSITION / GST EXEMPT SUPPLIES)</div>
            <div class="invoice-meta-box">
              <div class="meta-row">
                <span class="meta-label">Invoice No</span><span class="meta-sep">:</span>
                <span class="meta-value">${esc(invoiceNumber)}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Order ID</span><span class="meta-sep">:</span>
                <span class="meta-value">#${esc(orderData.orderId)}</span>
              </div>
              <div class="meta-row">
                <span class="meta-label">Date</span><span class="meta-sep">:</span>
                <span class="meta-value">${esc(dateStr)}</span>
              </div>
            </div>
          </td>
        </tr>
      </table>

      <!-- Categories Ribbon Strip -->
      <div class="categories-strip">
        BOOKS &nbsp;|&nbsp; STUDY MATERIALS &nbsp;|&nbsp; GUIDE BOOKS &nbsp;|&nbsp; EDUCATIONAL RESOURCES
      </div>

      <!-- Party & Delivery Information Cards -->
      <div class="party-grid">
        <!-- Billed & Shipped To -->
        <div class="party-card">
          <div class="party-card-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0044aa" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span>BILLED &amp; SHIPPED TO (STUDENT / PARENT)</span>
          </div>
          <div class="party-card-body">
            <div class="customer-name">${esc(orderData.customerName || 'Student Customer')}</div>
            <div>${esc(orderData.address || 'Doorstep Delivery')}</div>
            <div><strong>${esc(orderData.city || 'Chennai')}</strong> — ${esc(orderData.pincode || '600001')}</div>
            <div>${esc(orderData.state || 'Tamil Nadu')}, India</div>
            <div class="customer-phone">
              <span>☎ +91 ${esc(orderData.customerPhone || '—')}</span>
              ${orderData.customerAltPhone ? `<span style="color:#64748b;font-weight:600;">· Alt: +91 ${esc(orderData.customerAltPhone)}</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Order & Delivery Information -->
        <div class="party-card">
          <div class="party-card-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#0044aa" stroke-width="2.5"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
            <span>ORDER &amp; DELIVERY INFORMATION</span>
          </div>
          <div class="party-card-body">
            <div class="info-row">
              <span class="info-label">Order ID:</span>
              <span class="info-val" style="font-family:monospace;">#${esc(orderData.orderId)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Order Date:</span>
              <span class="info-val">${esc(dateStr)}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Payment Mode:</span>
              <span class="info-val">${esc(orderData.paymentMethod || 'Razorpay UPI / Online')}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Payment Status:</span>
              <span class="badge-success">✓ Payment Confirmed</span>
            </div>
            <div style="border-top:1px dashed #cbd5e1;margin:3px 0 4px 0;"></div>
            <div class="info-row">
              <span class="info-label">Courier Partner:</span>
              <span class="info-val">${esc(orderData.courierName || 'ST Courier Express')}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Tracking ID:</span>
              <span class="info-val" style="font-family:monospace;color:#0044aa;">${esc(orderData.trackingNumber || 'Pending AWB Assignment')}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Current Status:</span>
              <span class="badge-blue">${hasAwb ? 'Dispatched' : 'Pending AWB Assignment'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Description of Educational Goods Table -->
      <table class="goods-table">
        <thead>
          <tr>
            <th style="width:32px;text-align:center;">#</th>
            <th style="text-align:left;">DESCRIPTION OF EDUCATIONAL GOODS</th>
            <th style="width:85px;text-align:center;">HSN / SAC</th>
            <th style="width:45px;text-align:center;">QTY</th>
            <th style="width:105px;text-align:right;">UNIT PRICE (₹)</th>
            <th style="width:95px;text-align:center;">TAX STATUS</th>
            <th style="width:110px;text-align:right;">AMOUNT (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${itemsList.map((item: any, idx: number) => {
            const unitPrice = Number(item.price || item.subtotal || 0);
            const qty = Number(item.qty || 1);
            const lineTotal = unitPrice * qty;
            return `
            <tr>
              <td style="text-align:center;color:#64748b;font-weight:700;">${idx + 1}</td>
              <td>
                <div class="item-title">${esc(item.title || 'Educational Guide Book')}</div>
                <div class="item-sub">
                  ${item.medium ? `<span class="badge-medium">${esc(item.medium)}</span>` : ''}
                  Tamil Nadu Samacheer Kalvi / CBSE Syllabus Guide
                </div>
              </td>
              <td style="text-align:center;font-family:monospace;font-weight:800;color:#475569;">${esc(item.hsn || '4901')}</td>
              <td style="text-align:center;font-weight:900;">${qty}</td>
              <td style="text-align:right;font-family:monospace;">₹${unitPrice.toFixed(2)}</td>
              <td style="text-align:center;" class="tax-exempt-tag">0% (Exempt)</td>
              <td style="text-align:right;font-family:monospace;font-weight:900;color:#001b3a;">₹${lineTotal.toFixed(2)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <!-- Middle Summary & Amounts Section -->
      <div class="summary-grid">
        <!-- Amount In Words Box -->
        <div class="words-box">
          <div>
            <div class="box-header-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0044aa" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M8 7h8m-8 4h8M8 15h5"/></svg>
              <span>AMOUNT IN WORDS</span>
            </div>
            <div class="words-val">${esc(wordsAmount)}</div>
          </div>
          <div class="exemption-clause">
            * Printed Books and School Study Materials are exempt from GST under HSN Code 4901 as per Notification No. 2/2017-Central Tax (Rate).
          </div>
        </div>

        <!-- Order Summary Box -->
        <div class="order-summary-box">
          <div class="box-header-sm" style="padding:5px 9px;border-bottom:1px solid #cbd5e1;background:#f8fafc;margin-bottom:0;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0044aa" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <span>ORDER SUMMARY</span>
          </div>
          <table class="summary-table">
            <tbody>
              <tr>
                <td style="color:#64748b;font-weight:600;">Items Subtotal:</td>
                <td style="text-align:right;font-weight:800;font-family:monospace;">₹${itemsSubtotal.toFixed(2)}</td>
              </tr>
              ${discountAmount > 0 ? `
              <tr>
                <td style="color:#16a34a;font-weight:700;">Special Discount / Coupon:</td>
                <td style="text-align:right;font-weight:800;font-family:monospace;color:#16a34a;">-₹${discountAmount.toFixed(2)}</td>
              </tr>` : ''}
              <tr>
                <td style="color:#64748b;font-weight:600;">Delivery Charge (ST Courier):</td>
                <td style="text-align:right;font-weight:800;color:${shippingCharge === 0 ? '#16a34a' : '#0f172a'};">
                  ${shippingCharge === 0 ? 'FREE (Free Delivery Offer)' : `₹${shippingCharge.toFixed(2)}`}
                </td>
              </tr>
              <tr>
                <td style="color:#64748b;font-weight:600;">GST (0% Exempt - HSN 4901):</td>
                <td style="text-align:right;font-weight:800;color:#16a34a;">₹0.00</td>
              </tr>
              <tr class="summary-total-strip">
                <td>TOTAL AMOUNT PAYABLE:</td>
                <td style="text-align:right;font-family:monospace;font-size:14px;">₹${totalAmount.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Payment Confirmation Full-Width Strip -->
      <div class="payment-bar">
        <div class="pay-col">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div>
            <div class="pay-col-title">PAYMENT STATUS</div>
            <div class="pay-col-val" style="color:#15803d;">Payment Confirmed</div>
          </div>
        </div>

        <div class="pay-col">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0044aa" stroke-width="2.2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
          <div>
            <div class="pay-col-title">Payment Mode</div>
            <div class="pay-col-val">${esc(orderData.paymentMethod || 'Razorpay UPI / Online')}</div>
          </div>
        </div>

        <div class="pay-col">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0044aa" stroke-width="2.2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <div>
            <div class="pay-col-title">Transaction ID</div>
            <div class="pay-col-val" style="font-family:monospace;font-size:9.5px;">${esc(transactionId)}</div>
          </div>
        </div>
      </div>

      <!-- Footer Grid: QR Code + Terms + Authorized Signatory (Clean Blank Area) -->
      <div class="footer-grid">
        <!-- QR Code -->
        <div class="qr-card">
          ${qrSvg ? qrSvg : ''}
          <div class="qr-card-title">TRACK ORDER</div>
          <div class="qr-card-sub">Scan this QR code to track your order status</div>
        </div>

        <!-- Terms & Conditions -->
        <div class="terms-card">
          <div class="box-header-sm" style="margin-bottom:2px;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0044aa" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/></svg>
            <span>TERMS &amp; CONDITIONS</span>
          </div>
          <ol class="terms-list">
            <li>All study guides are for educational reference and syllabus guidance.</li>
            <li>In case of damaged or misprinted copies, replacement requests are accepted within 7 days.</li>
            <li>Products are supplied under GST Exemption (HSN 4901).</li>
            <li>Delivery timelines are as per courier partner and may vary by location.</li>
            <li>Subject to Chennai jurisdiction. Computer generated Bill of Supply.</li>
          </ol>
        </div>

        <!-- Authorized Signatory (Clean Blank Sign Space) -->
        <div class="signatory-card">
          <div class="sig-for">For ${esc(OFFICE_COMPANY_NAME)}</div>
          <div class="sig-blank-area"></div>
          <div class="sig-line">Authorized Signatory</div>
        </div>
      </div>
    </div>

    <div>
      <!-- 3 Trust Badges Strip -->
      <div class="trust-strip">
        <div class="trust-pill">
          <svg class="trust-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <div>
            <div class="trust-pill-text">Quality Educational Books</div>
            <div class="trust-pill-sub">For a Brighter Future</div>
          </div>
        </div>

        <div class="trust-pill">
          <svg class="trust-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          <div>
            <div class="trust-pill-text">Safe &amp; Fast Delivery</div>
            <div class="trust-pill-sub">Across India</div>
          </div>
        </div>

        <div class="trust-pill">
          <svg class="trust-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
          <div>
            <div class="trust-pill-text">Trusted by Students &amp; Parents</div>
            <div class="trust-pill-sub">Your Learning Partner</div>
          </div>
        </div>
      </div>

      <!-- Bottom Dark Navy Ribbon -->
      <div class="bottom-ribbon">
        <span class="thank-you-script">Thank You for Your Order!</span>
        <span class="ribbon-brand">BLESSING POWER GUIDE &nbsp;·&nbsp; BLESSING PATHWAY EDUCATION</span>
      </div>
    </div>
  </div>

</body>
</html>`;
}

export async function downloadTaxInvoice(orderData: InvoiceData): Promise<void> {
  const htmlContent = await generateTaxInvoiceHtml(orderData);
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}
