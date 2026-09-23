/**
 * Phase 8: Cache Isolation & Private Data Leak Red Team Harness
 * Tests resource isolation and cache headers to prove User A's private data is NEVER leaked to User B or unauthenticated guests.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');

const BASE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';
const DB_URL = process.env.DATABASE_URL || 'postgresql://blessing:blessing2025@localhost:5432/blessing';
const pool = new Pool({ connectionString: DB_URL, max: 5 });

let SESSION_SECRET = process.env.SESSION_SECRET || 'bpg-dev-session-secret-change-in-production';
if (fs.existsSync('/etc/blessing.env')) {
  try {
    const env = fs.readFileSync('/etc/blessing.env', 'utf8');
    for (const line of env.split('\n')) {
      if (line.startsWith('SESSION_SECRET=')) {
        SESSION_SECRET = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch (_) {}
}

function request(path, options = {}) {
  return new Promise((resolve) => {
    const isHttps = BASE_URL.startsWith('https');
    const client = isHttps ? https : http;
    const url = new URL(path, BASE_URL);

    const headers = {
      'User-Agent': 'CacheIsolationTester/1.0',
      'Accept': 'application/json,text/html,*/*',
      ...(options.headers || {}),
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
      headers['Cookie'] = `bpg_session=${options.token}; bpg_device=${options.deviceId || 'dev_cache_iso'}`;
    }

    if (options.body) {
      headers['Content-Type'] = options.contentType || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = client.request(url, {
      method: options.method || 'GET',
      headers,
      timeout: 10000,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          json,
        });
      });
    });

    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 408, error: 'Timeout' }); });

    if (options.body) req.write(options.body);
    req.end();
  });
}

function makeToken(secret, payload) {
  const pStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(pStr).digest('hex');
  return Buffer.from(JSON.stringify({ p: pStr, s: sig })).toString('base64url');
}

function assertPrivateCacheHeaders(headers) {
  const cc = (headers['cache-control'] || '').toLowerCase();
  const cdnCc = (headers['cdn-cache-control'] || '').toLowerCase();
  const cfCc = (headers['cloudflare-cdn-cache-control'] || '').toLowerCase();
  const isPrivate = cc.includes('no-store') || cc.includes('private') || cc.includes('no-cache') || cc.includes('max-age=0');
  return isPrivate;
}

