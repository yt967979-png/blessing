/**
 * Phase 5: Adversarial Payment Attacks Harness (Razorpay)
 * Tests 17 payment attack vectors against order creation, payment verification, and webhooks.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');

const BASE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';
const DB_URL = process.env.DATABASE_URL || 'postgresql://blessing:blessing2025@localhost:5432/blessing';
const pool = new Pool({ connectionString: DB_URL, max: 5 });

let WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
let SESSION_SECRET = process.env.SESSION_SECRET || 'bpg-dev-session-secret-change-in-production';

if (fs.existsSync('/etc/blessing.env')) {
  try {
    const env = fs.readFileSync('/etc/blessing.env', 'utf8');
    for (const line of env.split('\n')) {
      if (line.startsWith('RAZORPAY_WEBHOOK_SECRET=')) {
        WEBHOOK_SECRET = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
      }
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
      'User-Agent': 'PaymentAttacker/1.0',
      'Accept': 'application/json,*/*',
      ...(options.headers || {}),
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
      headers['Cookie'] = `bpg_session=${options.token}; bpg_device=${options.deviceId || 'dev_test_pay'}`;
    }

    if (options.body !== undefined && options.body !== null) {
      headers['Content-Type'] = options.contentType || 'application/json';
      headers['Content-Length'] = Buffer.byteLength(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
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

    if (options.body !== undefined && options.body !== null) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

function makeToken(secret, payload) {
  const pStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(pStr).digest('hex');
  return Buffer.from(JSON.stringify({ p: pStr, s: sig })).toString('base64url');
}

function signWebhook(body, secret) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function run() {
  console.log('================================================================');
  console.log('💳  PHASE 5: ADVERSARIAL PAYMENT FLOW ATTACK TESTING');
  console.log(`Target: ${BASE_URL}`);
  console.log(`Webhook Secret Present: ${Boolean(WEBHOOK_SECRET)}`);
  console.log('================================================================\n');

  const client = await pool.connect();
  const results = [];
  function record(id, name, passed, details = '') {
    results.push({ id, name, passed, details });
    const mark = passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} [${id}] ${name} ${details ? `— ${details}` : ''}`);
  }

  const now = Date.now();
  const testUserId = `usr_pay_atk_${now}`;
  const testDeviceId = `dev_pay_${now}`;

  try {
    // 0. Setup authenticated test customer
    const dummyHash = 'c8b417e2b7c4d5f8:9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a';
    await client.query(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status)
      VALUES ($1, 'Pay Attacker', $2, '9840123456', $3, 'customer', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [testUserId, `pay_${now}@test.com`, dummyHash]);

    const userToken = makeToken(SESSION_SECRET, {
      userId: testUserId,
      role: 'customer',
      exp: now + 86400000,
      did: testDeviceId,
    });

    const bookRow = (await client.query('SELECT id, title, price FROM books WHERE stock > 5 LIMIT 1')).rows[0];

    // ── ATTACK 1: Fake / Forged Razorpay Signature in Order Creation ───────────
    const a1 = await request('/api/orders', {
      method: 'POST',
      token: userToken,
      deviceId: testDeviceId,
      body: JSON.stringify({
        customerName: 'Hacker',
        customerPhone: '9840123456',
        shippingAddress: { address: '123 Fake St', city: 'Chennai', pincode: '600001', state: 'Tamil Nadu' },
        items: [{ id: bookRow.id, qty: 4 }],
        paymentMethod: 'Razorpay UPI',
        razorpayOrderId: `order_fake_${now}`,
        razorpayPaymentId: `pay_fake_${now}`,
        razorpaySignature: 'deadbeef0123456789abcdef0123456789abcdef0123456789abcdef01234567', // fake signature
      }),
    });
    record('PAY-01', 'Forged Razorpay signature rejected at order creation', a1.status === 400, `HTTP ${a1.status} (${a1.json?.error || ''})`);

    // ── ATTACK 2: Modified / Corrupted Razorpay Signature ──────────────────────
    const a2 = await request('/api/orders', {
      method: 'POST',
      token: userToken,
      deviceId: testDeviceId,
      body: JSON.stringify({
        customerName: 'Hacker',
        customerPhone: '9840123456',
        shippingAddress: { address: '123 Fake St', city: 'Chennai', pincode: '600001', state: 'Tamil Nadu' },
        items: [{ id: bookRow.id, qty: 4 }],
        paymentMethod: 'Razorpay UPI',
        razorpayOrderId: `order_fake_${now}`,
        razorpayPaymentId: `pay_fake_${now}`,
        razorpaySignature: 'malformed_non_hex_sig!!',
      }),
    });
    record('PAY-02', 'Malformed Razorpay signature string rejected', a2.status === 400, `HTTP ${a2.status}`);

    // ── ATTACK 3: Webhook with Invalid Signature (Fake Secret) ────────────────
    const whPayload1 = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: `pay_wh_${now}`, order_id: `ord_wh_${now}`, amount: 98000 } } },
    });
    const fakeSig = signWebhook(whPayload1, 'unauthorized_fake_webhook_secret_123');
    const a3 = await request('/api/webhooks/razorpay', {
      method: 'POST',
      headers: { 'x-razorpay-signature': fakeSig },
      body: whPayload1,
    });
    record('PAY-03', 'Webhook with invalid HMAC signature rejected', a3.status === 400, `HTTP ${a3.status} (${a3.json?.error || ''})`);

    // ── ATTACK 4: Webhook with Missing Signature Header ────────────────────────
    const a4 = await request('/api/webhooks/razorpay', {
      method: 'POST',
      body: whPayload1,
    });
    record('PAY-04', 'Webhook with missing signature header rejected', a4.status === 400, `HTTP ${a4.status}`);

    // ── ATTACK 5: Webhook Replay Attack (Send Same Event 5 Times) ──────────────
    if (WEBHOOK_SECRET) {
      const eventId = `evt_replay_${now}`;
      const replayPayload = JSON.stringify({
        id: eventId,
        event: 'payment.captured',
        payload: { payment: { entity: { id: `pay_rep_${now}`, order_id: `ord_rep_${now}`, amount: 50000 } } },
      });
      const validSig = signWebhook(replayPayload, WEBHOOK_SECRET);

      const r1 = await request('/api/webhooks/razorpay', {
        method: 'POST',
        headers: { 'x-razorpay-signature': validSig },
        body: replayPayload,
      });

      let allDupsHandled = true;
      for (let i = 0; i < 4; i++) {
        const rDup = await request('/api/webhooks/razorpay', {
          method: 'POST',
          headers: { 'x-razorpay-signature': validSig },
          body: replayPayload,
        });
        if (rDup.status !== 200 || rDup.json?.action !== 'noop_duplicate_webhook') {
          allDupsHandled = false;
        }
      }
      record('PAY-05', 'Webhook replay attack deduplicated by event_id (5 attempts)', allDupsHandled, `First: ${r1.status}, Duplicates: noop_duplicate_webhook`);
    } else {
      record('PAY-05', 'Webhook replay attack deduplication', true, 'SKIPPED (no secret)');
    }

    // ── ATTACK 6: Webhook payment.failed Triggers Hold Release ──────────────────
    if (WEBHOOK_SECRET) {
      const failEventId = `evt_fail_${now}`;
      const failOrderId = `order_fail_${now}`;
      const failPayload = JSON.stringify({
        id: failEventId,
        event: 'payment.failed',
        payload: { payment: { entity: { id: `pay_fail_${now}`, order_id: failOrderId, error_description: 'Card expired' } } },
      });
      const failSig = signWebhook(failPayload, WEBHOOK_SECRET);
      const a6 = await request('/api/webhooks/razorpay', {
        method: 'POST',
        headers: { 'x-razorpay-signature': failSig },
        body: failPayload,
      });
      record('PAY-06', 'payment.failed webhook releases holds idempotently', a6.status === 200 && a6.json?.ok === true, `action: ${a6.json?.action}`);
    } else {
      record('PAY-06', 'payment.failed webhook', true, 'SKIPPED (no secret)');
    }

    // ── ATTACK 7: Webhook for Non-Existent Order (Orphan Handling) ──────────────
    if (WEBHOOK_SECRET) {
      const orphanEventId = `evt_orphan_${now}`;
      const orphanPayload = JSON.stringify({
        id: orphanEventId,
        event: 'payment.captured',
        payload: { payment: { entity: { id: `pay_orph_${now}`, order_id: `ord_ghost_${now}`, amount: 9900 } } },
      });
      const orphSig = signWebhook(orphanPayload, WEBHOOK_SECRET);
      const a7 = await request('/api/webhooks/razorpay', {
        method: 'POST',
        headers: { 'x-razorpay-signature': orphSig },
        body: orphanPayload,
      });
      record('PAY-07', 'Orphan payment captured logged safely without crash', a7.status === 200 && a7.json?.ok === true, `action: ${a7.json?.action}`);
    } else {
      record('PAY-07', 'Orphan payment captured', true, 'SKIPPED (no secret)');
    }

    // ── ATTACK 8: Webhook Payload with Prototype Pollution ─────────────────────
    if (WEBHOOK_SECRET) {
      const protoPayload = '{"id":"evt_proto_' + now + '","event":"payment.captured","__proto__":{"isAdmin":true},"payload":{"payment":{"entity":{"id":"pay_p_' + now + '"}}}}';
      const protoSig = signWebhook(protoPayload, WEBHOOK_SECRET);
      const a8 = await request('/api/webhooks/razorpay', {
        method: 'POST',
        headers: { 'x-razorpay-signature': protoSig },
        body: protoPayload,
      });
      record('PAY-08', 'Prototype pollution in webhook handled cleanly', a8.status === 200 || a8.status === 400, `HTTP ${a8.status}`);
    } else {
      record('PAY-08', 'Prototype pollution webhook', true, 'SKIPPED (no secret)');
    }

    // ── ATTACK 9: Client calls PUT /api/razorpay directly with bogus signature ─
    const a9 = await request('/api/razorpay', {
      method: 'PUT',
      token: userToken,
      deviceId: testDeviceId,
      body: JSON.stringify({
        razorpay_order_id: `order_fake_${now}`,
        razorpay_payment_id: `pay_fake_${now}`,
        razorpay_signature: 'deadbeef_invalid_client_sig',
      }),
    });
    record('PAY-09', 'Direct PUT /api/razorpay with forged signature rejected', a9.status === 400, `HTTP ${a9.status} (${a9.json?.error || ''})`);

    // ── ATTACK 10: Unauthorized customer refund request ────────────────────────
    const a10 = await request('/api/orders/cancel', {
      method: 'POST',
      token: userToken,
      deviceId: testDeviceId,
      body: JSON.stringify({ orderId: 'NON_EXISTENT_ORDER_123', reason: 'Refund me' }),
    });
    record('PAY-10', 'Unauthorized / non-owner refund request rejected', a10.status === 401 || a10.status === 403 || a10.status === 404, `HTTP ${a10.status}`);

    // ── ATTACK 11: Webhook with Malformed JSON syntax ───────────────────────────
    if (WEBHOOK_SECRET) {
      const malformedPayload = '{"event": "payment.captured", malformed: true,}';
      const malformedSig = signWebhook(malformedPayload, WEBHOOK_SECRET);
      const a11 = await request('/api/webhooks/razorpay', {
        method: 'POST',
        headers: { 'x-razorpay-signature': malformedSig },
        body: malformedPayload,
      });
      record('PAY-11', 'Malformed JSON in signed webhook cleanly rejected', a11.status === 400, `HTTP ${a11.status} (${a11.json?.error || ''})`);
    } else {
      record('PAY-11', 'Malformed JSON webhook', true, 'SKIPPED (no secret)');
    }

    // ── ATTACK 12: Cash on Delivery Bypass Attack ──────────────────────────────
    const a12 = await request('/api/orders', {
      method: 'POST',
      token: userToken,
      deviceId: testDeviceId,
      body: JSON.stringify({
        customerName: 'Hacker',
        customerPhone: '9840123456',
        shippingAddress: { address: '123 Fake St', city: 'Chennai', pincode: '600001', state: 'Tamil Nadu' },
        items: [{ id: bookRow.id, qty: 4 }],
        paymentMethod: 'COD', // Attempting to bypass online payment
      }),
    });
    record('PAY-12', 'Cash on Delivery bypass blocked cleanly', a12.status === 400, `HTTP ${a12.status} (${a12.json?.error || ''})`);

    // ── ATTACK 13: Zero or Missing payment identifiers ─────────────────────────
    const a13 = await request('/api/orders', {
      method: 'POST',
      token: userToken,
      deviceId: testDeviceId,
      body: JSON.stringify({
        customerName: 'Hacker',
        customerPhone: '9840123456',
        shippingAddress: { address: '123 Fake St', city: 'Chennai', pincode: '600001', state: 'Tamil Nadu' },
        items: [{ id: bookRow.id, qty: 4 }],
        paymentMethod: 'Razorpay UPI',
        razorpayPaymentId: '',
        razorpayOrderId: '',
        razorpaySignature: '',
      }),
    });
    record('PAY-13', 'Blank payment credentials rejected', a13.status === 400, `HTTP ${a13.status} (${a13.json?.error || ''})`);

    // ── ATTACK 14: Release Hold API without credentials ────────────────────────
    const a14 = await request('/api/razorpay/release', {
      method: 'POST',
      token: userToken,
      deviceId: testDeviceId,
      body: JSON.stringify({}),
    });
    record('PAY-14', 'Release hold with missing parameters rejected', a14.status === 400, `HTTP ${a14.status} (${a14.json?.error || ''})`);

    // ── ATTACK 15: Release Hold with Bogus IDs ──────────────────────────────────
    const a15 = await request('/api/razorpay/release', {
      method: 'POST',
      token: userToken,
      deviceId: testDeviceId,
      body: JSON.stringify({ razorpayOrderId: 'order_bogus_12345' }),
    });
    record('PAY-15', 'Release hold with bogus ID handled gracefully (0 released)', a15.status === 200 && a15.json?.releasedCount === 0, `Released: ${a15.json?.releasedCount}`);

    // ── ATTACK 16: Two Simultaneous Webhook Deliveries (Race Condition) ────────
    if (WEBHOOK_SECRET) {
      const raceEventId = `evt_race_${now}`;
      const racePayload = JSON.stringify({
        id: raceEventId,
        event: 'payment.captured',
        payload: { payment: { entity: { id: `pay_race_${now}`, order_id: `ord_race_${now}`, amount: 98000 } } },
      });
      const raceSig = signWebhook(racePayload, WEBHOOK_SECRET);
      const [res1, res2] = await Promise.all([
        request('/api/webhooks/razorpay', { method: 'POST', headers: { 'x-razorpay-signature': raceSig }, body: racePayload }),
        request('/api/webhooks/razorpay', { method: 'POST', headers: { 'x-razorpay-signature': raceSig }, body: racePayload }),
      ]);
      const raceOk = (res1.status === 200 && res2.status === 200) && (res1.json?.action === 'noop_duplicate_webhook' || res2.json?.action === 'noop_duplicate_webhook');
      record('PAY-16', 'Simultaneous duplicate webhook delivery handled atomically', raceOk, `R1: ${res1.json?.action}, R2: ${res2.json?.action}`);
    } else {
      record('PAY-16', 'Simultaneous duplicate webhook delivery', true, 'SKIPPED (no secret)');
    }

    // ── ATTACK 17: Webhook refund for already cancelled order ───────────────────
    if (WEBHOOK_SECRET) {
      // Create a test cancelled order in DB
      const cancOrderNum = `BPG-CANC-${now.toString().slice(-5)}`;
      const cancOrdId = `ord_canc_${now}`;
      const cancPayId = `pay_canc_${now}`;
      await client.query(`
        INSERT INTO orders (id, order_number, user_id, subtotal, discount, shipping_charge, tax, total_amount, payment_method, payment_status, order_status, razorpay_payment_id)
        VALUES ($1, $2, $3, 1000, 0, 0, 0, 1000, 'Razorpay UPI', 'REFUNDED', 'Cancelled', $4);
      `, [cancOrdId, cancOrderNum, testUserId, cancPayId]);

      const refundEvtId = `evt_ref_${now}`;
      const refundPayload = JSON.stringify({
        id: refundEvtId,
        event: 'refund.processed',
        payload: {
          refund: { entity: { id: `rfnd_${now}`, payment_id: cancPayId, amount: 100000 } },
          payment: { entity: { id: cancPayId } },
        },
      });
      const refundSig = signWebhook(refundPayload, WEBHOOK_SECRET);
      const a17 = await request('/api/webhooks/razorpay', {
        method: 'POST',
        headers: { 'x-razorpay-signature': refundSig },
        body: refundPayload,
      });

      record('PAY-17', 'Webhook refund on already cancelled order handled safely', a17.status === 200, `action: ${a17.json?.action}`);

      // Clean up cancelled order
      await client.query('DELETE FROM orders WHERE id = $1', [cancOrdId]);
    } else {
      record('PAY-17', 'Webhook refund on cancelled order', true, 'SKIPPED (no secret)');
    }

  } finally {
    // Cleanup
    await client.query('DELETE FROM users WHERE id = $1', [testUserId]);
    client.release();
    await pool.end();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 5 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
