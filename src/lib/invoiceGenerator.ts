import { formatGstinLine, getShopInvoiceAddress, getShopLegalName } from '@/lib/shopConfig';

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
 * Atomically allocates the next sequential GST tax invoice number for the financial year.
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

export function generateTaxInvoiceHtml(orderData: {
  orderId: string;
  invoiceNumber?: string | null;
  customerName: string;
  customerPhone: string;
  customerAltPhone?: string;
  address?: string;
  city?: string;
  pincode?: string;
  totalAmount: number;
  paymentMethod: string;
  items?: any[];
  trackingNumber?: string;
  courierName?: string;
  paymentStatus?: string;
  orderStatus?: string;
  courierStatus?: string;
  createdAt?: string;
}) {
  const dateStr = orderData.createdAt || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const invoiceNumber = formatGstInvoiceNumber(orderData.orderId, orderData.createdAt, orderData.invoiceNumber);
  const itemsList = orderData.items && orderData.items.length > 0
    ? orderData.items
    : [{ title: 'Study Guide Book', qty: 1, price: orderData.totalAmount }];
  const cancelled = String(orderData.orderStatus || orderData.courierStatus || '').toLowerCase().includes('cancel');

  const taxable = orderData.totalAmount / 1.05;
  const gst = orderData.totalAmount - taxable;
  const gstinLine = formatGstinLine();
  const legal = getShopLegalName();
  const addrLine = getShopInvoiceAddress();
  const statusColor = cancelled ? '#991b1b' : '#16a34a';
  const statusText = cancelled
    ? 'ORDER CANCELLED'
    : (orderData.paymentStatus || 'Pending');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>TAX INVOICE — ${invoiceNumber}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; margin: 0; padding: 40px; background: #fff; }
    .invoice-card { max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 32px; border-radius: 16px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #001b3a; padding-bottom: 20px; margin-bottom: 24px; }
    .brand { font-size: 24px; font-weight: 900; color: #001b3a; letter-spacing: 0.5px; }
    .subbrand { font-size: 11px; color: #64748b; font-weight: 700; margin-top: 4px; }
    .invoice-title { font-size: 20px; font-weight: 900; color: #0284c7; text-transform: uppercase; text-align: right; }
    .cancel-banner { background: #fef2f2; border: 2px solid #991b1b; color: #991b1b; text-align: center; font-weight: 900; padding: 12px; border-radius: 10px; margin-bottom: 20px; letter-spacing: 1px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; font-size: 12px; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; }
    .box-title { font-weight: 800; text-transform: uppercase; font-size: 10px; color: #64748b; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
    th { background: #001b3a; color: #ffffff; text-align: left; padding: 10px 12px; font-weight: 800; }
    td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
    .total-row { font-weight: 900; font-size: 13px; background: #f1f5f9; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #64748b; text-align: center; }
    .toolbar { position: sticky; top: 0; background: #001b3a; color: #fff; padding: 12px 20px; display: flex; gap: 12px; justify-content: center; align-items: center; z-index: 10; }
    .toolbar button { background: #fbbf24; color: #001b3a; border: 0; font-weight: 800; font-size: 12px; padding: 8px 16px; border-radius: 8px; cursor: pointer; }
    @media print { .toolbar { display: none !important; } body { padding: 0; } .invoice-card { border: none; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <span style="font-size:12px;font-weight:700;">Invoice ${invoiceNumber}</span>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="invoice-card">
    ${cancelled ? '<div class="cancel-banner">ORDER CANCELLED — NOT FOR COLLECTION / SHIPMENT</div>' : ''}
    <div class="header">
      <div style="display:flex;align-items:center;gap:12px;">
        <img src="/logo.png" alt="Blessing Power Guide" width="48" height="48" style="border-radius:12px;" />
        <div>
          <div class="brand">BLESSING POWER GUIDE</div>
          <div class="subbrand">${legal}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 4px;">${gstinLine}</div>
          <div style="font-size: 10px; color: #64748b;">${addrLine}</div>
        </div>
      </div>
      <div>
        <div class="invoice-title">TAX INVOICE</div>
        <div style="font-size: 13px; font-weight: 800; color: #0f172a; margin-top: 4px;">Invoice: ${invoiceNumber}</div>
        <div style="font-size: 11px; color: #475569;">Order Ref: #${orderData.orderId}</div>
        <div style="font-size: 11px; color: #64748b;">Date: ${dateStr}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="box">
        <div class="box-title">Billed & Shipped To</div>
        <div style="font-weight: 800; font-size: 14px; color: #0f172a;">${orderData.customerName}</div>
        <div style="margin-top: 4px;">${orderData.address || ''}</div>
        <div>${orderData.city || ''}${orderData.pincode ? ` - ${orderData.pincode}` : ''}</div>
        <div style="font-weight: 700; margin-top: 6px; color: #0284c7;">Phone: ${orderData.customerPhone}${
          orderData.customerAltPhone ? ` | Alt: ${orderData.customerAltPhone}` : ''
        }</div>
      </div>

      <div class="box">
        <div class="box-title">Logistics & Payment</div>
        <div><strong>Courier:</strong> ${cancelled ? 'N/A — Cancelled' : (orderData.courierName || 'ST Courier Express')}</div>
        <div><strong>AWB:</strong> ${cancelled ? 'N/A' : (orderData.trackingNumber || 'Pending')}</div>
        <div><strong>Payment:</strong> ${orderData.paymentMethod}</div>
        <div style="margin-top: 6px; color: ${statusColor}; font-weight: 800;">Status: ${statusText}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item (HSN 4901)</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsList
          .map(
            (item: any) => `
          <tr>
            <td><strong>${item.title}</strong></td>
            <td>${item.qty || 1}</td>
            <td>₹${Number(item.price).toFixed(2)}</td>
            <td><strong>₹${(Number(item.price) * (item.qty || 1)).toFixed(2)}</strong></td>
          </tr>
        `
          )
          .join('')}
        <tr>
          <td colspan="3" style="text-align:right;">Taxable value (approx, GST incl. in price)</td>
          <td>₹${taxable.toFixed(2)}</td>
        </tr>
        <tr>
          <td colspan="3" style="text-align:right;">GST component (illustrative 5% on books*)</td>
          <td>₹${gst.toFixed(2)}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3" style="text-align: right;">GRAND TOTAL:</td>
          <td style="color: #001b3a;">₹${Number(orderData.totalAmount).toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
    <p style="font-size:10px;color:#94a3b8;">*GST breakup is indicative for invoice clarity. Set SHOP_GSTIN in env for your registered GSTIN. Confirm tax treatment with your CA.</p>

    <div class="footer">
      <p>Thank you for studying with <strong>Blessing Power Guide</strong>!</p>
      <p>Support: +91 98404 18228 | blessingpowerguide@gmail.com</p>
    </div>
  </div>
</body>
</html>
  `;
}

export function downloadTaxInvoice(orderData: any) {
  const htmlContent = generateTaxInvoiceHtml(orderData);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  }
}
