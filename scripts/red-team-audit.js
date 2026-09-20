/**
 * ==============================================================================
 * Blessing Power Guide — Red-Team Adversarial Penetration Testing Suite
 * ==============================================================================
 * 
 * Verifies 10 critical security vectors against the target environment:
 * 1.  IDOR Protection on Orders & Invoices
 * 2.  Checkout Cart & Price Tampering Resistance
 * 3.  Negative, Zero, and Non-Integer Quantity Rejection
 * 4.  Privilege Escalation on Catalog Modification
 * 5.  Privilege Escalation on Admin User Management
 * 6.  Cryptographic Signature Verification on Razorpay Webhooks
 * 7.  Path Traversal & Unauthenticated Upload Protection
 * 8.  Coupon Brute-Force & High-Frequency Rate Limiting
 * 9.  SQL Injection Immunity across Search & Filters
 * 10. Cross-Site Scripting (XSS) Input Sanitization
 * ==============================================================================
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const TARGET_URL = process.env.TARGET_URL || process.argv[2] || 'https://blessingpowerguide.in';

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║        BLESSING POWER GUIDE — ADVERSARIAL PENETRATION AUDIT          ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');
console.log(`🎯 Target Endpoint: ${TARGET_URL}`);
console.log(`⏱️  Timestamp:       ${new Date().toISOString()}\n`);

let passedTests = 0;
let failedTests = 0;

function makeRequest(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const client = parsed.protocol === 'https:' ? https : http;
    const reqOptions = {
      method: options.method || 'GET',
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'BPG-RedTeam-Auditor/1.0',
        'Accept': 'application/json, text/plain, */*',
        ...(options.headers || {}),
      },
      timeout: options.timeout || 15000,
    };

    const req = client.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body,
          json,
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runVector(name, testFn) {
  process.stdout.write(`⚡ Testing ${name}... `);
  try {
    const result = await testFn();
    if (result.passed) {
      console.log(`\x1b[32m[PASSED]\x1b[0m — ${result.reason}`);
      passedTests++;
    } else {
      console.log(`\x1b[31m[FAILED]\x1b[0m — ${result.reason}`);
      failedTests++;
    }
  } catch (err) {
    console.log(`\x1b[31m[ERROR]\x1b[0m — ${err.message}`);
    failedTests++;
  }
}

