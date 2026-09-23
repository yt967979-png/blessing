/**
 * Phase 6: Adversarial Inventory Race Conditions & Overselling Test Harness
 * Exercises high-concurrency stock reservation and atomic decrement under 20, 50, and 100 parallel buyers.
 */

const { Pool } = require('pg');

const DB_URL = process.env.DATABASE_URL || 'postgresql://blessing:blessing2025@localhost:5432/blessing';
const pool = new Pool({ connectionString: DB_URL, max: 50 });

async function createStockHoldTx(dbPool, holdGroupId, items, userId) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    for (const item of items) {
      const qty = Math.max(1, Math.floor(Number(item.qty) || 0));
      const res = await client.query(
        `UPDATE books
         SET stock = COALESCE(stock, 0) - $1,
             status = CASE WHEN COALESCE(stock, 0) - $1 <= 0 THEN 'out_of_stock' ELSE status END,
             updated_at = NOW()
         WHERE id = $2 AND COALESCE(stock, 0) >= $1
         RETURNING id, title`,
        [qty, item.id]
      );
      if (res.rowCount === 0) {
        await client.query('ROLLBACK');
        return { ok: false, error: 'Out of stock', status: 409 };
      }
      await client.query(
        `INSERT INTO stock_holds (id, hold_group_id, book_id, user_id, qty, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'held', NOW() + INTERVAL '20 minutes')`,
        [`sh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, holdGroupId, item.id, userId, qty]
      );
    }
    await client.query('COMMIT');
    return { ok: true, holdGroupId };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return { ok: false, error: err.message, status: 500 };
  } finally {
    client.release();
  }
}

async function releaseHoldTx(dbPool, holdGroupId) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const holds = await client.query(
      `UPDATE stock_holds SET status = 'released', updated_at = NOW()
       WHERE hold_group_id = $1 AND status = 'held'
       RETURNING book_id, qty`,
      [holdGroupId]
    );
    for (const row of holds.rows) {
      await client.query(
        `UPDATE books SET stock = stock + $1, status = 'in_stock', updated_at = NOW() WHERE id = $2`,
        [row.qty, row.book_id]
      );
    }
    await client.query('COMMIT');
    return { releasedCount: holds.rowCount };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    return { releasedCount: 0 };
  } finally {
    client.release();
  }
}

async function confirmHoldTx(dbPool, holdGroupId) {
  const client = await dbPool.connect();
  try {
    const res = await client.query(
      `UPDATE stock_holds SET status = 'confirmed', updated_at = NOW()
       WHERE hold_group_id = $1 AND status = 'held'
       RETURNING id`,
      [holdGroupId]
    );
    return { confirmedCount: res.rowCount };
  } finally {
    client.release();
  }
}

async function run() {
  console.log('================================================================');
  console.log('⚡  PHASE 6: INVENTORY RACE CONDITIONS & OVERSELLING HARNESS');
  console.log('================================================================\n');

  const client = await pool.connect();
  const results = [];
  function record(id, name, passed, details = '') {
    results.push({ id, name, passed, details });
    const mark = passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} [${id}] ${name} ${details ? `— ${details}` : ''}`);
  }

  const testBookId = `book_race_${Date.now()}`;
  const testBookId2 = `book_race2_${Date.now()}`;

  try {
    // 0. Setup test books
    const catId = (await client.query('SELECT id FROM categories LIMIT 1')).rows[0]?.id || null;
    await client.query(`
      INSERT INTO books (id, title, slug, price, discount_price, stock, status, category_id)
      VALUES 
        ($1, 'Race Test Book 10 Stock', $1, 250, 200, 10, 'in_stock', $3),
        ($2, 'Race Test Book 0 Stock', $2, 250, 200, 0, 'out_of_stock', $3)
      ON CONFLICT (id) DO NOTHING;
    `, [testBookId, testBookId2, catId]);

    // ── TEST 1: 20 Parallel Buyers Competing for 10 Units ──────────────────────
    console.log('\n--- Test 1: 20 Parallel Buyers Competing for 10 Units ---');
    const buyers20 = Array.from({ length: 20 }, (_, i) => ({
      userId: `buyer_20_${i}`,
      items: [{ id: testBookId, qty: 1 }],
    }));

    const results20 = await Promise.all(buyers20.map((b, i) => createStockHoldTx(pool, `hold_20_${i}_${Date.now()}`, b.items, b.userId)));
    const success20 = results20.filter(r => r.ok);
    const failed20 = results20.filter(r => !r.ok);

    const stockCheck20 = (await client.query('SELECT stock FROM books WHERE id = $1', [testBookId])).rows[0].stock;
    const holdsCount20 = (await client.query("SELECT COUNT(*) FROM stock_holds WHERE book_id = $1 AND status = 'held'", [testBookId])).rows[0].count;

    const test1Passed = success20.length === 10 && failed20.length === 10 && Number(stockCheck20) === 0 && Number(holdsCount20) === 10;
    record('RACE-01', '20 concurrent buyers: Exactly 10 sold, exactly 10 rejected, stock = 0', test1Passed,
      `Success: ${success20.length}, Rejected: ${failed20.length}, Stock: ${stockCheck20}, Holds: ${holdsCount20}`);

    // Release all holds from test 1
    for (const h of success20) {
      await releaseHoldTx(pool, h.holdGroupId);
    }
    const resetStock20 = (await client.query('SELECT stock FROM books WHERE id = $1', [testBookId])).rows[0].stock;
    record('RACE-02', 'Atomic release restores stock accurately to 10', Number(resetStock20) === 10, `Stock after release: ${resetStock20}`);

    // ── TEST 2: 50 Parallel Buyers Competing for 10 Units ──────────────────────
    console.log('\n--- Test 2: 50 Parallel Buyers Competing for 10 Units ---');
    const buyers50 = Array.from({ length: 50 }, (_, i) => ({
      userId: `buyer_50_${i}`,
      items: [{ id: testBookId, qty: 1 }],
    }));

    const results50 = await Promise.all(buyers50.map((b, i) => createStockHoldTx(pool, `hold_50_${i}_${Date.now()}`, b.items, b.userId)));
    const success50 = results50.filter(r => r.ok);
    const failed50 = results50.filter(r => !r.ok);

    const stockCheck50 = (await client.query('SELECT stock FROM books WHERE id = $1', [testBookId])).rows[0].stock;
    const holdsCount50 = (await client.query("SELECT COUNT(*) FROM stock_holds WHERE book_id = $1 AND status = 'held'", [testBookId])).rows[0].count;

    const test2Passed = success50.length === 10 && failed50.length === 40 && Number(stockCheck50) === 0 && Number(holdsCount50) === 10;
    record('RACE-03', '50 concurrent buyers: Exactly 10 sold, exactly 40 rejected, stock = 0', test2Passed,
      `Success: ${success50.length}, Rejected: ${failed50.length}, Stock: ${stockCheck50}, Holds: ${holdsCount50}`);

    // Release all holds from test 2
    for (const h of success50) {
      await releaseHoldTx(pool, h.holdGroupId);
    }
    const resetStock50 = (await client.query('SELECT stock FROM books WHERE id = $1', [testBookId])).rows[0].stock;
    record('RACE-04', 'Atomic release after 50 buyers restores stock accurately to 10', Number(resetStock50) === 10, `Stock: ${resetStock50}`);

    // ── TEST 3: 100 Parallel Buyers Competing for 10 Units ─────────────────────
    console.log('\n--- Test 3: 100 Parallel Buyers Competing for 10 Units ---');
    const buyers100 = Array.from({ length: 100 }, (_, i) => ({
      userId: `buyer_100_${i}`,
      items: [{ id: testBookId, qty: 1 }],
    }));

    const results100 = await Promise.all(buyers100.map((b, i) => createStockHoldTx(pool, `hold_100_${i}_${Date.now()}`, b.items, b.userId)));
    const success100 = results100.filter(r => r.ok);
    const failed100 = results100.filter(r => !r.ok);

    const stockCheck100 = (await client.query('SELECT stock FROM books WHERE id = $1', [testBookId])).rows[0].stock;
    const holdsCount100 = (await client.query("SELECT COUNT(*) FROM stock_holds WHERE book_id = $1 AND status = 'held'", [testBookId])).rows[0].count;

    const test3Passed = success100.length === 10 && failed100.length === 90 && Number(stockCheck100) === 0 && Number(holdsCount100) === 10;
    record('RACE-05', '100 concurrent buyers: Exactly 10 sold, exactly 90 rejected, zero overselling', test3Passed,
      `Success: ${success100.length}, Rejected: ${failed100.length}, Stock: ${stockCheck100}, Holds: ${holdsCount100}`);

    // ── TEST 4: Double Confirmation & Idempotency ─────────────────────────────
    console.log('\n--- Test 4: Hold Confirmation & Double-Release Protection ---');
    for (let i = 0; i < success100.length; i++) {
      await confirmHoldTx(pool, success100[i].holdGroupId);
    }

    const confirmedCount = (await client.query("SELECT COUNT(*) FROM stock_holds WHERE book_id = $1 AND status = 'confirmed'", [testBookId])).rows[0].count;
    record('RACE-06', 'All 10 sales permanently confirmed (status = confirmed)', Number(confirmedCount) === 10, `Confirmed: ${confirmedCount}`);

    // Attempt double release on confirmed holds - stock must remain 0
    for (let i = 0; i < success100.length; i++) {
      await releaseHoldTx(pool, success100[i].holdGroupId);
    }
    const stockAfterDoubleRelease = (await client.query('SELECT stock FROM books WHERE id = $1', [testBookId])).rows[0].stock;
    record('RACE-07', 'Release calls on confirmed sales strictly no-op (stock remains 0)', Number(stockAfterDoubleRelease) === 0, `Stock: ${stockAfterDoubleRelease}`);

    // ── TEST 5: Multi-Item Atomicity Rollback ──────────────────────────────────
    console.log('\n--- Test 5: Multi-Item Atomicity (One in stock, one out of stock) ---');
    // Set Book 1 stock back to 5
    await client.query('UPDATE books SET stock = 5 WHERE id = $1', [testBookId]);
    // Cart has Book 1 (5 available) and Book 2 (0 available)
    const multiItemResult = await createStockHoldTx(pool, `hold_multi_${Date.now()}`, [
      { id: testBookId, qty: 1, title: 'In Stock Book' },
      { id: testBookId2, qty: 1, title: 'Out of Stock Book' },
    ], 'multi_item_user');

    const stockAfterMultiFail = (await client.query('SELECT stock FROM books WHERE id = $1', [testBookId])).rows[0].stock;
    const test5Passed = !multiItemResult.ok && Number(stockAfterMultiFail) === 5;
    record('RACE-08', 'Multi-item hold rolls back completely if any book is out of stock', test5Passed,
      `Result ok: ${multiItemResult.ok}, Book 1 stock preserved: ${stockAfterMultiFail}`);


    // ── TEST 6: Non-Negative Stock Integrity Check ────────────────────────────
    const negativeStockCheck = (await client.query('SELECT COUNT(*) FROM books WHERE stock < 0')).rows[0].count;
    record('RACE-09', 'Global invariant: Zero books in entire catalog have negative stock', Number(negativeStockCheck) === 0, `Negative stock rows: ${negativeStockCheck}`);

  } finally {
    // Cleanup test records
    await client.query('DELETE FROM stock_holds WHERE book_id IN ($1, $2)', [testBookId, testBookId2]);
    await client.query('DELETE FROM books WHERE id IN ($1, $2)', [testBookId, testBookId2]);
    client.release();
    await pool.end();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 6 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
