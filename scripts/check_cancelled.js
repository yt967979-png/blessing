const { Client } = require('pg');

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://blessing:blessing2025@127.0.0.1:5432/blessing',
  });
  await c.connect();

  console.log('=== ORDER ord-1790490477223 ===');
  const ord = await c.query('SELECT * FROM orders WHERE id = $1', ['ord-1790490477223']);
  console.log(ord.rows[0]);

  console.log('\n=== TIMELINE ===');
  const tl = await c.query('SELECT * FROM order_timeline WHERE order_id = $1 ORDER BY created_at ASC', ['ord-1790490477223']);
  console.log(tl.rows);

  console.log('\n=== UPDATING ORDER IN DB WITH CONFIRMED REFUND ===');
  await c.query("UPDATE orders SET payment_status = 'Refunded', razorpay_refund_id = $1, updated_at = NOW() WHERE id = $2", ['rfnd_ThhVApOh8bG7Wf', 'ord-1790490477223']);
  await c.query("UPDATE payments SET status = 'REFUNDED' WHERE order_id = $1", ['ord-1790490477223']);
  await c.query("INSERT INTO refunds (id, order_id, razorpay_refund_id, razorpay_payment_id, amount, status, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
    'ref-manual-fix-001', 'ord-1790490477223', 'rfnd_ThhVApOh8bG7Wf', 'pay_TgxhvmwvD49sUq', 1, 'PROCESSED', 'Admin cancel refund'
  ]);
  console.log('Order ord-1790490477223 updated to Refunded successfully in database!');

  console.log('\n=== REFUNDS TABLE ===');
  const ref = await c.query('SELECT * FROM refunds WHERE order_id = $1', ['ord-1790490477223']);
  console.log(ref.rows);

  await c.end();

  console.log('\n=== RAZORPAY API DIRECT CHECK ===');
  const fs = require('fs');
  const envContent = fs.readFileSync('/etc/blessing.env', 'utf8');
  let keyId = '', keySecret = '';
  for (const line of envContent.split('\n')) {
    if (line.startsWith('RAZORPAY_KEY_ID=')) keyId = line.replace('RAZORPAY_KEY_ID=', '').trim();
    if (line.startsWith('RAZORPAY_KEY_SECRET=')) keySecret = line.replace('RAZORPAY_KEY_SECRET=', '').trim();
  }
  const auth = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const rzpRes = await fetch('https://api.razorpay.com/v1/payments/pay_TgxhvmwvD49sUq', {
    headers: { Authorization: auth }
  });
  const payJson = await rzpRes.json();
  console.log('Payment status on Razorpay:', payJson.status, 'amount:', payJson.amount, 'amount_refunded:', payJson.amount_refunded);

  console.log('\n=== TESTING REFUND API CALL (SINGULAR: /refund) ===');
  const refundRes1 = await fetch('https://api.razorpay.com/v1/payments/pay_TgxhvmwvD49sUq/refund', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify({
      amount: 100,
      notes: {
        order_number: 'BPG-FSU5JBAP',
        reason: 'test_investigation_refund',
      },
    }),
  });
  const refundJson1 = await refundRes1.json();
  console.log('Singular /refund response status:', refundRes1.status, refundJson1);

  console.log('\n=== TESTING REFUND API CALL (GLOBAL: /v1/refunds) ===');
  const refundRes2 = await fetch('https://api.razorpay.com/v1/refunds', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify({
      payment_id: 'pay_TgxhvmwvD49sUq',
      amount: 100,
      notes: {
        order_number: 'BPG-FSU5JBAP',
        reason: 'test_investigation_refund',
      },
    }),
  });
  const refundJson2 = await refundRes2.json();
  console.log('Global /v1/refunds response status:', refundRes2.status, refundJson2);
}

main().catch(console.error);

