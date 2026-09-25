const { queryDb } = require('../src/lib/db');

async function check() {
  try {
    console.log('--- Checking user table for Jo Princy ---');
    const u = await queryDb("SELECT * FROM users WHERE email LIKE '%joprincy%' OR phone LIKE '%8098016112%'");
    console.log('User:', u.rows);

    const userId = u.rows[0]?.id;

    console.log('--- Checking payments table ---');
    const pay = await queryDb("SELECT * FROM payments WHERE payment_id = $1 OR transaction_id = $1", ['pay_TftZm1Qr3zgN62']);
    console.log('Payments:', pay.rows);

    console.log('--- Checking orders table by payment_id ---');
    const ord = await queryDb("SELECT * FROM orders WHERE razorpay_payment_id = $1 OR razorpay_order_id = $1", ['pay_TftZm1Qr3zgN62']);
    console.log('Orders by payId:', ord.rows);

    console.log('--- Checking all orders for this user ---');
    const ordUser = await queryDb("SELECT id, order_number, user_id, total_amount, payment_status, order_status, razorpay_payment_id, razorpay_order_id, created_at, ordered_at FROM orders WHERE user_id = $1 OR shipping_address::text LIKE '%8098016112%' ORDER BY created_at DESC LIMIT 5", [userId || 'none']);
    console.log('Orders by user/phone:', ordUser.rows);

    console.log('--- Checking stock_holds table ---');
    const holds = await queryDb("SELECT * FROM stock_holds WHERE user_id = $1 OR razorpay_order_id IS NOT NULL ORDER BY created_at DESC LIMIT 10", [userId || 'none']);
    console.log('Stock holds:', holds.rows);

    console.log('--- Checking abandoned_carts table ---');
    const ac = await queryDb("SELECT * FROM abandoned_carts WHERE phone LIKE '%8098016112%' OR user_id = $1", [userId || 'none']);
    console.log('Abandoned carts:', ac.rows);

    console.log('--- Checking webhook_events table ---');
    const whe = await queryDb("SELECT * FROM webhook_events WHERE payload LIKE '%pay_TftZm1Qr3zgN62%' OR payload LIKE '%8098016112%' ORDER BY created_at DESC LIMIT 5");
    console.log('Webhook events:', whe.rows);

    console.log('--- Checking failed_webhook_events table ---');
    const fwe = await queryDb("SELECT * FROM failed_webhook_events ORDER BY created_at DESC LIMIT 5");
    console.log('Failed webhook events:', fwe.rows);

    console.log('--- Checking recent system_errors ---');
    const errs = await queryDb("SELECT * FROM system_errors ORDER BY created_at DESC LIMIT 10");
    console.log('System errors:', errs.rows);

  } catch (e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

check();
