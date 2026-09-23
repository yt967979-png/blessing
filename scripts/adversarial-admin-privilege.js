/**
 * Phase 15: Admin Route Authorization & Privilege Escalation Adversarial Test Harness
 * Exercises privilege escalation, token forging, CSRF validation, Super-Admin role boundary,
 * and banned admin revocation.
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
      'User-Agent': 'AdminPrivilegeTester/1.0',
      'Accept': 'application/json,*/*',
      'Origin': BASE_URL,
      ...(options.headers || {}),
    };

    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
      headers['Cookie'] = `bpg_session=${options.token}; bpg_device=${options.deviceId || 'dev_admin_123'}`;
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
  console.log('🔒  PHASE 15: ADMIN ROUTE AUTHORIZATION & PRIVILEGE ESCALATION');
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
  const dummyHash = 'c8b417e2b7c4d5f8:9e8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a';

  const superAdminId = `usr_sa_${now}`;
  const regularAdminId = `usr_ra_${now}`;
  const bannedAdminId = `usr_ba_${now}`;
  const customerId = `usr_cu_${now}`;
  const targetUserId = `usr_tgt_${now}`;
  const devId = `dev_adm_${now}`;

  try {
    // 0. Setup Test Users
    await client.query(`
      INSERT INTO users (id, name, email, phone, password_hash, role, status) VALUES
      ($1, 'Super Admin', $2, '9999111101', $6, 'super_admin', 'active'),
      ($3, 'Regular Admin', $4, '9999111102', $6, 'admin', 'active'),
      ($5, 'Banned Admin', $7, '9999111103', $6, 'admin', 'banned'),
      ($8, 'Normal Customer', $9, '9999111104', $6, 'customer', 'active'),
      ($10, 'Target User', $11, '9999111105', $6, 'customer', 'active')
      ON CONFLICT (id) DO NOTHING;
    `, [
      superAdminId, `sa_${now}@test.com`,
      regularAdminId, `ra_${now}@test.com`,
      bannedAdminId, dummyHash, `ba_${now}@test.com`,
      customerId, `cu_${now}@test.com`,
      targetUserId, `tgt_${now}@test.com`
    ]);

    const superAdminToken = makeToken(SESSION_SECRET, { userId: superAdminId, role: 'super_admin', exp: now + 86400000, did: devId });
    const regularAdminToken = makeToken(SESSION_SECRET, { userId: regularAdminId, role: 'admin', exp: now + 86400000, did: devId });
    const bannedAdminToken = makeToken(SESSION_SECRET, { userId: bannedAdminId, role: 'admin', exp: now + 86400000, did: devId });
    const customerToken = makeToken(SESSION_SECRET, { userId: customerId, role: 'customer', exp: now + 86400000, did: devId });

    // Forged token: Customer's user ID, but claimed role is "super_admin"
    const forgedSuperAdminToken = makeToken(SESSION_SECRET, { userId: customerId, role: 'super_admin', exp: now + 86400000, did: devId });

    // ── TEST 1: Unauthenticated request to /api/admin/analytics ────────────────
    const resUnauth = await request('/api/admin/analytics');
    record('ADMIN-01', 'Unauthenticated visitor blocked from admin analytics (401)',
      resUnauth.status === 401, `Status: ${resUnauth.status}`);

    // ── TEST 2: Customer token to /api/admin/analytics ─────────────────────────
    const resCust = await request('/api/admin/analytics', { token: customerToken, deviceId: devId });
    record('ADMIN-02', 'Customer token blocked from admin analytics (401/403)',
      resCust.status === 401 || resCust.status === 403, `Status: ${resCust.status}`);

    // ── TEST 3: Privilege Escalation Attempt via Forged Token ──────────────────
    // Token says role: 'super_admin', but DB row has role: 'customer'
    const resForged = await request('/api/admin/analytics', { token: forgedSuperAdminToken, deviceId: devId });
    record('ADMIN-03', 'Forged role in token blocked by DB authoritative check (401/403)',
      resForged.status === 401 || resForged.status === 403, `Status: ${resForged.status}`);

    // ── TEST 4: Regular Admin attempting Super-Admin user status mutation ──────
    // Changing role or status of another user requires Super Admin
    const resPromote = await request('/api/admin/users', {
      method: 'PATCH',
      token: regularAdminToken,
      deviceId: devId,
      body: JSON.stringify({ userId: targetUserId, role: 'admin' }),
    });
    record('ADMIN-04', 'Regular admin blocked from promoting user to admin (403)',
      resPromote.status === 403 || resPromote.status === 401, `Status: ${resPromote.status}, Error: ${resPromote.json?.error}`);

    // ── TEST 5: CSRF Origin Spoofing on mutating Admin route ───────────────────
    const resCsrf = await request('/api/admin/coupons', {
      method: 'POST',
      token: superAdminToken,
      deviceId: devId,
      headers: {
        'Origin': 'https://attacker-domain.evil.com',
        'Referer': 'https://attacker-domain.evil.com/exploit.html',
      },
      body: JSON.stringify({
        code: `CSRF_${now.toString().slice(-4)}`,
        discountType: 'percentage',
        discountValue: 50,
      }),
    });
    record('ADMIN-05', 'Mutating admin route rejects untrusted cross-origin request (403)',
      resCsrf.status === 403, `Status: ${resCsrf.status}, Error: ${resCsrf.json?.error}`);

    // ── TEST 6: Banned Admin blocked from all admin endpoints ──────────────────
    const resBanned = await request('/api/admin/analytics', { token: bannedAdminToken, deviceId: devId });
    record('ADMIN-06', 'Banned admin blocked immediately from admin routes (401/403)',
      resBanned.status === 401 || resBanned.status === 403, `Status: ${resBanned.status}`);

    // ── TEST 7: Legitimate Super Admin successfully accesses analytics ─────────
    const resSuper = await request('/api/admin/analytics', { token: superAdminToken, deviceId: devId });
    record('ADMIN-07', 'Authorized Super Admin receives 200 on analytics',
      resSuper.status === 200, `Status: ${resSuper.status}`);

    // ── TEST 8: Customer blocked from audit logs endpoint ──────────────────────
    const resAuditCust = await request('/api/admin/audit-logs', { token: customerToken, deviceId: devId });
    record('ADMIN-08', 'Customer strictly blocked from audit logs (401/403)',
      resAuditCust.status === 401 || resAuditCust.status === 403, `Status: ${resAuditCust.status}`);

  } finally {
    await client.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5)', [
      superAdminId, regularAdminId, bannedAdminId, customerId, targetUserId
    ]);
    client.release();
    await pool.end();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 15 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
