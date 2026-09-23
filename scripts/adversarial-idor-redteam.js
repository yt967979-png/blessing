/**
 * Phase 3: Authorization & IDOR Red Team Test Harness
 * Tests resource isolation between User A, User B, Admin, and Unauthenticated actors.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { Pool } = require('pg');

const fs = require('fs');
if (!process.env.SESSION_SECRET && fs.existsSync('/etc/blessing.env')) {
  try {
    const envContent = fs.readFileSync('/etc/blessing.env', 'utf8');
    for (const line of envContent.split('\n')) {
      const match = line.match(/^SESSION_SECRET=(.*)$/);
      if (match) {
        process.env.SESSION_SECRET = match[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch (_) {}
}

const BASE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';
const DB_URL = process.env.DATABASE_URL || 'postgresql://blessing:blessing2025@localhost:5432/blessing';
const pool = new Pool({ connectionString: DB_URL, max: 5 });

function request(path, options = {}) {
  return new Promise((resolve) => {
    const isHttps = BASE_URL.startsWith('https');
    const client = isHttps ? https : http;
    const url = new URL(path, BASE_URL);

    const headers = {
      'User-Agent': 'IDORRedTeam/1.0',
      'Accept': 'application/json,text/html,*/*',
      ...(options.headers || {}),
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
      headers['Cookie'] = `bpg_session=${options.token}; bpg_device=${options.deviceId || 'dev_test_123'}`;
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

