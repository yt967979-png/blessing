import { formatGstinLine, getShopInvoiceAddress, getShopLegalName } from '@/lib/shopConfig';
import { OFFICE_ADDRESS_LINES, OFFICE_COMPANY_NAME } from '@/lib/officeLocation';

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

/**
 * Atomically allocates the next sequential invoice number for the financial year.
 * Executes inside PostgreSQL transaction: BPG/26-27/00001, BPG/26-27/00002, etc.
 */
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
  items?: Array<{ title?: string; qty?: number; price?: number; subtotal?: number; hsn?: string }>;
  trackingNumber?: string;
  courierName?: string;
  paymentStatus?: string;
  orderStatus?: string;
  courierStatus?: string;
  createdAt?: string;
  paymentId?: string;
  shippingCharge?: number;
}

/**
 * Generates an official, GST-compliant BILL OF SUPPLY for printed books (HSN 4901, 0% GST Exempt).
 * Sized for standard A4 document printing or browser print-to-PDF.
 */
export function generateTaxInvoiceHtml(orderData: InvoiceData): string {
  const dateStr = orderData.createdAt
    ? new Date(orderData.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  const invoiceNumber = formatGstInvoiceNumber(orderData.orderId, orderData.createdAt, orderData.invoiceNumber);
  const itemsList = orderData.items && orderData.items.length > 0
    ? orderData.items
    : [{ title: 'Educational Guide Book', qty: 1, price: orderData.totalAmount, hsn: '4901' }];

  const cancelled = String(orderData.orderStatus || orderData.courierStatus || '').toLowerCase().includes('cancel');
  const totalAmount = Number(orderData.totalAmount || 0);
  const wordsAmount = numberToIndianRupeesWords(totalAmount);
  const gstinLine = formatGstinLine();
  const legalName = getShopLegalName();
  const addressLine = getShopInvoiceAddress();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.com';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&data=${encodeURIComponent(`${siteUrl}/track?orderId=${encodeURIComponent(orderData.orderId)}`)}`;

  const itemsSubtotal = itemsList.reduce((sum, it) => sum + (Number(it.price || it.subtotal || 0) * (it.qty || 1)), 0);
  const shippingCharge = orderData.shippingCharge !== undefined ? orderData.shippingCharge : Math.max(0, totalAmount - itemsSubtotal);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Bill of Supply — ${esc(invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #f8fafc;
      padding: 24px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 50;
      background: #001b3a;
      color: #ffffff;
      padding: 12px 20px;
      display: flex;
      gap: 12px;
      justify-content: center;
      align-items: center;
      border-radius: 12px;
      max-width: 860px;
      margin: 0 auto 20px auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .toolbar button {
      background: #fbbf24;
      color: #001b3a;
      border: 0;
      font-weight: 800;
      font-size: 12px;
      padding: 8px 18px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .invoice-card {
      max-width: 860px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 16px;
      padding: 36px 40px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.05);
    }
    .cancel-banner {
      background: #fef2f2;
      border: 2px solid #991b1b;
      color: #991b1b;
      text-align: center;
      font-weight: 900;
      font-size: 13px;
      padding: 12px;
      border-radius: 10px;
      margin-bottom: 24px;
      letter-spacing: 1px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #001b3a;
      padding-bottom: 20px;
      margin-bottom: 24px;
      gap: 20px;
    }
    .brand-title {
      font-size: 22px;
      font-weight: 900;
      color: #001b3a;
      letter-spacing: -0.5px;
    }
    .legal-sub {
      font-size: 12px;
      font-weight: 700;
      color: #334155;
      margin-top: 3px;
    }
    .doc-type-box {
      text-align: right;
    }
    .doc-type-title {
      font-size: 22px;
      font-weight: 900;
      color: #2874f0;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .doc-type-sub {
      font-size: 9px;
      font-weight: 700;
      color: #64748b;
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .inv-meta-line {
      font-size: 12px;
      color: #0f172a;
      margin-top: 4px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-weight: 700;
    }
    .party-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
    }
    .party-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
    }
    .party-box-title {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      margin-bottom: 8px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .party-name {
      font-size: 14px;
      font-weight: 900;
      color: #0f172a;
      text-transform: uppercase;
    }
    .party-addr {
      font-size: 12px;
      color: #334155;
      margin-top: 4px;
      line-height: 1.45;
    }
    .party-phone {
      font-size: 12px;
      font-weight: 800;
      color: #2874f0;
      margin-top: 6px;
    }
    .goods-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 12px;
    }
    .goods-table th {
      background: #001b3a;
      color: #ffffff;
      padding: 10px 12px;
      font-weight: 800;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
    }
    .goods-table td {
      padding: 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .amount-box {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 20px;
      margin-bottom: 24px;
      align-items: start;
    }
    .words-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
    }
    .words-lbl {
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      margin-bottom: 4px;
    }
    .words-val {
      font-size: 12px;
      font-weight: 800;
      color: #0f172a;
      font-style: italic;
    }
    .totals-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .totals-table td {
      padding: 6px 10px;
      border-bottom: 1px solid #f1f5f9;
    }
    .grand-total-row {
      background: #f1f5f9;
      border-top: 2px solid #001b3a;
      font-size: 15px;
      font-weight: 900;
      color: #001b3a;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 100px 1fr 180px;
      gap: 16px;
      align-items: center;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      margin-top: 20px;
    }
    .qr-box {
      text-align: center;
    }
    .qr-box img {
      width: 80px;
      height: 80px;
      display: block;
      margin: 0 auto;
    }
    .terms-box {
      font-size: 10px;
      color: #64748b;
      line-height: 1.5;
    }
    .sig-box {
      text-align: center;
      border-left: 1px solid #e2e8f0;
      padding-left: 16px;
    }
    .sig-for {
      font-size: 10px;
      font-weight: 800;
      color: #001b3a;
      margin-bottom: 36px;
    }
    .sig-title {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      border-top: 1px solid #94a3b8;
      padding-top: 4px;
    }

    @media print {
      body { background: #ffffff; padding: 0; }
      .toolbar { display: none !important; }
      .invoice-card { border: none; box-shadow: none; padding: 0; }
      @page { size: A4 portrait; margin: 12mm 15mm; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span style="font-size:12px;font-weight:700;">Bill of Supply: ${esc(invoiceNumber)}</span>
    <button type="button" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>

  <div class="invoice-card">
    ${cancelled ? '<div class="cancel-banner">⚠️ ORDER CANCELLED — BILL OF SUPPLY VOIDED / GOODS RELEASED</div>' : ''}

    {/* Header */}
    <div class="header">
      <div>
        <div class="brand-title">BLESSING POWER GUIDE</div>
        <div class="legal-sub">${esc(legalName)}</div>
        <div style="font-size:11px;color:#475569;margin-top:3px;">${esc(addressLine)}</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">
          ${gstinLine ? `${esc(gstinLine)} · ` : ''}State: Tamil Nadu (Code: 33)
        </div>
        <div style="font-size:11px;color:#2874f0;font-weight:700;margin-top:2px;">
          ☎ +91 98404 18228 · blessingpowerguide@gmail.com
        </div>
      </div>

      <div class="doc-type-box">
        <div class="doc-type-title">BILL OF SUPPLY</div>
        <div class="doc-type-sub">(Composition / GST Exempt Supplies)</div>
        <div class="inv-meta-line" style="margin-top:8px;">Doc #: ${esc(invoiceNumber)}</div>
        <div class="inv-meta-line" style="color:#64748b;font-size:11px;">Order Ref: #${esc(orderData.orderId)}</div>
        <div class="inv-meta-line" style="color:#64748b;font-size:11px;">Date: ${esc(dateStr)}</div>
      </div>
    </div>

    {/* Party Info */}
    <div class="party-grid">
      <div class="party-box">
        <div class="party-box-title">Billed &amp; Shipped To (Student / Parent)</div>
        <div class="party-name">${esc(orderData.customerName || 'Student Customer')}</div>
        <div class="party-addr">
          ${esc(orderData.address || 'Doorstep Delivery')}<br>
          ${esc(orderData.city || 'Chennai')}${orderData.pincode ? ` — ${esc(orderData.pincode)}` : ''}<br>
          ${esc(orderData.state || 'Tamil Nadu')}, India
        </div>
        <div class="party-phone">
          ☎ +91 ${esc(orderData.customerPhone || '—')}${orderData.customerAltPhone ? ` · Alt: +91 ${esc(orderData.customerAltPhone)}` : ''}
        </div>
      </div>

      <div class="party-box">
        <div class="party-box-title">Logistics &amp; Payment Settlement</div>
        <div style="font-size:12px;color:#334155;line-height:1.6;">
          <div><strong>Courier Partner:</strong> ${esc(orderData.courierName || 'ST Courier Express')}</div>
          <div><strong>Tracking / Docket:</strong> <span style="font-family:ui-monospace,monospace;font-weight:700;color:#2874f0;">${esc(orderData.trackingNumber || 'Pending Dispatch')}</span></div>
          <div><strong>Payment Mode:</strong> ${esc(orderData.paymentMethod || 'Online (Razorpay / UPI)')}</div>
          ${orderData.paymentId ? `<div><strong>Txn ID:</strong> <span style="font-family:ui-monospace,monospace;">${esc(orderData.paymentId)}</span></div>` : ''}
          <div><strong>Payment Status:</strong> <span style="font-weight:800;color:${cancelled ? '#991b1b' : '#16a34a'};">${esc(orderData.paymentStatus || 'PAID')}</span></div>
        </div>
      </div>
    </div>

    {/* Itemized Goods Table */}
    <table class="goods-table">
      <thead>
        <tr>
          <th style="width:40px;" class="text-center">#</th>
          <th>Description of Educational Goods</th>
          <th style="width:90px;" class="text-center">HSN Code</th>
          <th style="width:60px;" class="text-center">Qty</th>
          <th style="width:110px;" class="text-right">Unit Rate (₹)</th>
          <th style="width:80px;" class="text-center">Tax Rate</th>
          <th style="width:120px;" class="text-right">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsList.map((item: any, idx: number) => {
          const unitPrice = Number(item.price || item.subtotal || 0);
          const qty = Number(item.qty || 1);
          const lineTotal = unitPrice * qty;
          return `
          <tr>
            <td class="text-center" style="color:#64748b;">${idx + 1}</td>
            <td>
              <strong style="color:#0f172a;">${esc(item.title || 'School Guide Book')}</strong>
              <div style="font-size:10px;color:#64748b;">Tamil Nadu Samacheer Kalvi / CBSE Syllabus Guide</div>
            </td>
            <td class="text-center" style="font-family:ui-monospace,monospace;font-weight:700;color:#475569;">${esc(item.hsn || '4901')}</td>
            <td class="text-center" style="font-weight:700;">${qty}</td>
            <td class="text-right font-mono">₹${unitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td class="text-center" style="font-size:10px;color:#16a34a;font-weight:700;">0% (Exempt)</td>
            <td class="text-right font-mono" style="font-weight:800;color:#0f172a;">₹${lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>

    {/* Totals & Words */}
    <div class="amount-box">
      <div class="words-box">
        <div class="words-lbl">Invoice Amount in Words</div>
        <div class="words-val">${esc(wordsAmount)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:8px;line-height:1.4;">
          *Printed Books and School Study Materials are exempt from GST under HSN Code 4901 as per Notification No. 1/2017-Central Tax (Rate).
        </div>
      </div>

      <table class="totals-table">
        <tbody>
          <tr>
            <td style="color:#64748b;">Items Subtotal:</td>
            <td class="text-right" style="font-weight:700;">₹${itemsSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
          <tr>
            <td style="color:#64748b;">Doorstep Delivery (ST Courier):</td>
            <td class="text-right" style="font-weight:700;color:${shippingCharge === 0 ? '#16a34a' : '#0f172a'};">
              ${shippingCharge === 0 ? 'FREE (5+ Books Offer)' : `₹${shippingCharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
            </td>
          </tr>
          <tr>
            <td style="color:#64748b;">GST (0% Exempt - HSN 4901):</td>
            <td class="text-right" style="font-weight:700;color:#16a34a;">₹0.00 (Exempt)</td>
          </tr>
          <tr class="grand-total-row">
            <td>TOTAL PAYABLE:</td>
            <td class="text-right">₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          </tr>
        </tbody>
      </table>
    </div>

    {/* Footer & Signature */}
    <div class="footer-grid">
      <div class="qr-box">
        <img src="${qrUrl}" alt="Track Order QR" />
        <div style="font-size:8px;font-weight:800;color:#001b3a;margin-top:4px;">SCAN TO TRACK</div>
      </div>

      <div class="terms-box">
        <strong>Terms &amp; Conditions:</strong><br>
        1. All study guides are for educational reference and syllabus guidance.<br>
        2. In case of damaged or misprinted copies, replacement requests are accepted within 7 days.<br>
        3. Subject to Chennai jurisdiction. Computer generated Bill of Supply.
      </div>

      <div class="sig-box">
        <div class="sig-for">For ${esc(OFFICE_COMPANY_NAME)}</div>
        <div class="sig-title">Authorized Signatory</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function downloadTaxInvoice(orderData: InvoiceData): void {
  const htmlContent = generateTaxInvoiceHtml(orderData);
  const printWindow = window.open('', '_blank', 'width=900,height=1100');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}
