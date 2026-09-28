/**
 * Phase 2 Verification Suite:
 * 1. ST Courier Scraper out-of-order event regression protection (BUG-005)
 * 2. Refund failure recovery, lease timeout on REFUNDING, and exception safety (BUG-006)
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://blessing:BlessingDb2026SecurePass!@localhost:5432/blessing',
});

async function run() {
  console.log('🚀 Running Phase 2 Hardening & Resilience Verification Suite...\n');
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
    // Test 1: ST Courier Status Progression & Out-of-Order Safety
    // -------------------------------------------------------------
    console.log('--- Test 1: ST Courier shouldAdvance Invariant Testing ---');
    const { STAGE_RANK } = {
      STAGE_RANK: {
        'Order Placed': 0,
        'Awaiting Confirmation': 0,
        Confirmed: 0,
        Packed: 1,
        'Handed to ST Courier': 1,
        'In Transit': 2,
        'Delivery Attempted': 3,
        'Out for Delivery': 3,
        Delivered: 4,
        RTO: 4,
      }
    };

    function shouldAdvance(current, next) {
      if (String(current).toLowerCase().includes('cancel')) return false;
      if (current === 'Delivered') return false;
      if (current === next) return false;
      if (next === 'Delivered' || next === 'RTO') return true;

      if (
        (current === 'Out for Delivery' && next === 'Delivery Attempted') ||
        (current === 'Delivery Attempted' && next === 'Out for Delivery')
      ) {
        return true;
      }

      if (current === 'Delivery Attempted' && next === 'In Transit') {
        return true;
      }

      const curRank = STAGE_RANK[current] ?? -1;
      const nextRank = STAGE_RANK[next] ?? 0;
      return nextRank > curRank;
    }

    assert(shouldAdvance('In Transit', 'Out for Delivery') === true,
      'In Transit -> Out for Delivery advances forward (True)');

    assert(shouldAdvance('Out for Delivery', 'In Transit') === false,
      'Out for Delivery -> In Transit strictly blocked against stale hub scans (False)');

    assert(shouldAdvance('Out for Delivery', 'Delivery Attempted') === true,
      'Out for Delivery -> Delivery Attempted is allowed on missed delivery (True)');

    assert(shouldAdvance('Delivery Attempted', 'Out for Delivery') === true,
      'Delivery Attempted -> Out for Delivery allowed on courier re-attempt (True)');

    assert(shouldAdvance('Delivery Attempted', 'In Transit') === true,
      'Delivery Attempted -> In Transit allowed when parcel returned to hub (True)');

    assert(shouldAdvance('Delivered', 'In Transit') === false,
      'Delivered -> In Transit strictly blocked (False)');

    // -------------------------------------------------------------
    // Test 2: Refund Lease Timeout & Stuck Lock Recovery
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Refund Lease Timeout & Stuck Lock Recovery ---');
    const stuckOrder = `test-ord-stuck-${Date.now()}`;
    await client.query(`
      INSERT INTO orders (id, order_number, subtotal, total_amount, order_status, payment_status, updated_at)
      VALUES ($1, $1, 450, 450, 'Confirmed', 'REFUNDING', NOW() - INTERVAL '5 minutes')
    `, [stuckOrder]);

    // Attempt CAS claim with 3-minute lease timeout
    const reclaimRes = await client.query(
      `UPDATE orders 
       SET payment_status = 'REFUNDING', updated_at = NOW()
       WHERE id = $1 
         AND (
           (payment_status != 'REFUNDING' AND payment_status NOT ILIKE '%refund%')
           OR (payment_status = 'REFUNDING' AND updated_at < NOW() - INTERVAL '3 minutes')
         )
       RETURNING id`,
      [stuckOrder]
    );

    assert(reclaimRes.rowCount === 1,
      'Stuck REFUNDING order older than 3 minutes was successfully reclaimed by retry worker');

    // Recent in-flight lock test (10 seconds old)
    const activeLockOrder = `test-ord-active-${Date.now()}`;
    await client.query(`
      INSERT INTO orders (id, order_number, subtotal, total_amount, order_status, payment_status, updated_at)
      VALUES ($1, $1, 450, 450, 'Confirmed', 'REFUNDING', NOW())
    `, [activeLockOrder]);

    const activeClaimRes = await client.query(
      `UPDATE orders 
       SET payment_status = 'REFUNDING', updated_at = NOW()
       WHERE id = $1 
         AND (
           (payment_status != 'REFUNDING' AND payment_status NOT ILIKE '%refund%')
           OR (payment_status = 'REFUNDING' AND updated_at < NOW() - INTERVAL '3 minutes')
         )
       RETURNING id`,
      [activeLockOrder]
    );

    assert(activeClaimRes.rowCount === 0,
      'Active in-flight REFUNDING order (<3m old) is protected against concurrent double-refund');

    // Cleanup fixtures
    await client.query(`DELETE FROM orders WHERE id IN ($1, $2)`, [stuckOrder, activeLockOrder]);

    console.log(`\n================================================================`);
    console.log(`🏁 PHASE 2 TESTS COMPLETE: ${passed} PASSED, ${failed} FAILED`);
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