async function run() {
  console.log('================================================================');
  console.log('🛡️  PHASE 3: AUTHORIZATION & IDOR RED TEAM HARNESS');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================\n');

  const client = await pool.connect();
  const results = [];
  function record(id, name, passed, details = '') {
    results.push({ id, name, passed, details });
    const mark = passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} [${id}] ${name} ${details ? `— ${details}` : ''}`);
  }

  // Get active session secret from server env
  const envSecretRes = await client.query("SELECT current_setting('custom.session_secret', true) as sec;").catch(() => null);
  // Default session secret from /etc/blessing.env or standard
  const sessionSecret = process.env.SESSION_SECRET || 'bpg-dev-session-secret-change-in-production';

  const now = Date.now();
  const userA_Id = `usr_idor_a_${now}`;
  const userB_Id = `usr_idor_b_${now}`;
  const devA = `dev_a_${now}`;
  const devB = `dev_b_${now}`;

  const orderB_Id = `ord_idor_b_${now}`;
  const orderB_Num = `IDOR-B-${now.toString().slice(-6)}`;
  const orderB_Phone = `9840${now.toString().slice(-6)}`;

  try {
    // 1. Setup Test Users & User B Order in Database
    const dummyHash = 'c8b417e2b7c4d5f8:9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a';
    await client.query(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status) VALUES
      ($1, 'Alice User A', $2, '9000000001', $3, 'customer', 'active'),
      ($4, 'Bob User B', $5, $6, $3, 'customer', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [userA_Id, `alice_${now}@test.com`, dummyHash, userB_Id, `bob_${now}@test.com`, orderB_Phone]);

    // Insert Order for User B
    await client.query(`
      INSERT INTO orders (
        id, order_number, user_id, subtotal, discount, shipping_charge, tax, total_amount,
        payment_method, payment_status, order_status, shipping_address
      ) VALUES (
        $1, $2, $3, 1000, 0, 0, 0, 1000, 'Razorpay UPI', 'PAID', 'Confirmed',
        $4
      );
    `, [orderB_Id, orderB_Num, userB_Id, JSON.stringify({ name: 'Bob User B', phone: orderB_Phone, address: '42 Secret St', city: 'Madurai' })]);

    // Insert order items for User B
    const bookRow = (await client.query('SELECT id, title, price FROM books LIMIT 1')).rows[0];
    await client.query(`
      INSERT INTO order_items (id, order_id, book_id, book_title, book_price, quantity, subtotal)
      VALUES ($1, $2, $3, $4, 1000, 1, 1000);
    `, [`item_${orderB_Id}`, orderB_Id, bookRow.id, bookRow.title]);

    // Generate Tokens
    const tokenA = makeToken(sessionSecret, { userId: userA_Id, role: 'customer', exp: now + 86400000, did: devA });
    const tokenB = makeToken(sessionSecret, { userId: userB_Id, role: 'customer', exp: now + 86400000, did: devB });
    const expiredToken = makeToken(sessionSecret, { userId: userA_Id, role: 'customer', exp: now - 3600000, did: devA });
    const forgedAdminToken = makeToken(sessionSecret, { userId: userA_Id, role: 'admin', exp: now + 86400000, did: devA });
    const fakeKeyToken = makeToken('wrong_secret_key_12345678901234567890', { userId: userA_Id, role: 'admin', exp: now + 86400000, did: devA });

    // ── TEST 1: User A token fetching User B's orders list ──────────────────────
    const t1 = await request('/api/orders', { token: tokenA, deviceId: devA });
    const t1Orders = t1.json?.orders || [];
    const seesOrderB = t1Orders.some(o => o.orderNumber === orderB_Num || o.id === orderB_Id);
    record('IDOR-01', "User A /api/orders cannot see User B's orders", !seesOrderB, `User A orders: ${t1Orders.length}`);

    // ── TEST 2: User A attempting to download User B's HTML invoice ─────────────
    const t2 = await request(`/api/orders/${orderB_Id}/invoice`, { token: tokenA, deviceId: devA });
    record('IDOR-02', "User A blocked from downloading User B's invoice", t2.status === 401 || t2.status === 403 || t2.status === 404, `HTTP ${t2.status}`);

    // ── TEST 3: User A attempting to cancel User B's order ──────────────────────
    const t3 = await request('/api/orders/cancel', {
      method: 'POST',
      token: tokenA,
      deviceId: devA,
      body: JSON.stringify({ orderId: orderB_Id, reason: 'Malicious cancellation' }),
    });
    record('IDOR-03', "User A blocked from cancelling User B's order", t3.status === 401 || t3.status === 403 || t3.status === 404, `HTTP ${t3.status}`);

    // ── TEST 4: Tracking Token isolation ───────────────────────────────────────
    // User A attempting to track User B order with wrong phone
    const t4 = await request('/api/track', {
      method: 'POST',
      body: JSON.stringify({ orderId: orderB_Num, phone: '9000000001' }), // Alice's phone, not Bob's
    });
    record('IDOR-04', 'Tracking strictly requires matching order phone number', t4.status === 404 || t4.json?.error?.includes('not found'), `HTTP ${t4.status}`);

    // ── TEST 5: Customer token accessing Admin Analytics ───────────────────────
    const t5 = await request('/api/admin/analytics', { token: tokenA, deviceId: devA });
    record('AUTH-01', 'Customer token blocked from /api/admin/analytics', t5.status === 401 || t5.status === 403, `HTTP ${t5.status}`);

    // ── TEST 6: Customer token accessing Admin Users List ──────────────────────
    const t6 = await request('/api/admin/users', { token: tokenA, deviceId: devA });
    record('AUTH-02', 'Customer token blocked from /api/admin/users', t6.status === 401 || t6.status === 403, `HTTP ${t6.status}`);

    // ── TEST 7: Customer token accessing Admin Coupons Management ──────────────
    const t7 = await request('/api/admin/coupons', { token: tokenA, deviceId: devA });
    record('AUTH-03', 'Customer token blocked from /api/admin/coupons', t7.status === 401 || t7.status === 403, `HTTP ${t7.status}`);

    // ── TEST 8: Customer token creating Custom Admin Orders ────────────────────
    const t8 = await request('/api/admin/orders/custom', {
      method: 'POST',
      token: tokenA,
      deviceId: devA,
      body: JSON.stringify({ bookId: bookRow.id, quantity: 1, customerName: 'Hacker' }),
    });
    record('AUTH-04', 'Customer token blocked from creating custom orders', t8.status === 401 || t8.status === 403, `HTTP ${t8.status}`);

    // ── TEST 9: Unauthenticated access to Admin Analytics ──────────────────────
    const t9 = await request('/api/admin/analytics');
    record('AUTH-05', 'Unauthenticated request blocked from /api/admin/analytics', t9.status === 401 || t9.status === 403, `HTTP ${t9.status}`);

    // ── TEST 10: Expired Session Token ─────────────────────────────────────────
    const t10 = await request('/api/orders', { token: expiredToken, deviceId: devA });
    record('AUTH-06', 'Expired session token rejected', t10.status === 401 || t10.status === 403 || t10.json?.orders?.length === 0, `HTTP ${t10.status}`);

    // ── TEST 11: Tampered/Modified Token Signature ─────────────────────────────
    const tamperedToken = tokenA.slice(0, -6) + 'xxxxxx';
    const t11 = await request('/api/orders', { token: tamperedToken, deviceId: devA });
    record('AUTH-07', 'Tampered cryptographic token signature rejected', t11.status === 401 || t11.status === 403 || t11.json?.orders?.length === 0, `HTTP ${t11.status}`);

    // ── TEST 12: Token Signed with Wrong/Foreign Key ───────────────────────────
    const t12 = await request('/api/admin/analytics', { token: fakeKeyToken, deviceId: devA });
    record('AUTH-08', 'Token signed with unauthorized key rejected', t12.status === 401 || t12.status === 403, `HTTP ${t12.status}`);

    // ── TEST 13: Malformed Garbage Token (Null bytes, invalid characters) ──────
    const malformedTokens = [
      'bearer-invalid-1234',
      'eyJhbGciOiJub25lIn0.eyJ1c2VySWQiOiJhZG1pbiJ9.', // alg: none
      '../../../../etc/passwd',
      '{"token": "null"}',
      '%00%00%00',
      'a'.repeat(4096),
    ];
    let malformedAllBlocked = true;
    for (const mt of malformedTokens) {
      const res = await request('/api/orders', { token: mt });
      if (res.status !== 401 && res.status !== 403 && res.json?.orders?.length > 0) {
        malformedAllBlocked = false;
      }
    }
    record('AUTH-09', 'Malformed and None-alg tokens blocked cleanly', malformedAllBlocked, 'All rejected');

    // ── TEST 14: Deleted / Banned User Account ─────────────────────────────────
    // Test 14a: Previously active user gets banned, cache invalidated
    await client.query("UPDATE users SET status = 'banned' WHERE id = $1", [userA_Id]);
    try {
      const Redis = require('ioredis');
      const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { connectTimeout: 1000, maxRetriesPerRequest: 1 });
      await redis.del(`user_status:${userA_Id}`);
      redis.disconnect();
    } catch (_) {}

    const t14a = await request('/api/orders', { token: tokenA, deviceId: devA });

    // Test 14b: User created as banned from day 1
    const userC_Id = `usr_idor_c_${now}`;
    await client.query(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status)
      VALUES ($1, 'Charlie Banned', $2, '9000000003', $3, 'customer', 'banned')
      ON CONFLICT (id) DO NOTHING;
    `, [userC_Id, `charlie_${now}@test.com`, dummyHash]);
    const tokenC = makeToken(sessionSecret, { userId: userC_Id, role: 'customer', exp: now + 86400000, did: devA });
    const t14b = await request('/api/orders', { token: tokenC, deviceId: devA });

    const bannedBlocked = (t14a.status === 401 || t14a.status === 403) && (t14b.status === 401 || t14b.status === 403);
    record('AUTH-10', 'Banned/Deactivated account cannot access resources', bannedBlocked, `t14a: HTTP ${t14a.status}, t14b: HTTP ${t14b.status}`);

  } finally {
    // Cleanup test records
    await client.query('DELETE FROM order_items WHERE order_id = $1', [orderB_Id]);
    await client.query('DELETE FROM orders WHERE id = $1', [orderB_Id]);
    await client.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [userA_Id, userB_Id, `usr_idor_c_${now}`]);
    client.release();
    await pool.end();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 3 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');
  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
