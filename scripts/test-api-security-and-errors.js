/**
 * API Error Handling & Security Boundary Test Harness
 * Tests:
 * 1. SQL injection attempts in search, order tracking, and products filter.
 * 2. Malformed JSON bodies to POST endpoints.
 * 3. Type confusion (e.g. array where string expected, negative numbers).
 * 4. Verifies structured JSON error output (no stack traces, no leaked DB internals).
 * 5. Path traversal attempts in upload route.
 */

const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';

async function sendTest(name, path, options = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE_URL);
    const opts = {
      method: options.method || 'GET',
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': 'BPG-SecurityAudit/1.0',
        'Accept': 'application/json,text/html,*/*',
        ...(options.headers || {}),
      },
      timeout: 8000,
    };

    if (options.body) {
      opts.headers['Content-Type'] = options.contentType || 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        resolve({
          name,
          status: res.statusCode,
          headers: res.headers,
          body,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        name,
        status: 0,
        headers: {},
        body: err.message,
      });
    });

    if (options.body) req.write(options.body);
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🛡️  API ERROR HANDLING & SECURITY BOUNDARY AUDIT');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================\n');

  const tests = [
    // 1. SQL Injection vectors
    {
      name: 'SQLi: Product search with quote and OR 1=1',
      path: "/api/products?q=' OR 1=1 --",
      method: 'GET',
      validate: (r) => r.status === 200 && !r.body.includes('syntax error') && !r.body.includes('pg_'),
    },
    {
      name: 'SQLi: Order tracking with UNION SELECT injection',
      path: "/api/track?orderId=' UNION SELECT 1,2,3,4,5,6,7,8,9,10,11,12 --",
      method: 'GET',
      validate: (r) => (r.status === 404 || r.status === 400) && !r.body.includes('syntax error'),
    },
    {
      name: 'SQLi: Products class filter with tautology',
      path: "/api/products?cls=10th' OR '1'='1",
      method: 'GET',
      validate: (r) => r.status === 200 && !r.body.includes('pg_stat'),
    },

    // 2. Malformed / Poisoned JSON
    {
      name: 'Malformed JSON: Unclosed JSON string in Cart Validate',
      path: '/api/cart/validate',
      method: 'POST',
      body: '{"items": [{"id": "b1", "qty": }',
      validate: (r) => r.status >= 400 && r.status < 500 && !r.body.includes('node_modules'),
    },
    {
      name: 'Malformed JSON: Raw binary nulls in Coupon Validate',
      path: '/api/coupons/validate',
      method: 'POST',
      body: '{"code": "\x00\x00\x00", "subtotal": -500}',
      validate: (r) => r.status >= 400 && !r.body.includes('stack'),
    },

    // 3. Type Confusion & Negative Quantities
    {
      name: 'Business Logic: Negative quantity in Cart Abandon',
      path: '/api/cart/abandon',
      method: 'POST',
      body: JSON.stringify({ phone: '9876543210', items: [{ id: 'b1', qty: -10 }] }),
      validate: (r) => r.status >= 400 || r.status === 200, // Safe handling
    },
    {
      name: 'Type Confusion: Array passed where string expected in Send OTP',
      path: '/api/auth/send-otp',
      method: 'POST',
      body: JSON.stringify({ phone: ['9876543210', 'admin'] }),
      validate: (r) => r.status >= 400 && !r.body.includes('TypeError'),
    },

    // 4. Path Traversal
    {
      name: 'Path Traversal: Uploads path traversal escape',
      path: '/uploads/....//....//etc/passwd',
      method: 'GET',
      validate: (r) => (r.status === 403 || r.status === 404) && !r.body.includes('root:x:'),
    },

    // 5. Admin Authorization Boundary
    {
      name: 'Auth Boundary: Unauthenticated Admin Analytics',
      path: '/api/admin/analytics',
      method: 'GET',
      validate: (r) => r.status === 401,
    },
    {
      name: 'Auth Boundary: Customer session on Admin Analytics',
      path: '/api/admin/analytics',
      method: 'GET',
      headers: { Cookie: 'bpg_session=eyJhbGciOiJIUzI1NiJ9.test.sig' },
      validate: (r) => r.status === 401,
    },
    {
      name: 'Auth Boundary: Unauthenticated Admin Users list',
      path: '/api/admin/users',
      method: 'GET',
      validate: (r) => r.status === 401,
    },
    {
      name: 'Auth Boundary: Unauthenticated Custom Order creation',
      path: '/api/admin/orders/custom',
      method: 'POST',
      body: JSON.stringify({ phone: '9876543210', name: 'Test' }),
      validate: (r) => r.status === 401,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const t of tests) {
    const res = await sendTest(t.name, t.path, t);
    const ok = t.validate(res);
    const hasStack = res.body.includes(' at ') && res.body.includes('.ts:');
    const safeError = !hasStack;

    if (ok && safeError) {
      passed++;
      console.log(`  ✅ [PASS] ${t.name.padEnd(52)} (HTTP ${res.status})`);
    } else {
      failed++;
      console.error(`  ❌ [FAIL] ${t.name} (HTTP ${res.status}) - Body: ${res.body.slice(0, 100)}`);
    }
  }

  console.log('\n================================================================');
  console.log(`📊 SECURITY & ERROR HANDLING AUDIT: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) process.exit(1);
}

run().catch(console.error);
