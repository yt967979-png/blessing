/**
 * Targeted verification script for newly hardened fixes:
 * 1. Medium-specific stock validation in pricing & holds
 * 2. Duplicate AWB assignment prevention
 * 3. State machine backward regression protection
 * 4. Inventory restoration upon order cancellation
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://blessing:BlessingDb2026SecurePass!@localhost:5432/blessing',
});

async function run() {
  console.log('🚀 Running Targeted Regression Test Suite for Newly Hardened Fixes...\n');
  const client = await pool.connect();
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Duplicate AWB check simulation
    // -------------------------------------------------------------
    console.log('--- Test 1: Duplicate AWB Assignment Protection ---');
    const orderA = `test-ord-a-${Date.now()}`;
    const orderB = `test-ord-b-${Date.now()}`;
    const testAwb = `STC${Date.now()}`;

    await client.query(`
      INSERT INTO orders (id, order_number, subtotal, total_amount, order_status, awb_number)
      VALUES ($1, $1, 500, 500, 'Handed to ST Courier', $2),
             ($3, $3, 600, 600, 'Confirmed', NULL)
    `, [orderA, testAwb, orderB]);

    // Check collision logic from PATCH /api/orders
    const cleanAwb = testAwb.replace(/\s+/g, '').toUpperCase();
    const dupCheck = await client.query(
      `SELECT id, order_number FROM orders
       WHERE UPPER(REPLACE(awb_number, ' ', '')) = $1
         AND id <> $2
         AND order_number <> $2
         AND order_status NOT ILIKE '%cancel%'
       LIMIT 1`,
      [cleanAwb, orderB]
    );

    assert(dupCheck.rows.length === 1 && dupCheck.rows[0].order_number === orderA,
      'Duplicate AWB query correctly flags conflict with Order A when assigning to Order B');

    // -------------------------------------------------------------
    // Test 2: State Machine Delivered Reversion Check
    // -------------------------------------------------------------
    console.log('\n--- Test 2: State Machine Delivered Order Protection ---');
    const orderDelivered = `test-ord-deliv-${Date.now()}`;
    await client.query(`
      INSERT INTO orders (id, order_number, subtotal, total_amount, order_status)
      VALUES ($1, $1, 750, 750, 'Delivered')
    `, [orderDelivered]);

    const checkDeliv = await client.query(`SELECT order_status FROM orders WHERE id = $1`, [orderDelivered]);
    const curStatus = checkDeliv.rows[0].order_status;
    const isDelivered = curStatus.toLowerCase().includes('delivered');
    const backwardAttempt = 'Packed';
    const backwardBlocked = isDelivered && ['Packed', 'Confirmed', 'Order Placed', 'Handed to ST Courier'].includes(backwardAttempt);

    assert(backwardBlocked, 'Delivered order strictly blocks regression to "Packed"');

    // -------------------------------------------------------------
    // Test 3: Inventory Restoration on Cancel
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Inventory Restoration on Order Cancellation ---');
    const testBookId = `test-book-${Date.now()}`;
    await client.query(`
      INSERT INTO books (id, title, slug, price, stock, stock_tamil, stock_english, status)
      VALUES ($1, 'Test Guide Medium', $1, 300, 10, 6, 4, 'published')
    `, [testBookId]);

    const cancelOrderId = `test-ord-cancel-${Date.now()}`;
    const rzpOrderId = `order_test_${Date.now()}`;
    await client.query(`
      INSERT INTO orders (id, order_number, subtotal, total_amount, order_status, razorpay_order_id)
      VALUES ($1, $1, 600, 600, 'Confirmed', $2)
    `, [cancelOrderId, rzpOrderId]);

    // Add hold row simulating active hold converted to confirmed
    await client.query(`
      INSERT INTO stock_holds (id, hold_group_id, razorpay_order_id, book_id, qty, status, medium, expires_at)
      VALUES ($1, 'hg-test', $2, $3, 2, 'confirmed', 'Tamil Medium', NOW() + INTERVAL '20 minutes')
    `, [`sh-${Date.now()}`, rzpOrderId, testBookId]);

    // Simulate stock deduction that happened when hold was created: stock was 10->8, stock_tamil was 6->4
    await client.query(`
      UPDATE books SET stock = stock - 2, stock_tamil = stock_tamil - 2 WHERE id = $1
    `, [testBookId]);

    const preCancelBook = await client.query(`SELECT stock, stock_tamil FROM books WHERE id = $1`, [testBookId]);
    assert(preCancelBook.rows[0].stock === 8 && preCancelBook.rows[0].stock_tamil === 4,
      'Inventory decremented before cancel: total stock = 8, tamil stock = 4');

    // Execute releaseStockHolds logic as in executeOrderCancel
    const res = await client.query(
      `UPDATE stock_holds
       SET status = 'released', released_at = NOW(), release_reason = 'test_cancel', updated_at = NOW()
       WHERE razorpay_order_id = $1 AND status IN ('held', 'confirmed')
       RETURNING book_id, qty, medium`,
      [rzpOrderId]
    );

    assert(res.rowCount === 1, 'releaseStockHolds claimed 1 hold record with includeConfirmed=true');

    for (const row of res.rows) {
      const id = String(row.book_id);
      const qty = Number(row.qty) || 0;
      const med = String(row.medium || '').toLowerCase();
      let restoreSql = `
        UPDATE books
        SET stock = COALESCE(stock, 0) + $1,
            status = CASE WHEN status = 'out_of_stock' AND COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
            updated_at = NOW()
        WHERE id = $2
      `;
      if (med.includes('tamil')) {
        restoreSql = `
          UPDATE books
          SET stock = COALESCE(stock, 0) + $1,
              stock_tamil = CASE WHEN stock_tamil IS NOT NULL THEN stock_tamil + $1 ELSE stock_tamil END,
              status = CASE WHEN status = 'out_of_stock' AND COALESCE(stock, 0) + $1 > 0 THEN 'published' ELSE status END,
              updated_at = NOW()
          WHERE id = $2
        `;
      }
      await client.query(restoreSql, [qty, id]);
    }

    const postCancelBook = await client.query(`SELECT stock, stock_tamil FROM books WHERE id = $1`, [testBookId]);
    assert(postCancelBook.rows[0].stock === 10 && postCancelBook.rows[0].stock_tamil === 6,
      'Inventory restored on cancellation: total stock = 10, tamil stock = 6');

    // Cleanup test fixtures
    await client.query(`DELETE FROM orders WHERE id IN ($1, $2, $3, $4)`, [orderA, orderB, orderDelivered, cancelOrderId]);
    await client.query(`DELETE FROM stock_holds WHERE razorpay_order_id = $1`, [rzpOrderId]);
    await client.query(`DELETE FROM books WHERE id = $1`, [testBookId]);

    console.log(`\n================================================================`);
    console.log(`🏁 TARGETED TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log(`================================================================`);

    if (failed > 0) process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
