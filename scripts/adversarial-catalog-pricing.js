/**
 * Phase 13: Edge Case Catalog & Pricing Math Test Harness
 * Exercises decimal quantities, negative values, zero discount fallback, stock clamping, and coupon math.
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

function makeToken(secret, payload) {
  const pStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(pStr).digest('hex');
  return Buffer.from(JSON.stringify({ p: pStr, s: sig })).toString('base64url');
}

function request(path, options = {}) {
  return new Promise((resolve) => {
    const isHttps = BASE_URL.startsWith('https');
    const client = isHttps ? https : http;
    const url = new URL(path, BASE_URL);

    const headers = {
      'User-Agent': 'CatalogPricingTester/1.0',
      'Accept': 'application/json,*/*',
      'Origin': BASE_URL,
      ...(options.headers || {}),
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
      headers['Cookie'] = `bpg_session=${options.token}; bpg_device=${options.deviceId || 'dev_math_123'}`;
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

async function run() {
  console.log('================================================================');
  console.log('🧮  PHASE 13: EDGE CASE CATALOG & PRICING MATH');
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
  const testBookId = `book_math_${now}`;
  const customerId = `usr_math_${now}`;
  const devId = `dev_math_${now}`;

  try {
    // Create test customer
    const dummyHash = 'c8b417e2b7c4d5f8:9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a';
    await client.query(`
      INSERT INTO users (id, phone, email, password_hash, name, role, status)
      VALUES ($1, '919876543210', $2, $3, 'Math Tester', 'customer', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [customerId, `math_tester_${now}@test.com`, dummyHash]);

    const customerToken = makeToken(SESSION_SECRET, {
      userId: customerId,
      phone: '919876543210',
      role: 'customer',
      status: 'active',
      exp: now + 86400000,
      did: devId,
    });

    const catId = (await client.query('SELECT id FROM categories LIMIT 1')).rows[0]?.id || null;

    // Insert book with stock = 3, price = 500, discount_price = 0 (test zero discount price)
    await client.query(`
      INSERT INTO books (id, title, slug, price, discount_price, stock, status, category_id)
      VALUES ($1, 'Math Test Book', $1, 500, 0, 3, 'in_stock', $2)
      ON CONFLICT (id) DO NOTHING;
    `, [testBookId, catId]);

    // ── TEST 1: Product with ₹0 discount_price falls back to standard MRP ────────
    const resZeroDiscount = await request('/api/cart/validate', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: testBookId, qty: 1 }] }),
    });
    const itemZeroDisc = resZeroDiscount.json?.items?.[0];
    const zeroDiscPassed = itemZeroDisc && itemZeroDisc.price === 500;
    record('MATH-01', '₹0 discount_price correctly falls back to standard MRP (no free books)', zeroDiscPassed,
      `Calculated price: ₹${itemZeroDisc?.price || 'N/A'}`);

    // ── TEST 2: Quantity exceeding stock is clamped to available stock ─────────
    const resOverStock = await request('/api/cart/validate', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: testBookId, qty: 99 }] }),
    });
    const itemOverStock = resOverStock.json?.items?.[0];
    const overStockPassed = itemOverStock && itemOverStock.allowedQty === 3 && itemOverStock.requestedQty === 99;
    record('MATH-02', 'Quantity exceeding stock is automatically clamped to available stock (99 -> 3)', overStockPassed,
      `Requested qty: ${itemOverStock?.requestedQty}, Allowed qty: ${itemOverStock?.allowedQty}`);

    // ── TEST 3: Decimal quantity is floor clamped to integer ───────────────────
    const resDecimal = await request('/api/cart/validate', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: testBookId, qty: 2.7 }] }),
    });
    const itemDecimal = resDecimal.json?.items?.[0];
    const decimalPassed = itemDecimal && itemDecimal.allowedQty === 2 && itemDecimal.requestedQty === 2;
    record('MATH-03', 'Decimal quantity is floored to integer (2.7 -> 2)', decimalPassed,
      `Requested qty: ${itemDecimal?.requestedQty}, Allowed qty: ${itemDecimal?.allowedQty}`);

    // ── TEST 4: Negative quantity is clamped or rejected ───────────────────────
    const resNegative = await request('/api/cart/validate', {
      method: 'POST',
      body: JSON.stringify({ items: [{ id: testBookId, qty: -5 }] }),
    });
    const itemNegative = resNegative.json?.items?.[0];
    const negPassed = !itemNegative || itemNegative.allowedQty === 0 || resNegative.status === 400;
    record('MATH-04', 'Negative quantity is rejected or clamped to 0', negPassed,
      `Allowed qty: ${itemNegative?.allowedQty || 0}`);

    // ── TEST 5: Coupon discount greater than subtotal never yields negative total
    const hugeDiscountCoupon = `HUGE_${now.toString().slice(-4)}`;
    await client.query(`
      INSERT INTO coupons (id, code, discount_type, discount_value, min_order_amount, min_cart_qty, max_uses, used_count, expires_at, is_active)
      VALUES ($1, $2, 'flat', 5000, 0, 4, 100, 0, NOW() + INTERVAL '10 days', true)
    `, [`cp_huge_${now}`, hugeDiscountCoupon]);

    const resHugeCoupon = await request('/api/coupons/validate', {
      method: 'POST',
      token: customerToken,
      deviceId: devId,
      body: JSON.stringify({ code: hugeDiscountCoupon, subtotal: 1000, cartQty: 4 }),
    });

    const discAmount = resHugeCoupon.json?.discountAmount ?? 0;
    const finalSubtotal = Math.max(0, 1000 - discAmount);
    record('MATH-05', 'Coupon discount exceeding subtotal clamps to subtotal (never negative)',
      resHugeCoupon.status === 200 && discAmount === 1000 && finalSubtotal === 0,
      `Status: ${resHugeCoupon.status}, Applied discount: ₹${discAmount}, Final subtotal: ₹${finalSubtotal}`);

    // ── TEST 6: Authoritative DB Pricing in Checkout Override ──────────────────
    // Attempting to post client-side manipulated price in order creation
    const resOrderTamperedPrice = await request('/api/orders', {
      method: 'POST',
      token: customerToken,
      deviceId: devId,
      body: JSON.stringify({
        items: [{ id: testBookId, qty: 4, price: 1 }], // Tampered ₹1 instead of ₹500
        shippingAddress: {
          fullName: 'Adversarial Tester',
          phone: '9876543210',
          addressLine1: '123 Test St',
          city: 'Chennai',
          state: 'Tamil Nadu',
          pincode: '600001',
        },
        paymentMethod: 'razorpay',
      }),
    });

    // The order should either reject or calculate total based on DB price (4 * 500 = 2000), not ₹1 * 4 = ₹4
    let orderPriceProtected = false;
    let computedTotal = 0;
    if (resOrderTamperedPrice.json?.orderId || resOrderTamperedPrice.json?.id) {
      const orderId = resOrderTamperedPrice.json.orderId || resOrderTamperedPrice.json.id;
      const orderDb = (await client.query('SELECT total_amount FROM orders WHERE id = $1', [orderId])).rows[0];
      computedTotal = Number(orderDb?.total_amount || 0);
      orderPriceProtected = computedTotal >= 2000;
      await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
      await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
    } else if (resOrderTamperedPrice.status >= 400) {
      orderPriceProtected = true;
    }
    record('MATH-06', 'Client price tampering in order creation ignored; authoritative DB price enforced',
      orderPriceProtected, `Order response status: ${resOrderTamperedPrice.status}, Order total in DB: ₹${computedTotal}`);

    // Clean up test coupon
    await client.query('DELETE FROM coupons WHERE id = $1', [`cp_huge_${now}`]);

  } finally {
    await client.query('DELETE FROM books WHERE id = $1', [testBookId]);
    await client.query('DELETE FROM users WHERE id = $1', [customerId]);
    client.release();
    await pool.end();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 13 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
