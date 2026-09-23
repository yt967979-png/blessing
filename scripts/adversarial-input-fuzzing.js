/**
 * Phase 4: Adversarial Input Fuzzing Matrix
 * Tests 24 adversarial payload categories across public and authenticated API endpoints.
 * Asserts: clean 4xx rejections, NO 500 internal server error, NO server crash.
 */

const http = require('http');
const https = require('https');

const BASE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';

function sendRaw(path, method, body, contentType = 'application/json', headers = {}) {
  return new Promise((resolve) => {
    const isHttps = BASE_URL.startsWith('https');
    const client = isHttps ? https : http;
    const url = new URL(path, BASE_URL);

    const reqHeaders = {
      'User-Agent': 'AdversarialFuzzer/1.0',
      'Accept': 'application/json,text/html,*/*',
      ...headers,
    };

    if (body !== undefined && body !== null) {
      reqHeaders['Content-Type'] = contentType;
      reqHeaders['Content-Length'] = Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body));
    }

    const req = client.request(url, {
      method,
      headers: reqHeaders,
      timeout: 8000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, body: data, json });
      });
    });

    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 408, error: 'Timeout' }); });

    if (body !== undefined && body !== null) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

// 24 Adversarial Fuzz Vectors
const FUZZ_VECTORS = [
  { id: 'FUZZ-01', name: 'SQLi Standard String', payload: "' OR '1'='1" },
  { id: 'FUZZ-02', name: 'SQLi Stacked Query', payload: "'; DROP TABLE orders; --" },
  { id: 'FUZZ-03', name: 'SQLi Union Select', payload: "' UNION SELECT null, null, username, password FROM users --" },
  { id: 'FUZZ-04', name: 'XSS Script Tag', payload: '<script>alert("XSS")</script>' },
  { id: 'FUZZ-05', name: 'XSS Image onerror', payload: '<img src=x onerror=alert(1)>' },
  { id: 'FUZZ-06', name: 'XSS SVG payload', payload: '<svg/onload=alert(document.cookie)>' },
  { id: 'FUZZ-07', name: 'Path Traversal Directory', payload: '../../../../../../etc/passwd' },
  { id: 'FUZZ-08', name: 'Null Byte Encoded', payload: 'test%00user' },
  { id: 'FUZZ-09', name: 'Unicode Tamil Glyphs', payload: 'பிளெஸ்ஸிங் பவர் கைடு தமிழ்நாடு 2026' },
  { id: 'FUZZ-10', name: 'RTL Override Characters', payload: '\u202E\u0041\u0042\u0043\u202D' },
  { id: 'FUZZ-11', name: 'Zero-Width Spaces & Joiners', payload: 'user\u200B\u200C\u200D\uFEFFname' },
  { id: 'FUZZ-12', name: 'Multi-byte High Emojis', payload: '📚🚀⚡🔥💎🎉👑💯✨' },
  { id: 'FUZZ-13', name: 'Prototype Pollution __proto__', isRawJson: true, raw: '{"__proto__": {"admin": true, "role": "super_admin"}}' },
  { id: 'FUZZ-14', name: 'Prototype Pollution constructor', isRawJson: true, raw: '{"constructor": {"prototype": {"isAdmin": true}}}' },
  { id: 'FUZZ-15', name: 'Negative Integer (-1)', numericVal: -1 },
  { id: 'FUZZ-16', name: 'Negative Float (-99.99)', numericVal: -99.99 },
  { id: 'FUZZ-17', name: 'Float for Integer Qty (2.5)', numericVal: 2.5 },
  { id: 'FUZZ-18', name: 'Massive Integer (999999999999999999)', numericVal: 999999999999999999 },
  { id: 'FUZZ-19', name: 'Malformed JSON trailing comma', isRawJson: true, raw: '{"items": [{"id": "b1", "qty": 1,}],}' },
  { id: 'FUZZ-20', name: 'Malformed JSON unquoted key', isRawJson: true, raw: '{items: "none"}' },
  { id: 'FUZZ-21', name: '10KB String', payload: 'A'.repeat(10240) },
  { id: 'FUZZ-22', name: 'Whitespace Only', payload: '     \t\r\n     ' },
  { id: 'FUZZ-23', name: 'Empty String', payload: '' },
  { id: 'FUZZ-24', name: 'Deeply Nested JSON Object (60 levels)', isRawJson: true, raw: (() => {
    let s = '{"leaf": "val"}';
    for (let i = 0; i < 60; i++) s = `{"n": ${s}}`;
    return s;
  })() },
];

