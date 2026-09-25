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

async function run() {
  console.log('=== PAYMENTS ===');
  const p = await pool.query("SELECT * FROM payments WHERE payment_id = 'pay_TftZm1Qr3zgN62' OR transaction_id = 'order_TftZSz6UHMM8Wu'");
  console.log(JSON.stringify(p.rows, null, 2));

  console.log('=== ORDERS ===');
  const o = await pool.query("SELECT * FROM orders WHERE razorpay_order_id = 'order_TftZSz6UHMM8Wu' OR razorpay_payment_id = 'pay_TftZm1Qr3zgN62'");
  console.log(JSON.stringify(o.rows, null, 2));

  console.log('=== STOCK HOLDS ===');
  const sh = await pool.query("SELECT * FROM stock_holds WHERE razorpay_order_id = 'order_TftZSz6UHMM8Wu'");
  console.log(JSON.stringify(sh.rows, null, 2));

  console.log('=== ABANDONED CARTS ===');
  const ac = await pool.query("SELECT * FROM abandoned_carts WHERE phone LIKE '%8098016112%'");
  console.log(JSON.stringify(ac.rows, null, 2));

  console.log('=== USER ===');
  const u = await pool.query("SELECT id, name, email, phone, role FROM users WHERE email LIKE '%joprincy%' OR phone LIKE '%8098016112%'");
  console.log(JSON.stringify(u.rows, null, 2));

  if (u.rows.length > 0) {
    const userId = u.rows[0].id;
    console.log('=== ORDERS BY USER ID ===');
    const uOrders = await pool.query("SELECT id, order_number, total_amount, payment_status, order_status, razorpay_order_id, razorpay_payment_id, created_at FROM orders WHERE user_id = $1", [userId]);
    console.log(JSON.stringify(uOrders.rows, null, 2));

    console.log('=== ADDRESSES BY USER ID ===');
    const uAddr = await pool.query("SELECT * FROM addresses WHERE user_id = $1", [userId]);
    console.log(JSON.stringify(uAddr.rows, null, 2));
  }

  console.log('=== RECENT 5 ORDERS ===');
  const recentOrders = await pool.query("SELECT id, order_number, user_id, total_amount, payment_status, order_status, razorpay_order_id, razorpay_payment_id, created_at FROM orders ORDER BY created_at DESC LIMIT 5");
  console.log(JSON.stringify(recentOrders.rows, null, 2));

  await pool.end();
}

run().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