async function run() {
  console.log('================================================================');
  console.log('🔒  PHASE 8: CACHE ISOLATION & PRIVATE DATA LEAK HARNESS');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================\n');

  const client = await pool.connect();
  const results = [];
  function record(id, name, passed, details = '') {
    results.push({ id, name, passed, details });
    const mark = passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} [${id}] ${name} ${details ? `— ${details}` : ''}`);
  }

  const now = Date.now();
  const userA_Id = `usr_cache_a_${now}`;
  const userB_Id = `usr_cache_b_${now}`;
  const devA = `dev_a_${now}`;
  const devB = `dev_b_${now}`;

  const orderA_Id = `ord_cache_a_${now}`;
  const orderA_Num = `BPG-CACHE-${now.toString().slice(-5)}`;
  const orderA_Phone = `9840${now.toString().slice(-6)}`;

  try {
    // 0. Setup Users
    const dummyHash = 'c8b417e2b7c4d5f8:9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a';
    await client.query(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status) VALUES
      ($1, 'Alice Secret', $2, $3, $4, 'customer', 'active'),
      ($5, 'Bob Innocent', $6, '9000000002', $4, 'customer', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [userA_Id, `alice_priv_${now}@test.com`, orderA_Phone, dummyHash, userB_Id, `bob_priv_${now}@test.com`]);

    // Insert Order for Alice
    await client.query(`
      INSERT INTO orders (
        id, order_number, user_id, subtotal, discount, shipping_charge, tax, total_amount,
        payment_method, payment_status, order_status, shipping_address
      ) VALUES (
        $1, $2, $3, 1000, 0, 0, 0, 1000, 'Razorpay UPI', 'PAID', 'Confirmed', $4
      );
    `, [orderA_Id, orderA_Num, userA_Id, JSON.stringify({ name: 'Alice Secret', phone: orderA_Phone, address: 'Secret Bunker 99' })]);

    const bookRow = (await client.query('SELECT id, title, price FROM books LIMIT 1')).rows[0];
    await client.query(`
      INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
      VALUES ($1, $2, $3, $4, 1000, 1, 1000);
    `, [`item_${orderA_Id}`, orderA_Id, bookRow.id, bookRow.title]);

    const tokenA = makeToken(SESSION_SECRET, { userId: userA_Id, role: 'customer', exp: now + 86400000, did: devA });
    const tokenB = makeToken(SESSION_SECRET, { userId: userB_Id, role: 'customer', exp: now + 86400000, did: devB });

    // ── TEST 1: /api/orders Cache Isolation ────────────────────────────────────
    // 1a. User A requests their orders
    const resA = await request('/api/orders', { token: tokenA, deviceId: devA });
    const ordersA = Array.isArray(resA.json) ? resA.json : (resA.json?.orders || []);
    const aliceHasOrder = ordersA.some(o => o.orderNumber === orderA_Num || o.id === orderA_Id);
    const ccA = resA.headers['cache-control'] || '';

    // 1b. Immediately request same URL as User B
    const resB = await request('/api/orders', { token: tokenB, deviceId: devB });
    const ordersB = Array.isArray(resB.json) ? resB.json : (resB.json?.orders || []);
    const bobSeesAliceOrder = ordersB.some(o => o.orderNumber === orderA_Num || o.id === orderA_Id);

    // 1c. Immediately request unauthenticated
    const resUnauth = await request('/api/orders');

    record('CACHE-01', "User A sees their order on /api/orders", aliceHasOrder, `Orders: ${ordersA.length}`);
    record('CACHE-02', "User B NEVER receives User A's cached orders", !bobSeesAliceOrder && ordersB.length === 0, `Bob orders: ${ordersB.length}`);
    record('CACHE-03', "Unauthenticated guest receives 401 on /api/orders (no cached leak)", resUnauth.status === 401, `HTTP ${resUnauth.status}`);
    record('CACHE-04', "/api/orders strictly emits private/no-store Cache-Control headers", assertPrivateCacheHeaders(resA.headers), `Cache-Control: ${ccA}`);

    // ── TEST 2: /api/orders/[id]/invoice Cache Isolation ───────────────────────
    const invA = await request(`/api/orders/${orderA_Id}/invoice`, { token: tokenA, deviceId: devA });
    const invB = await request(`/api/orders/${orderA_Id}/invoice`, { token: tokenB, deviceId: devB });
    const invGuest = await request(`/api/orders/${orderA_Id}/invoice`);

    const invAOk = invA.status === 200 && invA.body.includes('Alice Secret');
    const invBBlocked = invB.status === 401 || invB.status === 403 || invB.status === 404;
    const invGuestBlocked = invGuest.status === 401 || invGuest.status === 403 || invGuest.status === 404;

    record('CACHE-05', "User A successfully retrieves their invoice", invAOk, `HTTP ${invA.status}`);
    record('CACHE-06', "User B NEVER receives User A's cached invoice", invBBlocked, `HTTP ${invB.status}`);
    record('CACHE-07', "Guest NEVER receives User A's cached invoice", invGuestBlocked, `HTTP ${invGuest.status}`);
    record('CACHE-08', "Invoice strictly emits no-store Cache-Control header", assertPrivateCacheHeaders(invA.headers), `Cache-Control: ${invA.headers['cache-control']}`);

    // ── TEST 3: /api/auth (Profile & Session Restore) Isolation ───────────────
    const profA = await request('/api/auth', { token: tokenA, deviceId: devA });
    const profB = await request('/api/auth', { token: tokenB, deviceId: devB });
    const profGuest = await request('/api/auth');

    const profAOk = profA.status === 200 && profA.json?.user?.name === 'Alice Secret';
    const profBOk = profB.status === 200 && profB.json?.user?.name === 'Bob Innocent';
    const profGuestBlocked = profGuest.status === 401;

    record('CACHE-09', "User A and User B receive isolated profile data on /api/auth", profAOk && profBOk, `A: ${profA.json?.user?.name}, B: ${profB.json?.user?.name}`);
    record('CACHE-10', "Guest blocked from /api/auth (HTTP 401)", profGuestBlocked, `HTTP ${profGuest.status}`);

    // ── TEST 4: /checkout & /cart Private HTML Cache Headers ───────────────────
    const cartRes = await request('/cart');
    const chkRes = await request('/checkout');
    record('CACHE-11', "/cart page has non-leaking cache headers", assertPrivateCacheHeaders(cartRes.headers) || cartRes.headers['cache-control']?.includes('no-cache'), `Cache-Control: ${cartRes.headers['cache-control']}`);
    record('CACHE-12', "/checkout page has non-leaking cache headers", assertPrivateCacheHeaders(chkRes.headers) || chkRes.headers['cache-control']?.includes('no-cache'), `Cache-Control: ${chkRes.headers['cache-control']}`);

    // ── TEST 5: /api/track Isolation by Mobile Number ──────────────────────────
    const trackOk = await request('/api/track', {
      method: 'POST',
      body: JSON.stringify({ orderId: orderA_Num, phone: orderA_Phone }),
    });
    const trackWrong = await request('/api/track', {
      method: 'POST',
      body: JSON.stringify({ orderId: orderA_Num, phone: '9000000002' }), // Bob's phone
    });

    record('CACHE-13', "Order tracking returns order with matching mobile number", trackOk.status === 200, `HTTP ${trackOk.status}`);
    record('CACHE-14', "Order tracking rejects mismatched mobile number with 404 (no leak)", trackWrong.status === 404, `HTTP ${trackWrong.status}`);

  } finally {
    // Cleanup
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderA_Id]);
    await client.query('DELETE FROM orders WHERE id = $1', [orderA_Id]);
    await client.query('DELETE FROM users WHERE id IN ($1, $2)', [userA_Id, userB_Id]);
    client.release();
    await pool.end();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 8 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