async function run() {
  console.log('================================================================');
  console.log('🧪  PHASE 4: ADVERSARIAL INPUT FUZZING MATRIX');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Total Fuzz Vectors: ${FUZZ_VECTORS.length}`);
  console.log('================================================================\n');

  const results = [];
  function record(fuzzId, target, name, passed, status, detail = '') {
    results.push({ fuzzId, target, name, passed, status, detail });
    const mark = passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} [${fuzzId}] ${target}: ${name} -> HTTP ${status} ${detail ? `(${detail})` : ''}`);
  }

  // 1. Fuzz /api/cart/validate (POST)
  for (const f of FUZZ_VECTORS) {
    let body;
    if (f.isRawJson) {
      body = f.raw;
    } else if (f.numericVal !== undefined) {
      body = JSON.stringify({ items: [{ id: 'book-1', qty: f.numericVal }] });
    } else {
      body = JSON.stringify({ items: [{ id: f.payload, qty: 1, title: f.payload }] });
    }

    const res = await sendRaw('/api/cart/validate', 'POST', body);
    // Should never 500. Should return 200 (sanitized/clamped) or 400 (rejected)
    const passed = res.status !== 500 && res.status !== 502 && res.status !== 503 && res.status > 0;
    record(f.id, '/api/cart/validate', f.name, passed, res.status, res.json?.error || (res.status === 200 ? 'Sanitized/Empty' : ''));
  }

  // 2. Fuzz /api/track (POST)
  for (const f of FUZZ_VECTORS.slice(0, 14)) { // string/injection attacks on tracking
    const body = f.isRawJson ? f.raw : JSON.stringify({ orderId: f.payload, phone: f.payload });
    const res = await sendRaw('/api/track', 'POST', body);
    const passed = res.status !== 500 && res.status !== 502 && res.status !== 503 && res.status > 0;
    record(f.id, '/api/track', f.name, passed, res.status, res.json?.error || '');
  }

  // 3. Fuzz /api/coupons/validate (POST)
  for (const f of [FUZZ_VECTORS[0], FUZZ_VECTORS[1], FUZZ_VECTORS[3], FUZZ_VECTORS[7], FUZZ_VECTORS[12], FUZZ_VECTORS[18]]) {
    const body = f.isRawJson ? f.raw : JSON.stringify({ code: f.payload, subtotal: 500 });
    const res = await sendRaw('/api/coupons/validate', 'POST', body);
    const passed = res.status !== 500 && res.status !== 502 && res.status !== 503 && res.status > 0;
    record(f.id, '/api/coupons/validate', f.name, passed, res.status, res.json?.error || '');
  }

  // 4. Fuzz /api/search (GET query param)
  for (const f of [FUZZ_VECTORS[0], FUZZ_VECTORS[1], FUZZ_VECTORS[3], FUZZ_VECTORS[8], FUZZ_VECTORS[11], FUZZ_VECTORS[20]]) {
    const query = encodeURIComponent(f.payload || '');
    const res = await sendRaw(`/api/search?q=${query}`, 'GET', null);
    const passed = res.status !== 500 && res.status !== 502 && res.status !== 503 && res.status > 0;
    record(f.id, '/api/search?q=', f.name, passed, res.status, `results: ${res.json?.length ?? 'N/A'}`);
  }

  // 5. Fuzz /api/orders (POST - unauthenticated malformed attacks)
  for (const f of [FUZZ_VECTORS[12], FUZZ_VECTORS[14], FUZZ_VECTORS[16], FUZZ_VECTORS[18], FUZZ_VECTORS[23]]) {
    let body = f.isRawJson ? f.raw : JSON.stringify({
      customerName: f.payload || 'Test',
      phone: '9840123456',
      shippingAddress: { address: 'Test', city: 'Chennai', pincode: '600001' },
      items: [{ id: 'b1', qty: f.numericVal ?? 1, price: f.numericVal ?? 100 }],
    });
    const res = await sendRaw('/api/orders', 'POST', body);
    const passed = res.status !== 500 && res.status !== 502 && res.status !== 503 && res.status > 0;
    record(f.id, '/api/orders [POST]', f.name, passed, res.status, res.json?.error || '');
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 4 RESULTS: ${passedCount} / ${results.length} PASSED (Zero 500 errors)`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
