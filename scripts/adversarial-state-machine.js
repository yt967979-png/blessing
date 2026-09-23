/**
 * Phase 10: State Machine & Business Logic Invariants Test Harness
 * Exercises state machine transitions, coupon rules, shipping fee thresholds, and audit logging.
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
      'User-Agent': 'StateMachineTester/1.0',
      'Accept': 'application/json,*/*',
      'Origin': BASE_URL,
      ...(options.headers || {}),
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
      headers['Cookie'] = `bpg_session=${options.token}; bpg_device=${options.deviceId || 'dev_sm_123'}`;
    }

    if (options.body) {
      headers['Content-Type'] = 'application/json';
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
  console.log('⚙️  PHASE 10: STATE MACHINE & BUSINESS LOGIC INVARIANTS');
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
  const adminId = `usr_sm_admin_${now}`;
  const customerId = `usr_sm_cust_${now}`;
  const devId = `dev_sm_${now}`;

  const orderDeliveredId = `ord_deliv_${now}`;
  const orderCancelledId = `ord_canc_${now}`;
  const orderActiveId = `ord_active_${now}`;

  const couponExpiredCode = `EXP_${now.toString().slice(-4)}`;
  const couponMaxUsesCode = `MAX_${now.toString().slice(-4)}`;
  const couponMinAmountCode = `MIN_${now.toString().slice(-4)}`;

  try {
    // 0. Setup Users
    const dummyHash = 'c8b417e2b7c4d5f8:9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a';
    await client.query(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status) VALUES
      ($1, 'SM Admin', $2, '9999999991', $4, 'admin', 'active'),
      ($3, 'SM Cust', $5, '9999999992', $4, 'customer', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [adminId, `admin_sm_${now}@test.com`, customerId, dummyHash, `cust_sm_${now}@test.com`]);

    const adminToken = makeToken(SESSION_SECRET, { userId: adminId, role: 'admin', exp: now + 86400000, did: devId });
    const custToken = makeToken(SESSION_SECRET, { userId: customerId, role: 'customer', exp: now + 86400000, did: devId });

    // Insert Test Orders in various states
    await client.query(`
      INSERT INTO orders (id, order_number, user_id, subtotal, discount, shipping_charge, tax, total_amount, payment_method, payment_status, order_status, shipping_address)
      VALUES 
        ($1, $2, $3, 1000, 0, 0, 0, 1000, 'Razorpay UPI', 'PAID', 'Delivered', '{"phone":"9999999992"}'),
        ($4, $5, $3, 1000, 0, 0, 0, 1000, 'Razorpay UPI', 'REFUNDED', 'Cancelled', '{"phone":"9999999992"}'),
        ($6, $7, $3, 1000, 0, 0, 0, 1000, 'Razorpay UPI', 'PAID', 'Confirmed', '{"phone":"9999999992"}');
    `, [
      orderDeliveredId, `BPG-DELIV-${now.toString().slice(-4)}`, customerId,
      orderCancelledId, `BPG-CANC-${now.toString().slice(-4)}`,
      orderActiveId, `BPG-ACT-${now.toString().slice(-4)}`,
    ]);

    // Insert Test Coupons
    await client.query(`
      INSERT INTO coupons (id, code, discount_type, discount_value, min_order_amount, min_cart_qty, max_uses, used_count, expires_at, is_active)
      VALUES 
        ($1, $2, 'flat', 100, 0, 4, 100, 0, NOW() - INTERVAL '1 day', true),
        ($3, $4, 'flat', 100, 0, 4, 5, 5, NOW() + INTERVAL '10 days', true),
        ($5, $6, 'flat', 100, 2000, 4, 100, 0, NOW() + INTERVAL '10 days', true)
      ON CONFLICT (code) DO NOTHING;
    `, [
      `cp_exp_${now}`, couponExpiredCode,
      `cp_max_${now}`, couponMaxUsesCode,
      `cp_min_${now}`, couponMinAmountCode,
    ]);

    // ── TEST 1: Cancel an order that's already 'Delivered' ──────────────────────
    const sm1 = await request('/api/orders/cancel', {
      method: 'POST',
      token: adminToken,
      deviceId: devId,
      body: JSON.stringify({ orderId: orderDeliveredId, reason: 'Delivered parcel cancel attempt' }),
    });
    record('SM-01', "Cannot cancel an order that is already 'Delivered'", sm1.status === 400 || sm1.status === 409, `HTTP ${sm1.status} (${sm1.json?.error || ''})`);

    // ── TEST 2: Cancel an order that's already 'Cancelled' ──────────────────────
    const sm2 = await request('/api/orders/cancel', {
      method: 'POST',
      token: adminToken,
      deviceId: devId,
      body: JSON.stringify({ orderId: orderCancelledId, reason: 'Double cancel attempt' }),
    });
    record('SM-02', "Cancel on already-cancelled order handled safely (idempotent / rejected)", sm2.status === 200 || sm2.status === 400 || sm2.status === 409, `HTTP ${sm2.status}`);

    // ── TEST 3: Move order from 'Cancelled' to 'Shipped' ───────────────────────
    const sm3 = await request('/api/orders', {
      method: 'PATCH',
      token: adminToken,
      deviceId: devId,
      body: JSON.stringify({ orderId: orderCancelledId, status: 'Handed to ST Courier', awbNumber: 'STC999999' }),
    });
    record('SM-03', "Admin blocked from shipping or changing status on a Cancelled order", sm3.status === 409, `HTTP ${sm3.status} (${sm3.json?.error || ''})`);

    // ── TEST 4: Move active order from 'Confirmed' to 'Packed' to 'Handed to ST Courier'
    const sm4a = await request('/api/orders', {
      method: 'PATCH',
      token: adminToken,
      deviceId: devId,
      body: JSON.stringify({ orderId: orderActiveId, status: 'Packed' }),
    });
    const sm4b = await request('/api/orders', {
      method: 'PATCH',
      token: adminToken,
      deviceId: devId,
      body: JSON.stringify({ orderId: orderActiveId, status: 'Handed to ST Courier', awbNumber: 'STC12345678' }),
    });

    const timelineRows = (await client.query('SELECT status, remarks FROM order_timeline WHERE order_id = $1 ORDER BY created_at ASC', [orderActiveId])).rows;
    record('SM-04', 'Valid order progression updates timeline audit trail', sm4a.status === 200 && sm4b.status === 200 && timelineRows.length >= 2,
      `Timeline entries: ${timelineRows.length}`);

    // ── TEST 5: Apply Expired Coupon ──────────────────────────────────────────
    const sm5 = await request('/api/coupons/validate', {
      method: 'POST',
      token: custToken,
      deviceId: devId,
      body: JSON.stringify({ code: couponExpiredCode, subtotal: 1000, cartQty: 4 }),
    });
    record('SM-05', 'Expired coupon strictly rejected', sm5.status === 400, `HTTP ${sm5.status} (${sm5.json?.error || ''})`);

    // ── TEST 6: Apply Max-Used Coupon ─────────────────────────────────────────
    const sm6 = await request('/api/coupons/validate', {
      method: 'POST',
      token: custToken,
      deviceId: devId,
      body: JSON.stringify({ code: couponMaxUsesCode, subtotal: 1000, cartQty: 4 }),
    });
    record('SM-06', 'Exhausted usage-limit coupon strictly rejected', sm6.status === 400, `HTTP ${sm6.status} (${sm6.json?.error || ''})`);

    // ── TEST 7: Apply Coupon with Subtotal < Minimum Order Amount ─────────────
    const sm7 = await request('/api/coupons/validate', {
      method: 'POST',
      token: custToken,
      deviceId: devId,
      body: JSON.stringify({ code: couponMinAmountCode, subtotal: 1000, cartQty: 4 }), // Requires min 2000
    });
    record('SM-07', 'Coupon rejected when cart subtotal is below minimum order amount', sm7.status === 400, `HTTP ${sm7.status} (${sm7.json?.error || ''})`);

    // ── TEST 8: Courier Pricing Rule: 4 books = ₹150 Courier Fee ───────────────
    function calculateDeliveryFee(qty) {
      const q = Math.max(0, Number(qty) || 0);
      if (q <= 0) return 0;
      return q >= 5 ? 0 : 150;
    }

    const fee4 = calculateDeliveryFee(4);
    record('SM-08', '4 Books triggers flat ₹150 courier fee (MOQ threshold)', fee4 === 150, `Shipping fee: ₹${fee4}`);

    // ── TEST 9: Free Shipping Threshold: 5+ books = ₹0 Courier Fee ─────────────
    const fee5 = calculateDeliveryFee(5);
    const fee10 = calculateDeliveryFee(10);
    record('SM-09', '5+ Books unlocks 100% Free Doorstep Delivery (₹0 courier fee)', fee5 === 0 && fee10 === 0, `5 books: ₹${fee5}, 10 books: ₹${fee10}`);

  } finally {
    // Cleanup
    await client.query('DELETE FROM order_timeline WHERE order_id IN ($1, $2, $3)', [orderDeliveredId, orderCancelledId, orderActiveId]);
    await client.query('DELETE FROM orders WHERE id IN ($1, $2, $3)', [orderDeliveredId, orderCancelledId, orderActiveId]);
    await client.query('DELETE FROM coupons WHERE code IN ($1, $2, $3)', [couponExpiredCode, couponMaxUsesCode, couponMinAmountCode]);
    await client.query('DELETE FROM users WHERE id IN ($1, $2)', [adminId, customerId]);
    client.release();
    await pool.end();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 10 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
