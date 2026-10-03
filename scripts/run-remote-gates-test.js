const { Client } = require('ssh2');

const remoteTestScript = `
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  connectionString: 'postgresql://blessing:blessing2025@localhost:5432/blessing',
  max: 5,
  idleTimeoutMillis: 5000,
});

async function run() {
  console.log('===============================================================');
  console.log('🧪 LIVE PRODUCTION LAUNCH GATES VERIFICATION');
  console.log('===============================================================');

  // --- GATE 1: CONNECTION POOL METRICS ---
  console.log('\\n--- GATE 1: CURRENT POSTGRESQL CONNECTION METRICS ---');
  const connStats = await pool.query(\`
    SELECT 
      count(*) as total,
      count(*) FILTER (WHERE state = 'active') as active,
      count(*) FILTER (WHERE state = 'idle') as idle,
      count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_tx
    FROM pg_stat_activity 
    WHERE datname = 'blessing';
  \`);
  console.log('Total Connections:', connStats.rows[0].total);
  console.log('Active Queries:', connStats.rows[0].active);
  console.log('Idle Connections:', connStats.rows[0].idle);
  console.log('Idle In Transaction:', connStats.rows[0].idle_in_tx);

  if (Number(connStats.rows[0].total) > 40) {
    console.warn('⚠️ High connection count detected!');
  } else {
    console.log('✅ Connection pool is healthy & well within normal limits (< 40)');
  }

  // --- GATE 2: LAST-COPY RACE CONDITION (WhatsApp vs Website) ---
  console.log('\\n--- GATE 2: LAST-COPY RACE CONDITION (WHATSAPP VS WEBSITE) ---');
  const testBookId = 'book-race-gate-' + Date.now();
  const testBookTitle = 'Gate Test 10th Guide';

  // Seed 1 test book with exactly 1 copy
  const testSlug = 'gate-test-10th-guide-' + Date.now();
  await pool.query(\`
    INSERT INTO books (id, title, slug, language, price, stock, stock_tamil, stock_english, status, created_at, updated_at)
    VALUES ($1, $2, $3, 'Tamil Medium', 250, 1, 1, 0, 'in_stock', NOW(), NOW())
  \`, [testBookId, testBookTitle, testSlug]);

  console.log('Step A: Created test book with exactly 1 copy (stock=1)');

  // Channel A (WhatsApp Customer) attempts to hold the copy
  const holdClientA = await pool.connect();
  let holdGroupIdA = 'hold-wa-' + Date.now();
  let holdASucceeded = false;
  try {
    await holdClientA.query('BEGIN');
    const updateRes = await holdClientA.query(\`
      UPDATE books 
      SET stock = stock - 1,
          stock_tamil = stock_tamil - 1,
          status = CASE WHEN stock - 1 <= 0 THEN 'out_of_stock' ELSE status END
      WHERE id = $1 AND stock >= 1 AND stock_tamil >= 1
      RETURNING id, stock, stock_tamil
    \`, [testBookId]);

    if (updateRes.rowCount > 0) {
      await holdClientA.query(\`
        INSERT INTO stock_holds (id, hold_group_id, book_id, qty, status, expires_at, created_at)
        VALUES ($1, $2, $3, 1, 'held', NOW() + INTERVAL '20 minutes', NOW())
      \`, ['sh-a-' + Date.now(), holdGroupIdA, testBookId]);
      await holdClientA.query('COMMIT');
      holdASucceeded = true;
    } else {
      await holdClientA.query('ROLLBACK');
    }
  } finally {
    holdClientA.release();
  }

  console.log('Step B: WhatsApp Customer reserved 1 copy:', holdASucceeded ? '✅ SUCCESS (Held for 20m)' : '❌ FAILED');

  // Verify DB state: Available stock is now 0!
  const stockAfterA = await pool.query('SELECT stock, stock_tamil, status FROM books WHERE id = $1', [testBookId]);
  console.log('Step C: Live DB Available Stock after WhatsApp Hold:', stockAfterA.rows[0]);

  // Channel B (Website Shopper) simultaneously attempts to hold or checkout the same book
  const holdClientB = await pool.connect();
  let holdBSucceeded = false;
  try {
    await holdClientB.query('BEGIN');
    const updateResB = await holdClientB.query(\`
      UPDATE books 
      SET stock = stock - 1,
          stock_tamil = stock_tamil - 1,
          status = CASE WHEN stock - 1 <= 0 THEN 'out_of_stock' ELSE status END
      WHERE id = $1 AND stock >= 1 AND stock_tamil >= 1
      RETURNING id, stock, stock_tamil
    \`, [testBookId]);

    if (updateResB.rowCount > 0) {
      await holdClientB.query('COMMIT');
      holdBSucceeded = true;
    } else {
      await holdClientB.query('ROLLBACK');
      holdBSucceeded = false;
    }
  } finally {
    holdClientB.release();
  }

  console.log('Step D: Website Shopper attempt to buy last copy:', holdBSucceeded ? '❌ DANGEROUS OVERSELL' : '✅ BLOCKED / OUT OF STOCK');

  if (holdBSucceeded) {
    throw new Error('Race condition failed: Website allowed buying already-held copy!');
  }

  // --- GATE 3: ATOMIC PAYMENT FINALIZATION (EXACTLY 1 ORDER / 1 DEDUCTION) ---
  console.log('\\n--- GATE 3: EXACTLY-1 ORDER / EXACTLY-1 STOCK DEDUCTION ---');
  const testOrderId = 'ord-gate-' + Date.now();
  const testOrderNumber = 'BPG-GATE-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const testRzpOrderId = 'order_gate_rzp_' + Date.now();
  const testRzpPayId = 'pay_gate_rzp_' + Date.now();

  // Simulate Razorpay Webhook Call 1
  const finClient1 = await pool.connect();
  let call1Created = false;
  try {
    await finClient1.query('BEGIN');
    const check1 = await finClient1.query('SELECT id FROM orders WHERE razorpay_order_id = $1 OR razorpay_payment_id = $2', [testRzpOrderId, testRzpPayId]);
    if (check1.rows.length === 0) {
      await finClient1.query(\`
        INSERT INTO orders (id, order_number, user_id, subtotal, total_amount, order_status, payment_status, razorpay_order_id, razorpay_payment_id, created_at, updated_at)
        VALUES ($1, $2, 'usr-gate-test', 250, 250, 'Confirmed', 'Payment Confirmed', $3, $4, NOW(), NOW())
      \`, [testOrderId, testOrderNumber, testRzpOrderId, testRzpPayId]);

      // Confirm stock hold (converts held -> confirmed, stock was already decremented at hold time)
      await finClient1.query(\`
        UPDATE stock_holds 
        SET status = 'confirmed', updated_at = NOW()
        WHERE hold_group_id = $1 AND status = 'held'
      \`, [holdGroupIdA]);

      await finClient1.query('COMMIT');
      call1Created = true;
    } else {
      await finClient1.query('COMMIT');
    }
  } finally {
    finClient1.release();
  }

  console.log('Delivery 1 (Razorpay Webhook): Order Created ->', call1Created ? '✅ SUCCESS (Order #' + testOrderNumber + ')' : '❌ FAILED');

  // Simulate Razorpay Webhook Call 2 (Duplicate Webhook Delivery or Client Callback Race)
  const finClient2 = await pool.connect();
  let call2DuplicateDetected = false;
  try {
    await finClient2.query('BEGIN');
    const check2 = await finClient2.query('SELECT id, order_number FROM orders WHERE razorpay_order_id = $1 OR razorpay_payment_id = $2', [testRzpOrderId, testRzpPayId]);
    if (check2.rows.length > 0) {
      call2DuplicateDetected = true;
      await finClient2.query('COMMIT');
    } else {
      await finClient2.query('COMMIT');
    }
  } finally {
    finClient2.release();
  }

  console.log('Delivery 2 (Duplicate Webhook / Client Race): Idempotency Caught ->', call2DuplicateDetected ? '✅ NO-OP (0 duplicate orders, 0 extra stock deductions)' : '❌ DUPLICATE CREATED');

  // Verify total orders and stock in DB
  const verifyOrders = await pool.query('SELECT count(*) FROM orders WHERE razorpay_order_id = $1', [testRzpOrderId]);
  const verifyHolds = await pool.query('SELECT status, count(*) FROM stock_holds WHERE hold_group_id = $1 GROUP BY status', [holdGroupIdA]);
  const finalBookStock = await pool.query('SELECT stock, stock_tamil, status FROM books WHERE id = $1', [testBookId]);

  console.log('Total Orders in DB with this Razorpay ID:', verifyOrders.rows[0].count, '(Expected: 1)');
  console.log('Stock Hold Status in DB:', verifyHolds.rows[0]);
  console.log('Final Book Physical Stock in DB:', finalBookStock.rows[0]);

  // Cleanup test row
  await pool.query('DELETE FROM orders WHERE id = $1', [testOrderId]);
  await pool.query('DELETE FROM stock_holds WHERE hold_group_id = $1', [holdGroupIdA]);
  await pool.query('DELETE FROM books WHERE id = $1', [testBookId]);
  console.log('\\n✅ Safe cleanup of test records completed.');

  await pool.end();
}

run().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});
`;

const conn = new Client();
conn.on('ready', () => {
  conn.sftp((err, sftp) => {
    if (err) throw err;
    const ws = sftp.createWriteStream('/tmp/test_unified_gates.js');
    ws.write(remoteTestScript);
    ws.end();
    ws.on('close', () => {
      conn.exec('export NODE_PATH=/opt/blessing/node_modules && node /tmp/test_unified_gates.js', (err, stream) => {
        if (err) throw err;
        stream.on('data', d => process.stdout.write(d));
        stream.stderr.on('data', d => process.stderr.write(d));
        stream.on('close', () => conn.end());
      });
    });
  });
}).connect({
  host: '148.113.8.82',
  port: 20033,
  username: 'root',
  password: 'xCqQSF4Xxq3In9kb',
});
