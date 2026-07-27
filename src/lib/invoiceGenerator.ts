export function generateTaxInvoiceHtml(orderData: {
  orderId: string;
  customerName: string;
  customerPhone: string;
  address?: string;
  city?: string;
  pincode?: string;
  totalAmount: number;
  paymentMethod: string;
  items?: any[];
  trackingNumber?: string;
  courierName?: string;
  paymentStatus?: string;
  createdAt?: string;
}) {
  const dateStr = orderData.createdAt || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const itemsList = orderData.items && orderData.items.length > 0
    ? orderData.items
    : [{ title: '10th Standard Mathematics Exam Power Guide Book', qty: 1, price: 360 }];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>TAX INVOICE — ${orderData.orderId}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1e293b; margin: 0; padding: 40px; background: #fff; }
    .invoice-card { max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 32px; border-radius: 16px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #001b3a; padding-bottom: 20px; margin-bottom: 24px; }
    .brand { font-size: 24px; font-weight: 900; color: #001b3a; letter-spacing: 0.5px; }
    .subbrand { font-size: 11px; color: #64748b; font-weight: 700; margin-top: 4px; }
    .invoice-title { font-size: 20px; font-weight: 900; color: #0284c7; text-transform: uppercase; text-align: right; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; font-size: 12px; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 12px; }
    .box-title { font-weight: 800; text-transform: uppercase; font-size: 10px; color: #64748b; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }
    th { background: #001b3a; color: #ffffff; text-align: left; padding: 10px 12px; font-weight: 800; border-radius: 4px; }
    td { padding: 12px; border-bottom: 1px solid #e2e8f0; }
    .total-row { font-weight: 900; font-size: 14px; background: #f1f5f9; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #64748b; text-align: center; }
    .toolbar { position: sticky; top: 0; background: #001b3a; color: #fff; padding: 12px 20px; display: flex; gap: 12px; justify-content: center; align-items: center; z-index: 10; }
    .toolbar button { background: #fbbf24; color: #001b3a; border: 0; font-weight: 800; font-size: 12px; padding: 8px 16px; border-radius: 8px; cursor: pointer; }
    @media print { .toolbar { display: none !important; } body { padding: 0; } .invoice-card { border: none; } }
  </style>
</head>
<body>
  <div class="toolbar">
    <span style="font-size:12px;font-weight:700;">Invoice ${orderData.orderId}</span>
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="invoice-card">
    <div class="header">
      <div>
        <div class="brand">BLESSING POWER GUIDE</div>
        <div class="subbrand">Official Tamil Nadu State Board & CBSE Exam Prep Guides</div>
        <div style="font-size: 11px; color: #475569; margin-top: 4px;">GSTIN: 33AAAC1234F1Z9 | Reg: Chennai, Tamil Nadu</div>
      </div>
      <div>
        <div class="invoice-title">OFFICIAL TAX INVOICE</div>
        <div style="font-size: 12px; font-weight: 800; color: #0f172a; margin-top: 4px;">Invoice #${orderData.orderId}</div>
        <div style="font-size: 11px; color: #64748b;">Date: ${dateStr}</div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="box">
        <div class="box-title">Billed & Shipped To</div>
        <div style="font-weight: 800; font-size: 14px; color: #0f172a;">${orderData.customerName}</div>
        <div style="margin-top: 4px;">${orderData.address}</div>
        <div>${orderData.city}${orderData.pincode ? ` - ${orderData.pincode}` : ''}</div>
        <div style="font-weight: 700; margin-top: 6px; color: #0284c7;">Phone: ${orderData.customerPhone}</div>
      </div>

      <div class="box">
        <div class="box-title">Logistics & Payment Info</div>
        <div><strong>Courier Partner:</strong> ${orderData.courierName || 'ST Courier Express'}</div>
        <div><strong>Docket Number:</strong> ${orderData.trackingNumber || 'Pending AWB Assignment'}</div>
        <div><strong>Payment Method:</strong> ${orderData.paymentMethod}</div>
        <div style="margin-top: 6px; color: #16a34a; font-weight: 800;">Status: ${orderData.paymentStatus || 'PAID'}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item Description</th>
          <th>HSN Code</th>
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
            <td>4901.10</td>
            <td>${item.qty || 1}</td>
            <td>₹${item.price}</td>
            <td><strong>₹${(item.price * (item.qty || 1)).toFixed(2)}</strong></td>
          </tr>
        `
          )
          .join('')}
        <tr class="total-row">
          <td colspan="4" style="text-align: right;">GRAND TOTAL (INCL. GST):</td>
          <td style="color: #001b3a;">₹${orderData.totalAmount.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">
      <p>Thank you for studying with <strong>Blessing Power Guide</strong>! Wish you 100% success in your exams!</p>
      <p>For questions or bulk school orders, contact blessingpowerguide@gmail.com | +91 98404 18228</p>
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
