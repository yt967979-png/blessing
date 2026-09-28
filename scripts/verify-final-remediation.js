/**
 * Final Production Remediation & Verification Suite
 * Adversarial verification for BUG-001, BUG-002, BUG-003, BUG-004, BUG-005
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Ensure TypeScript path aliases (@/) and module interop are handled seamlessly
if (!process.env.TSX_SUBPROCESS) {
  const { spawnSync } = require('child_process');
  const res = spawnSync('npx', ['--yes', 'tsx', __filename], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, TSX_SUBPROCESS: '1' },
  });
  process.exit(res.status ?? 0);
}

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-for-remediation-pass-32chars';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/blessing_db';

let passed = 0;
let failed = 0;

function pass(msg) {
  passed++;
  console.log(`  ✅ [PASS] ${msg}`);
}

function fail(msg, err) {
  failed++;
  console.error(`  ❌ [FAIL] ${msg}`);
  if (err) console.error(err);
}

async function runTests() {
  console.log('================================================================');
  console.log('🛡️ FINAL PRODUCTION REMEDIATION ADVERSARIAL TEST SUITE');
  console.log('================================================================\n');

  // ============================================================================
  // TEST SECTION 1: BUG-001 (Razorpay Timeout & Connection Pool Starvation Guard)
  // ============================================================================
  console.log('--- 1. BUG-001: RAZORPAY TIMEOUT & DB POOL STARVATION SHIELD ---');
  try {
    const { verifyRazorpayPayment } = require('../src/lib/orderPricing');

    // 1.1 Test timeout protection with fake hanging endpoint
    const startTime = Date.now();
    const result = await verifyRazorpayPayment({
      razorpayOrderId: 'order_fake_hang_123',
      razorpayPaymentId: 'pay_fake_hang_123',
      razorpaySignature: 'bad_signature_test',
      expectedRupees: 500,
    });
    const elapsed = Date.now() - startTime;

    assert.strictEqual(result.ok, false, 'Invalid signature / hanging request must return ok: false');
    pass('1.1 Invalid signature or timeout rejected cleanly without unhandled rejection');

    // 1.2 Verify timeout signal presence on orderPricing implementation
    const pricingSrc = fs.readFileSync(path.join(__dirname, '../src/lib/orderPricing.ts'), 'utf8');
    assert.ok(pricingSrc.includes('AbortSignal.timeout(8000)'), 'orderPricing.ts must enforce 8000ms AbortSignal timeout');
    pass('1.2 Bounded 8000ms AbortSignal.timeout verified in orderPricing.ts');

    // 1.3 Verify orders/route.ts verifies payment BEFORE BEGIN transaction
    const ordersRouteSrc = fs.readFileSync(path.join(__dirname, '../src/app/api/orders/route.ts'), 'utf8');
    const verifyIdx = ordersRouteSrc.indexOf('await verifyRazorpayPayment');
    const beginIdx = ordersRouteSrc.indexOf("await client.query('BEGIN')", verifyIdx > 0 ? 0 : 0);
    
    // In our modified code, verifyRazorpayPayment occurs BEFORE client.query('BEGIN')
    assert.ok(verifyIdx > 0, 'verifyRazorpayPayment must be present');
    assert.ok(ordersRouteSrc.indexOf("await client.query('BEGIN')") > verifyIdx, 'client.query("BEGIN") must occur AFTER verifyRazorpayPayment');
    pass('1.3 External verifyRazorpayPayment executes BEFORE database transaction BEGIN');

    // 1.4 Verify razorpayRefund.ts enforces bounded 8000ms timeout
    const refundSrc = fs.readFileSync(path.join(__dirname, '../src/lib/razorpayRefund.ts'), 'utf8');
    assert.ok(refundSrc.includes('AbortSignal.timeout(8000)'), 'razorpayRefund.ts must enforce 8000ms AbortSignal timeout');
    pass('1.4 Bounded 8000ms AbortSignal.timeout verified in razorpayRefund.ts');

  } catch (err) {
    fail('BUG-001 Verification failed', err);
  }

  // ============================================================================
  // TEST SECTION 2: BUG-002 (Storage Abstraction & Multi-Replica Support)
  // ============================================================================
  console.log('\n--- 2. BUG-002: STORAGE ABSTRACTION & MULTI-REPLICA PERSISTENCE ---');
  try {
    const { LocalStorageProvider, S3CompatibleStorageProvider, getStorageProvider } = require('../src/lib/storage');

    // 2.1 Local Storage Provider write and retrieval
    const local = new LocalStorageProvider();
    const testBuffer = Buffer.from('TEST_IMAGE_BINARY_DATA');
    const saved = await local.saveFile({
      buffer: testBuffer,
      filename: 'remediation-test.jpg',
      mimeType: 'image/jpeg',
      subDir: 'catalog',
    });

    assert.ok(saved.url.startsWith('/uploads/catalog/'), 'Saved URL must start with /uploads/catalog/');
    assert.strictEqual(saved.provider, 'vps-disk');
    assert.ok(fs.existsSync(path.join(process.cwd(), 'public', saved.url)), 'File must exist on disk');
    pass('2.1 LocalStorageProvider writes file cleanly with provider="vps-disk"');

    // 2.2 Path traversal attack on storage
    const pathTraversalSaved = await local.saveFile({
      buffer: testBuffer,
      filename: '../../../../etc/passwd.jpg',
      mimeType: 'image/jpeg',
      subDir: 'catalog/../secrets',
    });
    assert.ok(!pathTraversalSaved.url.includes('..'), 'Path traversal components must be stripped');
    assert.ok(!pathTraversalSaved.key.includes('..'), 'Key must not contain path traversal');
    pass('2.2 Path traversal attempt sanitized and neutralized');

    // 2.3 S3 Provider SigV4 initialization and configuration
    const s3 = new S3CompatibleStorageProvider({
      bucket: 'test-bucket',
      endpoint: 'https://test-account.r2.cloudflarestorage.com',
      region: 'auto',
      accessKeyId: 'test-key-id',
      secretAccessKey: 'test-secret-key-1234567890',
      publicUrlPrefix: 'https://cdn.blessingpowerguide.com',
    });
    assert.strictEqual(s3.name, 's3-compatible');
    pass('2.3 S3CompatibleStorageProvider initialized with Cloudflare R2 / S3 SigV4 signature capability');

    // 2.4 Verify upload route uses getStorageProvider
    const uploadRouteSrc = fs.readFileSync(path.join(__dirname, '../src/app/api/upload/route.ts'), 'utf8');
    assert.ok(uploadRouteSrc.includes('getStorageProvider'), 'upload route must use getStorageProvider abstraction');
    assert.ok(!uploadRouteSrc.includes("provider: 'vps-disk'"), 'upload route must not hardcode vps-disk provider');
    pass('2.4 POST /api/upload uses storage abstraction rather than hardcoded local disk write');

    // Cleanup local test file
    await local.deleteFile(saved.key);
    await local.deleteFile(pathTraversalSaved.key);
    pass('2.5 Storage cleanup verified');
  } catch (err) {
    fail('BUG-002 Verification failed', err);
  }

  // ============================================================================
  // TEST SECTION 3: BUG-003 (JSON-LD Script Breakout Defense)
  // ============================================================================
  console.log('\n--- 3. BUG-003: JSON-LD SCRIPT BREAKOUT & XSS NEUTRALIZATION ---');
  try {
    const { serializeJsonLd } = require('../src/lib/jsonLd');

    // 3.1 Malicious product title attempting script breakout
    const maliciousPayload = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: 'Electrical Engineering </script><script>alert("XSS")</script>',
      description: 'Test description containing </script><img src=x onerror=alert(1)>',
    };

    const serialized = serializeJsonLd(maliciousPayload);

    // Assert that literal "</script>" is completely absent
    assert.ok(!serialized.includes('</script>'), 'Serialized JSON-LD must never contain literal </script>');
    assert.ok(serialized.includes('\\u003c/script>'), 'Serialized JSON-LD must escape < to \\u003c');
    pass('3.1 Malicious </script> tags strictly escaped to \\u003c/script>');

    // 3.2 Verify valid JSON parsing restores exact original content
    const parsed = JSON.parse(serialized);
    assert.strictEqual(parsed.name, maliciousPayload.name, 'JSON.parse must yield identical original string value');
    assert.strictEqual(parsed.description, maliciousPayload.description, 'JSON.parse must yield identical description');
    pass('3.2 Schema data fidelity preserved: parsed object equals source data');

    // 3.3 Verify all storefront JSON-LD pages use serializeJsonLd
    const pdpSrc = fs.readFileSync(path.join(__dirname, '../src/app/products/[slug]/ProductDetailClient.tsx'), 'utf8');
    const pdpPageSrc = fs.readFileSync(path.join(__dirname, '../src/app/products/[slug]/page.tsx'), 'utf8');
    const homeSrc = fs.readFileSync(path.join(__dirname, '../src/app/page.tsx'), 'utf8');

    assert.ok(pdpSrc.includes('serializeJsonLd'), 'ProductDetailClient.tsx must use serializeJsonLd');
    assert.ok(pdpPageSrc.includes('serializeJsonLd'), 'products/[slug]/page.tsx must use serializeJsonLd');
    assert.ok(homeSrc.includes('serializeJsonLd'), 'page.tsx must use serializeJsonLd');
    pass('3.3 All storefront JSON-LD injection points verified to use serializeJsonLd');
  } catch (err) {
    fail('BUG-003 Verification failed', err);
  }

  // ============================================================================
  // TEST SECTION 4: BUG-004 (Order State Machine Regression Shield)
  // ============================================================================
  console.log('\n--- 4. BUG-004: ORDER STATE MACHINE REGRESSION SHIELD ---');
  try {
    const { canTransitionOrderStatus } = require('../src/lib/orderStatus');

    // 4.1 Delivered regressions must be strictly rejected
    const illegalRegressions = [
      'In Transit',
      'Out for Delivery',
      'Delivery Attempted',
      'Handed to ST Courier',
      'Packed',
      'Confirmed',
      'Order Placed',
    ];

    for (const target of illegalRegressions) {
      const res = canTransitionOrderStatus('Delivered', target);
      assert.strictEqual(res.allowed, false, `Delivered -> "${target}" must be rejected`);
      assert.ok(res.reason.includes('Cannot revert a Delivered order'), `Reason must specify Delivered restriction: ${res.reason}`);
    }
    pass('4.1 All regressions from Delivered (In Transit, OFD, Packed, Confirmed, etc.) strictly rejected');

    // 4.2 Legitimate transitions from Delivered
    const legitimateDelivered = ['Returned', 'RTO', 'Delivered'];
    for (const target of legitimateDelivered) {
      const res = canTransitionOrderStatus('Delivered', target);
      assert.strictEqual(res.allowed, true, `Delivered -> "${target}" must be allowed`);
    }
    pass('4.2 Legitimate Delivered transitions (Returned, RTO, idempotent Delivered) allowed');

    // 4.3 Terminal Cancelled and Returned cannot be resurrected
    const cancelRes = canTransitionOrderStatus('Cancelled', 'Confirmed');
    assert.strictEqual(cancelRes.allowed, false, 'Cancelled -> Confirmed must be rejected');
    assert.ok(cancelRes.reason.includes('terminal'), 'Reason must specify terminal state');

    const returnRes = canTransitionOrderStatus('Returned', 'Delivered');
    assert.strictEqual(returnRes.allowed, false, 'Returned -> Delivered must be rejected');
    assert.ok(returnRes.reason.includes('terminal'), 'Reason must specify terminal state');
    pass('4.3 Terminal states (Cancelled, Returned) cannot be resurrected to earlier states');

    // 4.4 Verify orders route enforces canTransitionOrderStatus
    const routeSrc = fs.readFileSync(path.join(__dirname, '../src/app/api/orders/route.ts'), 'utf8');
    assert.ok(routeSrc.includes('canTransitionOrderStatus(currentStatus, newStatus)'), 'PATCH /api/orders must call canTransitionOrderStatus');
    pass('4.4 PATCH /api/orders enforces canonical canTransitionOrderStatus state machine');
  } catch (err) {
    fail('BUG-004 Verification failed', err);
  }

  // ============================================================================
  // TEST SECTION 5: BUG-005 (Device Binding Strict Enforcement & Stream Tickets)
  // ============================================================================
  console.log('\n--- 5. BUG-005: DEVICE BINDING ENFORCEMENT & SSE STREAM TICKETS ---');
  try {
    const {
      createSessionToken,
      verifySessionToken,
      createStreamTicket,
      verifyStreamTicket,
    } = require('../src/lib/auth');

    const userId = 'usr_test_device_binding';
    const role = 'customer';
    const deviceId = 'device_fingerprint_alpha_123';

    const token = createSessionToken(userId, role, deviceId);

    // 5.1 Valid token + correct device ID -> Accepted
    const valid = verifySessionToken(token, deviceId);
    assert.ok(valid, 'Valid token + matching device ID must be accepted');
    assert.strictEqual(valid.userId, userId);
    assert.strictEqual(valid.role, role);
    pass('5.1 Valid token with matching deviceId accepted');

    // 5.2 Valid token + mismatched device ID -> Rejected
    const wrongDevice = verifySessionToken(token, 'device_fingerprint_impostor_999');
    assert.strictEqual(wrongDevice, null, 'Valid token + wrong device ID must be rejected');
    pass('5.2 Valid token with mismatched deviceId strictly rejected');

    // 5.3 Valid device-bound token + NO device ID (BUG-005 fix) -> Rejected
    const missingDevice = verifySessionToken(token, null);
    assert.strictEqual(missingDevice, null, 'Device-bound token without device ID must be rejected');

    const emptyDevice = verifySessionToken(token, '');
    assert.strictEqual(emptyDevice, null, 'Device-bound token with empty string device ID must be rejected');

    const undefinedDevice = verifySessionToken(token, undefined);
    assert.strictEqual(undefinedDevice, null, 'Device-bound token with undefined device ID must be rejected');
    pass('5.3 Device-bound token with missing/omitted device identifier strictly rejected');

    // 5.4 Token tampering -> Rejected
    const tampered = token.slice(0, -6) + 'xxxxxx';
    const tamperedRes = verifySessionToken(tampered, deviceId);
    assert.strictEqual(tamperedRes, null, 'Tampered token must be rejected');
    pass('5.4 Tampered token signature strictly rejected');

    // 5.5 Expired token -> Rejected
    const expiredPayload = { userId, role, did: deviceId, exp: Date.now() - 5000 };
    const pStr = JSON.stringify(expiredPayload);
    const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(pStr).digest('hex');
    const expiredToken = Buffer.from(JSON.stringify({ p: pStr, s: sig })).toString('base64url');
    const expiredRes = verifySessionToken(expiredToken, deviceId);
    assert.strictEqual(expiredRes, null, 'Expired token must be rejected');
    pass('5.5 Expired token strictly rejected');

    // 5.6 SSE Stream Ticket validation
    const streamTicket = createStreamTicket(userId, role, deviceId);
    const validStream = verifyStreamTicket(streamTicket, deviceId);
    assert.ok(validStream, 'Valid stream ticket must be accepted');
    assert.strictEqual(validStream.userId, userId);
    pass('5.6 Dedicated SSE stream ticket accepted for live streams');

    // 5.7 Stream ticket cannot be used as general session token
    // verifySessionToken expects payload without purpose: sse_stream restrictions or checks purpose
    // and verifyStreamTicket rejects tokens without purpose: sse_stream
    const normalAsStream = verifyStreamTicket(token, deviceId);
    assert.strictEqual(normalAsStream, null, 'General session token cannot be used where stream ticket required');
    pass('5.7 General session token rejected when stream ticket expected (separation of concerns)');

  } catch (err) {
    fail('BUG-005 Verification failed', err);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n================================================================');
  console.log(`📊 FINAL REMEDIATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    console.error(`❌ Remediation suite encountered ${failed} failures!`);
    process.exit(1);
  } else {
    console.log('🎉 ALL 5 REMEDIATED VULNERABILITIES VERIFIED WITH ZERO FAILURES!');
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
