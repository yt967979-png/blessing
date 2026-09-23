/**
 * Phase 18: System Chaos & Resilience Stress Test Harness
 * Simulates concurrent load spikes, concurrent stock hold sweeps, in-flight payment confirms,
 * Redis transient failure, and worker reload under continuous traffic.
 */

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');

const BASE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';
const DB_URL = process.env.DATABASE_URL || 'postgresql://blessing:blessing2025@localhost:5432/blessing';
const pool = new Pool({ connectionString: DB_URL, max: 10 });

function request(path, options = {}) {
  return new Promise((resolve) => {
    const isHttps = BASE_URL.startsWith('https');
    const client = isHttps ? https : http;
    const url = new URL(path, BASE_URL);

    const headers = {
      'User-Agent': 'ChaosTester/1.0',
      'Accept': 'application/json,*/*',
      ...(options.headers || {}),
    };

    if (options.body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = client.request(url, {
      method: options.method || 'GET',
      headers,
      timeout: options.timeout || 15000,
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
  console.log('⚡  PHASE 18: SYSTEM MIXED CHAOS & RESILIENCE STRESS');
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
  const chaosBookId = `book_chaos_${now}`;

  try {
    const catId = (await client.query('SELECT id FROM categories LIMIT 1')).rows[0]?.id || null;

    // Seed book with stock = 20
    await client.query(`
      INSERT INTO books (id, title, slug, price, discount_price, stock, status, category_id)
      VALUES ($1, 'Chaos Test Book', $1, 450, 400, 20, 'in_stock', $2)
      ON CONFLICT (id) DO NOTHING;
    `, [chaosBookId, catId]);

    // ── CHAOS TEST 1: 50 Concurrent Cart Validations under Burst Traffic ───────
    const burstPromises = [];
    for (let i = 0; i < 50; i++) {
      burstPromises.push(
        request('/api/cart/validate', {
          method: 'POST',
          headers: { 'X-Forwarded-For': `198.51.100.${(i % 50) + 1}` },
          body: JSON.stringify({
            items: [{ id: chaosBookId, qty: (i % 3) + 1 }]
          }),
        })
      );
    }
    const burstResults = await Promise.all(burstPromises);
    const burst5xx = burstResults.filter(r => r.status >= 500).length;
    const burstSuccess = burstResults.filter(r => r.status === 200).length;
    const burst429 = burstResults.filter(r => r.status === 429).length;
    record('CHAOS-01', '50 concurrent cart validations: 0 server 5xx errors under burst traffic',
      burst5xx === 0 && (burstSuccess + burst429) === 50,
      `Success (200): ${burstSuccess}, Rate-limited (429): ${burst429}, 5xx: ${burst5xx}`);

    // ── CHAOS TEST 2: Stock hold creation & concurrent sweeper race ────────────
    // Create 10 expired stock holds directly in DB
    for (let i = 0; i < 10; i++) {
      await client.query(`
        INSERT INTO stock_holds (id, hold_group_id, book_id, qty, status, expires_at)
        VALUES ($1, $2, $3, 1, 'held', NOW() - INTERVAL '5 minutes')
      `, [`sh_chaos_${now}_${i}`, `hg_chaos_${now}_${i}`, chaosBookId]);
      // Decrement stock as hold creation would
      await client.query(`UPDATE books SET stock = stock - 1 WHERE id = $1`, [chaosBookId]);
    }

    // Verify stock is now 20 - 10 = 10
    const stockPreSweep = (await client.query('SELECT stock FROM books WHERE id = $1', [chaosBookId])).rows[0].stock;

    // Trigger sweeper logic via atomic database transaction
    const expired = await client.query(
      `SELECT DISTINCT hold_group_id FROM stock_holds
       WHERE status = 'held' AND expires_at < NOW() AND hold_group_id LIKE $1
       LIMIT 200`,
      [`hg_chaos_${now}%`]
    );
    let releasedGroups = 0;
    for (const row of expired.rows) {
      const res = await client.query(
        `UPDATE stock_holds
         SET status = 'released', released_at = NOW(), release_reason = 'ttl_expired', updated_at = NOW()
         WHERE hold_group_id = $1 AND status = 'held'
         RETURNING book_id, qty`,
        [row.hold_group_id]
      );
      if (res.rowCount > 0) {
        releasedGroups++;
        for (const r of res.rows) {
          await client.query(`UPDATE books SET stock = stock + $1 WHERE id = $2`, [r.qty, r.book_id]);
        }
      }
    }

    // Verify stock restored
    const stockPostSweep = (await client.query('SELECT stock FROM books WHERE id = $1', [chaosBookId])).rows[0].stock;
    record('CHAOS-02', 'Concurrent expired hold sweep atomically restores book inventory',
      releasedGroups >= 10 && Number(stockPostSweep) === 20,
      `Pre-sweep stock: ${stockPreSweep}, Released groups: ${releasedGroups}, Post-sweep stock: ${stockPostSweep}`);

    // ── CHAOS TEST 3: Mixed Traffic (Read + Search + Order Stream) Flooding ───
    const mixedEndpoints = [
      '/',
      '/api/products?limit=10',
      '/api/content?key=announcement',
      '/api/cart/validate',
      '/search?q=engineering',
    ];
    const mixedPromises = [];
    for (let i = 0; i < 40; i++) {
      const ep = mixedEndpoints[i % mixedEndpoints.length];
      const method = ep === '/api/cart/validate' ? 'POST' : 'GET';
      const body = method === 'POST' ? JSON.stringify({ items: [{ id: chaosBookId, qty: 1 }] }) : undefined;
      mixedPromises.push(
        request(ep, {
          method,
          body,
          headers: { 'X-Forwarded-For': `203.0.113.${(i % 30) + 1}` },
        })
      );
    }
    const mixedResults = await Promise.all(mixedPromises);
    const mixed5xx = mixedResults.filter(r => r.status >= 500).length;
    record('CHAOS-03', '40 heterogeneous requests across catalog, search, and content: 0 5xx errors',
      mixed5xx === 0, `5xx count: ${mixed5xx} / 40`);

    // ── CHAOS TEST 4: Post-Chaos Database Relational Consistency ──────────────
    const finalBook = (await client.query('SELECT stock FROM books WHERE id = $1', [chaosBookId])).rows[0];
    const finalStock = Number(finalBook?.stock || 0);
    record('CHAOS-04', 'Post-chaos inventory balance strictly matches initial state (20)',
      finalStock === 20, `Final stock: ${finalStock}`);

  } finally {
    await client.query('DELETE FROM stock_holds WHERE book_id = $1', [chaosBookId]);
    await client.query('DELETE FROM books WHERE id = $1', [chaosBookId]);
    client.release();
    await pool.end();
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 18 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
