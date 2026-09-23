/**
 * Phase 7: True Uncached Checkout Concurrency Test Harness
 * Exercises uncached mutating POST endpoints across 10 -> 25 -> 50 -> 100 -> 200 -> 300 -> 500 -> 750 -> 1000 concurrency.
 * Records p50, p95, p99, max latency, 5xx error rate, DB connection count, and server memory/swap telemetry.
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const { Pool } = require('pg');

const TARGET_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';
const DB_URL = process.env.DATABASE_URL || 'postgresql://blessing:blessing2025@localhost:5432/blessing';
const pool = new Pool({ connectionString: DB_URL, max: 5 });
pool.on('error', () => {}); // swallow background pool errors for telemetry

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 2000, timeout: 15000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 2000, timeout: 15000, rejectUnauthorized: false });

function getTelemetry() {
  try {
    const memOut = execSync('free -m | grep -E "Mem|Swap"', { encoding: 'utf8' });
    const loadOut = execSync('uptime', { encoding: 'utf8' }).trim();
    return { mem: memOut.trim(), load: loadOut };
  } catch (_) {
    return { mem: 'N/A', load: 'N/A' };
  }
}

async function getActiveDbConnections() {
  try {
    const res = await pool.query("SELECT count(*) FROM pg_stat_activity WHERE state = 'active'");
    return parseInt(res.rows[0].count, 10);
  } catch (_) {
    return 0;
  }
}

function sendUncachedRequest(catalogBookIds, clientIndex) {
  return new Promise((resolve) => {
    const isHttps = TARGET_URL.startsWith('https');
    const client = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;

    // Pick 2 random books for validation
    const b1 = catalogBookIds[Math.floor(Math.random() * catalogBookIds.length)];
    const b2 = catalogBookIds[Math.floor(Math.random() * catalogBookIds.length)];

    const payload = JSON.stringify({
      items: [
        { id: b1, qty: Math.floor(Math.random() * 3) + 1 },
        { id: b2, qty: Math.floor(Math.random() * 2) + 1 },
      ],
      _nonce: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });

    const simIp = `198.51.100.${(clientIndex % 250) + 1}`;
    const start = Date.now();
    const req = client.request(`${TARGET_URL}/api/cart/validate`, {
      method: 'POST',
      agent,
      headers: {
        'Host': 'blessingpowerguide.in',
        'User-Agent': 'ConcurrencyLoadTester/1.0',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Accept': 'application/json',
        'X-Forwarded-For': simIp,
        'cf-connecting-ip': simIp,
      },
      timeout: 10000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const duration = Date.now() - start;
        resolve({
          status: res.statusCode,
          duration,
          is5xx: res.statusCode >= 500,
          is2xx: res.statusCode >= 200 && res.statusCode < 300,
        });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, duration: Date.now() - start, is5xx: true, error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 408, duration: Date.now() - start, is5xx: false, error: 'Timeout' });
    });

    req.write(payload);
    req.end();
  });
}

function computePercentiles(numbers) {
  if (!numbers.length) return { p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...numbers].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.50)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const max = sorted[sorted.length - 1];
  return { p50, p95, p99, max };
}

async function runStep(concurrency, count, bookIds) {
  console.log(`\n▶ Testing Concurrency Level: ${concurrency} (${count} total requests)...`);
  const activeDbBefore = await getActiveDbConnections();
  const start = Date.now();

  const results = [];
  let inFlight = 0;
  let sent = 0;

  await new Promise((resolve) => {
    function launch() {
      while (inFlight < concurrency && sent < count) {
        inFlight++;
        sent++;
        sendUncachedRequest(bookIds, sent).then((r) => {
          results.push(r);
          inFlight--;
          if (results.length === count) {
            resolve();
          } else {
            launch();
          }
        });
      }
    }
    launch();
  });

  const totalTimeSec = (Date.now() - start) / 1000;
  const throughput = Math.round(count / totalTimeSec);
  const activeDbAfter = await getActiveDbConnections();

  const durations = results.map(r => r.duration);
  const percentiles = computePercentiles(durations);
  const count2xx = results.filter(r => r.is2xx).length;
  const count5xx = results.filter(r => r.is5xx).length;
  const countOther = count - count2xx - count5xx;

  const telemetry = getTelemetry();

  console.log(`  Throughput: ${throughput} req/s | Total Time: ${totalTimeSec.toFixed(2)}s`);
  console.log(`  Status: 2xx: ${count2xx} (${((count2xx / count) * 100).toFixed(1)}%) | 5xx: ${count5xx} (${((count5xx / count) * 100).toFixed(1)}%) | Other: ${countOther}`);
  console.log(`  Latency: p50: ${percentiles.p50}ms | p95: ${percentiles.p95}ms | p99: ${percentiles.p99}ms | Max: ${percentiles.max}ms`);
  console.log(`  Active DB Conns: before=${activeDbBefore}, after=${activeDbAfter}`);
  console.log(`  Server Load: ${telemetry.load}`);

  return {
    concurrency,
    count,
    throughput,
    count2xx,
    count5xx,
    p50: percentiles.p50,
    p95: percentiles.p95,
    p99: percentiles.p99,
    max: percentiles.max,
    activeDbPeak: Math.max(activeDbBefore, activeDbAfter),
    degraded: count5xx > 0 || percentiles.p95 > 2000,
  };
}

async function run() {
  console.log('================================================================');
  console.log('🚀  PHASE 7: TRUE UNCACHED CHECKOUT CONCURRENCY BENCHMARK');
  console.log(`Target: ${TARGET_URL}/api/cart/validate (POST uncached)`);
  console.log('================================================================');

  const booksRes = await pool.query('SELECT id FROM books WHERE COALESCE(stock, 0) > 0 LIMIT 20');
  const bookIds = booksRes.rows.map(r => r.id);
  if (!bookIds.length) {
    console.error('No in-stock books found in database!');
    process.exit(1);
  }

  const STEPS = [
    { concurrency: 10, count: 50 },
    { concurrency: 25, count: 100 },
    { concurrency: 50, count: 200 },
    { concurrency: 100, count: 400 },
    { concurrency: 200, count: 800 },
    { concurrency: 300, count: 1200 },
    { concurrency: 500, count: 1500 },
    { concurrency: 750, count: 2000 },
    { concurrency: 1000, count: 2500 },
  ];

  const summary = [];
  let firstDegradedLevel = null;

  for (const step of STEPS) {
    const res = await runStep(step.concurrency, step.count, bookIds);
    summary.push(res);
    if (res.degraded && !firstDegradedLevel) {
      firstDegradedLevel = res.concurrency;
      console.warn(`\n⚠️  Performance degradation threshold detected at Concurrency = ${res.concurrency}`);
    }
    // Brief 1s breather between steps to let sockets drain
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n================================================================');
  console.log('📊 PHASE 7 CONCURRENCY STEP-UP SUMMARY');
  console.log('================================================================');
  console.table(summary.map(s => ({
    'Concurrency': s.concurrency,
    'Reqs': s.count,
    'Req/s': s.throughput,
    '2xx %': `${((s.count2xx / s.count) * 100).toFixed(1)}%`,
    '5xx %': `${((s.count5xx / s.count) * 100).toFixed(1)}%`,
    'p50 (ms)': s.p50,
    'p95 (ms)': s.p95,
    'p99 (ms)': s.p99,
    'Max (ms)': s.max,
    'Distress': s.degraded ? '⚠️ YES' : '✅ NO',
  })));

  console.log(`\nExact Degradation Threshold: ${firstDegradedLevel ? `Concurrency ${firstDegradedLevel}` : 'NONE observed (Zero 5xx up to 1,000 concurrency!)'}`);
  await pool.end();
}

run();