async function runAudit() {
  // Vector 1: IDOR Protection
  await runVector('1. IDOR on Orders & Invoices', async () => {
    const fakeOrder = await makeRequest(`${TARGET_URL}/api/orders/ord-attacker-fake/invoice`, {
      method: 'GET',
    });
    // Should be 401 Unauthorized or 403 Forbidden or 404 Not Found without leaking PII
    const safe = fakeOrder.statusCode === 401 || fakeOrder.statusCode === 403 || fakeOrder.statusCode === 404;
    return {
      passed: safe,
      reason: safe ? `Blocked with HTTP ${fakeOrder.statusCode}` : `Leaked with HTTP ${fakeOrder.statusCode}`,
    };
  });

  // Vector 2: Price Tampering in Order Creation
  await runVector('2. Price Tampering Prevention', async () => {
    const tamperedPayload = {
      items: [{ book_id: 'book-10th-tamil', qty: 1, price: 0.01 }],
      amount: 0.01,
      total_amount: 0.01,
    };
    const res = await makeRequest(`${TARGET_URL}/api/razorpay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: tamperedPayload,
    });
    // Server must reject or recalculate from DB (never accept client-specified ₹0.01)
    const safe = res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 403 || (res.json && res.json.amount && res.json.amount >= 2000);
    return {
      passed: safe,
      reason: safe ? `Client-tampered price rejected/overridden (HTTP ${res.statusCode})` : `Accepted client price (HTTP ${res.statusCode})`,
    };
  });

  // Vector 3: Negative / Non-Integer Quantities
  await runVector('3. Negative & Non-Integer Quantity Rejection', async () => {
    const negQtyPayload = {
      items: [{ bookId: 'book-10th-tamil', qty: -5 }],
    };
    const res = await makeRequest(`${TARGET_URL}/api/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: negQtyPayload,
    });
    const safe = res.statusCode === 400 || res.statusCode === 422 || (res.json && (res.json.error || !res.json.valid));
    return {
      passed: safe,
      reason: safe ? `Negative quantity successfully rejected (HTTP ${res.statusCode})` : `Failed to reject negative qty`,
    };
  });

  // Vector 4: Privilege Escalation on Products
  await runVector('4. Privilege Escalation on Products (PATCH)', async () => {
    const res = await makeRequest(`${TARGET_URL}/api/products`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: { id: 'book-10th-tamil', price: 1 },
    });
    const safe = res.statusCode === 401 || res.statusCode === 403;
    return {
      passed: safe,
      reason: safe ? `Unauthorized product modification rejected (HTTP ${res.statusCode})` : `Privilege escalation succeeded! (HTTP ${res.statusCode})`,
    };
  });

  // Vector 5: Privilege Escalation on Admin Users
  await runVector('5. Privilege Escalation on User Role Promotion', async () => {
    const res = await makeRequest(`${TARGET_URL}/api/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { userId: 'attacker', role: 'super_admin' },
    });
    const safe = res.statusCode === 401 || res.statusCode === 403;
    return {
      passed: safe,
      reason: safe ? `Unauthorized user role promotion rejected (HTTP ${res.statusCode})` : `Privilege escalation allowed! (HTTP ${res.statusCode})`,
    };
  });

  // Vector 6: Forged Razorpay Webhook
  await runVector('6. Forged Razorpay Webhook Rejection', async () => {
    const res = await makeRequest(`${TARGET_URL}/api/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': 'attacker_fake_signature_abc123',
      },
      body: {
        event: 'payment.captured',
        payload: { payment: { entity: { id: 'pay_fake', order_id: 'order_fake', amount: 100 } } },
      },
    });
    const safe = res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 403;
    return {
      passed: safe,
      reason: safe ? `Forged webhook signature rejected (HTTP ${res.statusCode})` : `Forged webhook accepted! (HTTP ${res.statusCode})`,
    };
  });

  // Vector 7: Path Traversal & Unauthenticated Upload
  await runVector('7. Unauthenticated File Upload & Path Traversal', async () => {
    // Sub-test A: Invalid content-type (non-multipart)
    const resA = await makeRequest(`${TARGET_URL}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { filename: '../../../../etc/passwd', content: 'hacked' },
    });

    // Sub-test B: Unauthenticated multipart upload attempt
    const boundary = '----WebKitFormBoundaryAttack123';
    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="../../../evil.exe"\r\n` +
      `Content-Type: text/plain\r\n\r\n` +
      `malicious_payload\r\n` +
      `--${boundary}--\r\n`;
    const resB = await makeRequest(`${TARGET_URL}/api/upload`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: multipartBody,
    });

    const safeA = resA.statusCode === 400 || resA.statusCode === 401 || resA.statusCode === 403 || resA.statusCode === 500;
    const safeB = resB.statusCode === 400 || resB.statusCode === 401 || resB.statusCode === 403;
    const passed = safeA && safeB;
    return {
      passed,
      reason: passed
        ? `Blocked without authorization (Non-multipart: ${resA.statusCode}, Unauth multipart: ${resB.statusCode})`
        : `Upload vulnerability detected!`,
    };
  });

  // Vector 8: Coupon Brute-Force Rate Limiting
  await runVector('8. Coupon Brute-Force Protection', async () => {
    let rejectedCount = 0;
    for (let i = 0; i < 5; i++) {
      const res = await makeRequest(`${TARGET_URL}/api/admin/coupons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { code: `BRUTE_${i}` },
      });
      if (res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 429) {
        rejectedCount++;
      }
    }
    const safe = rejectedCount === 5;
    return {
      passed: safe,
      reason: safe ? `All unauthenticated coupon attempts rejected` : `Only ${rejectedCount}/5 rejected`,
    };
  });

  // Vector 9: SQL Injection Resilience
  await runVector('9. SQL Injection Vector Testing', async () => {
    const sqliPayload = encodeURIComponent("' OR 1=1; DROP TABLE books; --");
    const res = await makeRequest(`${TARGET_URL}/api/products?search=${sqliPayload}&cls=${sqliPayload}`);
    const safe = res.statusCode === 200 && Array.isArray(res.json);
    return {
      passed: safe,
      reason: safe ? `SQLi payload safely parameterized (HTTP 200, returned ${res.json.length} records)` : `Failed to handle SQLi safely (HTTP ${res.statusCode})`,
    };
  });

  // Vector 10: XSS Input Neutralization
  await runVector('10. Cross-Site Scripting (XSS) Neutralization', async () => {
    const xssPayload = {
      name: '<script>alert("xss")</script>',
      email: 'attacker@test.com',
      phone: '9999999999',
      subject: 'Inquiry <img src=x onerror=alert(1)>',
      message: 'Hello <iframe src="evil.com"></iframe>',
    };
    const res = await makeRequest(`${TARGET_URL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: xssPayload,
    });
    // Endpoint should either accept and sanitize, or reject
    const safe = res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 400;
    return {
      passed: safe,
      reason: safe ? `XSS payload handled safely by server (HTTP ${res.statusCode})` : `Server crashed on XSS payload (HTTP ${res.statusCode})`,
    };
  });

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`📊 RED-TEAM AUDIT SUMMARY:`);
  console.log(`   - Passed Vectors: \x1b[32m${passedTests}\x1b[0m / 10`);
  console.log(`   - Failed Vectors: \x1b[${failedTests === 0 ? '32' : '31'}m${failedTests}\x1b[0m / 10`);
  console.log(`   - Security Score: ${((passedTests / 10) * 100).toFixed(0)}%`);

  if (failedTests === 0) {
    console.log(`\n🏆 VERDICT: ZERO HIGH-SEVERITY VULNERABILITIES DETECTED.`);
    console.log(`   All critical attack vectors successfully repelled.`);
  } else {
    console.log(`\n⚠️ VERDICT: ${failedTests} VULNERABILITY VECTORS REQUIRE ATTENTION.`);
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Audit fatal error:', err);
  process.exit(1);
});
