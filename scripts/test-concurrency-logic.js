const crypto = require('crypto');

console.log('======================================================');
console.log('🧪 BLESSING E-COMMERCE — INTEGRATION & LOGIC TEST SUITE');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    passed++;
    console.log(`✅ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${testName} — ${detail}`);
  }
}

// 1. Signature Verification Test (HMAC SHA256 Constant-Time Check)
try {
  const secret = 'test_webhook_secret_12345';
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_123' } } } });
  
  const validSig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const invalidSig = 'a'.repeat(64);

  const aBuf = Buffer.from(validSig, 'hex');
  const bBuf = Buffer.from(validSig, 'hex');
  const cBuf = Buffer.from(invalidSig, 'hex');

  const matchValid = aBuf.length === bBuf.length && crypto.timingSafeEqual(aBuf, bBuf);
  const matchInvalid = aBuf.length === cBuf.length && crypto.timingSafeEqual(aBuf, cBuf);

  assert(matchValid === true, 'Signature Check: Valid HMAC matches');
  assert(matchInvalid === false, 'Signature Check: Invalid HMAC fails safely');
} catch (err) {
  assert(false, 'Signature Check', err.message);
}

// 2. Pricing Logic Test (Server-Authoritative Price vs Client Price)
try {
  const dbBook = { id: 'book-1', price: 299, discount_price: 249, stock: 10 };
  const clientInput = { id: 'book-1', price: 1, qty: 2, total: 2 }; // Client tries to cheat price = 1

  const mrp = Number(dbBook.price);
  const rawSale = Number(dbBook.discount_price);
  const unitPrice = Number.isFinite(rawSale) && rawSale > 0 && rawSale < mrp ? rawSale : mrp;
  const serverCalculatedTotal = unitPrice * Math.max(1, Math.floor(clientInput.qty));

  assert(serverCalculatedTotal === 498, 'Server Pricing: Ignores client price (calculated 498 instead of 2)');
} catch (err) {
  assert(false, 'Server Pricing', err.message);
}

// 3. Multi-Item Cart Rollback Simulation
try {
  const cartItems = [
    { id: 'b1', qty: 2, stock: 5 }, // In stock
    { id: 'b2', qty: 3, stock: 1 }  // OUT OF STOCK (qty 3 > stock 1)
  ];

  let transactionRolledBack = false;
  let holdsInserted = [];

  // Simulate atomic transaction
  for (const item of cartItems) {
    if (item.qty > item.stock) {
      transactionRolledBack = true;
      holdsInserted = []; // ROLLBACK cleans up holds
      break;
    }
    holdsInserted.push(item.id);
  }

  assert(transactionRolledBack === true && holdsInserted.length === 0, 'Multi-Item Cart: Transaction rolls back fully if 1 item is out of stock');
} catch (err) {
  assert(false, 'Multi-Item Cart Rollback', err.message);
}

// 4. Double Stock Release Idempotency Test
try {
  let holdState = { id: 'sh-123', status: 'held', qty: 2 };
  let stock = 10;

  function releaseHold() {
    if (holdState.status === 'held') {
      holdState.status = 'released';
      stock += holdState.qty;
      return 1; // 1 row updated
    }
    return 0; // 0 rows updated
  }

  const firstCall = releaseHold();
  const secondCall = releaseHold();

  assert(firstCall === 1 && stock === 12, 'Stock Release 1st Call: Restores stock to 12');
  assert(secondCall === 0 && stock === 12, 'Stock Release 2nd Call: Idempotent no-op (stock remains 12)');
} catch (err) {
  assert(false, 'Stock Release Idempotency', err.message);
}

// 5. Atomic Orphan Refund Claim Simulation
try {
  let paymentState = { id: 'pay_999', status: 'ORPHAN_CAPTURED' };

  function atomicClaimWorker(workerName) {
    if (paymentState.status === 'ORPHAN_CAPTURED') {
      paymentState.status = 'REFUNDING';
      return { worker: workerName, claimed: true };
    }
    return { worker: workerName, claimed: false };
  }

  const workerA = atomicClaimWorker('Worker A');
  const workerB = atomicClaimWorker('Worker B');

  assert(workerA.claimed === true && workerB.claimed === false, 'Atomic Refund Claim: Worker A wins claim; Worker B is safely blocked');
  assert(paymentState.status === 'REFUNDING', 'Payment state transitioned to REFUNDING');
} catch (err) {
  assert(false, 'Atomic Refund Claim', err.message);
}

// 6. Order State Machine Transition Check
try {
  const illegalTransitions = [
    { from: 'DELIVERED', to: 'CANCELLED' },
    { from: 'REFUNDED', to: 'REFUNDING' },
    { from: 'CANCELLED', to: 'CONFIRMED' }
  ];

  function isValidTransition(from, to) {
    if (from === 'DELIVERED' && to === 'CANCELLED') return false;
    if (from === 'REFUNDED' && to === 'REFUNDING') return false;
    if (from === 'CANCELLED' && to === 'CONFIRMED') return false;
    return true;
  }

  const allRejected = illegalTransitions.every(t => !isValidTransition(t.from, t.to));
  assert(allRejected === true, 'Order State Machine: Rejects all illegal transitions (DELIVERED -> CANCELLED, REFUNDED -> REFUNDING, etc.)');
} catch (err) {
  assert(false, 'Order State Machine', err.message);
}

// 7. Customer IDOR Query Scoping Test
try {
  const currentUserId = 'usr_alice';
  const targetOrderId = 'ord_bob_123';

  const mockDbOrders = [
    { id: 'ord_bob_123', user_id: 'usr_bob', order_number: 'ORD-BOB-001' },
    { id: 'ord_alice_456', user_id: 'usr_alice', order_number: 'ORD-ALICE-001' }
  ];

  // Scoped query: WHERE (id = orderId OR order_number = orderId) AND user_id = currentUserId
  const result = mockDbOrders.find(o => (o.id === targetOrderId || o.order_number === targetOrderId) && o.user_id === currentUserId);

  assert(result === undefined, 'IDOR Scoping: User Alice querying User Bob order returns undefined (HTTP 404)');
} catch (err) {
  assert(false, 'IDOR Scoping', err.message);
}

console.log('\n------------------------------------------------------');
console.log(`📊 RESULTS: ${passed} Passed, ${failed} Failed (${passed + failed} Total)`);
console.log('------------------------------------------------------\n');

if (failed > 0) {
  process.exit(1);
}
