const { Pool } = require('/opt/blessing/node_modules/pg');
const fs = require('fs');

const envFile = fs.readFileSync('/etc/blessing.env', 'utf8');
let dbUrl = '';
for (const line of envFile.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.substring(13).trim().replace(/^['"]|['"]$/g, '');
  }
}

const pool = new Pool({ connectionString: dbUrl });

function getFinancialYearString(date = new Date()) {
  const month = date.getMonth();
  const year = date.getFullYear();
  const startYear = month >= 3 ? year : year - 1;
  const endYear = (startYear + 1) % 100;
  return `${String(startYear).slice(-2)}-${String(endYear).padStart(2, '0')}`;
}

async function generateInvoiceNumber(client) {
  const fy = getFinancialYearString(new Date('2026-09-24T13:46:46.351Z'));
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
  } catch (e) {
    console.warn('Fallback invoice number:', e.message);
    return `BPG/${fy}/00001`;
  }
}

async function rescueOrder() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Check if order already exists for this payment or rzp order
    const existing = await client.query(
      "SELECT id, order_number FROM orders WHERE razorpay_payment_id = 'pay_TftZm1Qr3zgN62' OR razorpay_order_id = 'order_TftZSz6UHMM8Wu'"
    );
    if (existing.rows.length > 0) {
      console.log('Order already exists:', existing.rows[0]);
      await client.query('ROLLBACK');
      return;
    }

    const orderId = 'ord-1790257606351';
    const orderNumber = 'BPG-TFTZ-M1QR';
    const userId = 'usr-g-1790257137701';
    const addressId = 'addr-1790257243202-89hs';
    const totalAmount = 1300;
    const subtotal = 1300;
    const discount = 0;
    const shippingCharge = 0;
    const paymentMethod = 'Razorpay UPI';
    const paymentStatus = 'Payment Confirmed';
    const orderStatus = 'Confirmed';
    const razorpayOrderId = 'order_TftZSz6UHMM8Wu';
    const razorpayPaymentId = 'pay_TftZm1Qr3zgN62';
    const shipmentId = 'SHP-20260924-626772';
    const courierName = 'ST Courier Express';
    const paidAt = new Date('2026-09-24T13:46:46.351Z');

    const shippingAddressObj = JSON.stringify({
      name: 'Jo Princy',
      phone: '8098016112',
      alternatePhone: '9092052614',
      address: 'no:13, karumarriamman Kovil Street, thuvakudi malai, trichy',
      city: 'trichy',
      pincode: '620022'
    });

    const invoiceNumber = await generateInvoiceNumber(client);
    console.log('Allocated invoice number:', invoiceNumber);

    // 2. Insert order
    await client.query(
      `INSERT INTO orders (
        id, order_number, user_id, address_id, subtotal, discount, shipping_charge, total_amount,
        payment_method, payment_status, order_status, courier_name, shipment_id,
        shipping_address, razorpay_order_id, razorpay_payment_id, invoice_number,
        ordered_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $18, NOW()
      )`,
      [
        orderId,
        orderNumber,
        userId,
        addressId,
        subtotal,
        discount,
        shippingCharge,
        totalAmount,
        paymentMethod,
        paymentStatus,
        orderStatus,
        courierName,
        shipmentId,
        shippingAddressObj,
        razorpayOrderId,
        razorpayPaymentId,
        invoiceNumber,
        paidAt
      ]
    );
    console.log('Inserted order:', orderId, orderNumber);

    // 3. Insert order item
    const itemId = 'item-1790257606351';
    await client.query(
      `INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        itemId,
        orderId,
        'bpg-1790146297047',
        '10TH STD 5 IN 1 GUIDE COMBO',
        1300,
        1,
        1300
      ]
    );
    console.log('Inserted order item:', itemId);

    // 4. Update payments table from ORPHAN_CAPTURED to SUCCESS and link order_id
    const payRes = await client.query(
      `UPDATE payments 
       SET order_id = $1, status = 'SUCCESS'
       WHERE payment_id = $2
       RETURNING *`,
      [orderId, razorpayPaymentId]
    );
    console.log('Updated payments row:', payRes.rows[0]);

    // 5. Add order timeline
    await client.query(
      `INSERT INTO order_timeline (id, order_id, status, remarks, created_at)
       VALUES ($1, $2, 'Payment Confirmed', $3, $4)`,
      [
        `tl-${Date.now()}`,
        orderId,
        `Razorpay payment confirmed via UPI (pay_TftZm1Qr3zgN62, RRN 626772017848). Order reconciled into system.`,
        paidAt
      ]
    );
    console.log('Inserted timeline');

    // 6. Update abandoned cart to mark it recovered
    await client.query(
      `UPDATE abandoned_carts 
       SET reminded = true, updated_at = NOW()
       WHERE phone LIKE '%8098016112%' OR user_id = $1`,
      [userId]
    );
    console.log('Updated abandoned cart');

    // 7. Stock hold is already status='confirmed', so stock decrement is already permanent.

    await client.query('COMMIT');
    console.log('SUCCESS! Order successfully rescued and linked.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('FAILED TO RESCUE ORDER:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

rescueOrder().catch(err => {
  console.error(err);
  process.exit(1);
});
