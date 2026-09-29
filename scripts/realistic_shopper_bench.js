/**
 * Realistic Shopper Capacity Benchmark
 * Simulates real shoppers browsing, searching, checking cart, and preparing checkout.
 * Round-robins across both live Node workers (port 3000 & 3001).
 * Captures real system metrics: p50/p95/p99 latency, RPS, CPU, Worker RSS, and PostgreSQL pool connections.
 */

const http = require('http');
const { execSync } = require('child_process');

const targets = ['http://127.0.0.1:3000', 'http://127.0.0.1:3001'];
let targetIdx = 0;

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 600,
  maxFreeSockets: 100,
  timeout: 10000,
});

// Realistic user action pool
const actionPool = [
  // 70% Browsing & Product Pages (Cached + SSR)
  { weight: 25, method: 'GET', path: '/', name: 'Homepage' },
  { weight: 20, method: 'GET', path: '/products', name: 'Products Catalog' },
  { weight: 15, method: 'GET', path: '/api/products', name: 'Catalog API' },
  { weight: 10, method: 'GET', path: '/api/products?cls=10th', name: '10th Category API' },

  // 15% Search & Filters
  { weight: 10, method: 'GET', path: '/search?q=maths', name: 'Search Query' },
  { weight: 5, method: 'GET', path: '/api/products?category=combo', name: 'Combo API' },

  // 10% Cart & Stock Verification (Authoritative DB check)
  { weight: 6, method: 'GET', path: '/cart', name: 'Cart Page' },
  { weight: 4, method: 'POST', path: '/api/cart/validate', body: JSON.stringify({ items: [] }), name: 'Cart Validate API' },

  // 5% Checkout & Coupons
  { weight: 3, method: 'GET', path: '/checkout', name: 'Checkout Page' },
  { weight: 2, method: 'GET', path: '/api/coupons/available', name: 'Coupons API' },
];

const weightedActions = [];
for (const a of actionPool) {
  for (let i = 0; i < a.weight; i++) weightedActions.push(a);
}

function getRandomAction() {
  return weightedActions[Math.floor(Math.random() * weightedActions.length)];
}

function makeRequest(action) {
  return new Promise((resolve) => {
    targetIdx = (targetIdx + 1) % targets.length;
    const base = targets[targetIdx];
    const url = new URL(action.path, base);
    const start = Date.now();

    const opts = {
      method: action.method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      agent,
      headers: {
        'User-Agent': 'ShopperSim/1.0 (Mozilla/5.0 Realistic E-Commerce Benchmark)',
        'Accept': 'text/html,application/json,*/*;q=0.9',
        'Connection': 'keep-alive',
      },
      timeout: 8000,
    };

    if (action.body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(action.body);
    }

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        const ms = Date.now() - start;
        const status = res.statusCode;
        resolve({ ms, status, is5xx: status >= 500, timeout: false, error: null });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ms: Date.now() - start, status: 0, is5xx: false, timeout: true, error: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      resolve({ ms: Date.now() - start, status: 0, is5xx: false, timeout: false, error: err.message });
    });

    if (action.body) req.write(action.body);
    req.end();
  });
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0 };
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const avg = Math.round(sum / latencies.length);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  return { p50, p95, p99, avg };
}

function getServerMetrics() {
  try {
    const memStr = execSync('free -m | grep Mem:').toString();
    const memParts = memStr.trim().split(/\s+/);
    const totalMem = memParts[1];
    const usedMem = memParts[2];
    const freeMem = memParts[6] || memParts[3];

    const workerRssStr = execSync("ps -eo pid,rss,cmd | grep 'next-server' | grep -v grep | awk '{print $2}'").toString();
    const rssList = workerRssStr.trim().split('\n').filter(Boolean).map(x => Math.round(Number(x) / 1024));

    const pgStr = execSync("sudo -u postgres psql -d blessing -t -c 'SELECT count(*) FROM pg_stat_activity WHERE state = \"active\";' 2>/dev/null").toString();
    const activePg = pgStr.trim() || '0';

    return {
      usedMemMb: `${usedMem}/${totalMem}MB`,
      workerRss: rssList.map(r => `${r}MB`).join(' + ') || 'N/A',
      activePg,
    };
  } catch {
    return { usedMemMb: 'N/A', workerRss: 'N/A', activePg: 'N/A' };
  }
}

async function runTier(simulatedUsers, durationSec = 10) {
  const endTime = Date.now() + durationSec * 1000;
  const latencies = [];
  let count2xx = 0;
  let count5xx = 0;
  let countTimeouts = 0;

  async function user() {
    while (Date.now() < endTime) {
      const action = getRandomAction();
      const res = await makeRequest(action);
      latencies.push(res.ms);
      if (res.timeout) countTimeouts++;
      else if (res.is5xx) count5xx++;
      else if (res.status >= 200 && res.status < 400) count2xx++;

      // Realistic shopper think-time (20ms - 80ms)
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 60) + 20));
    }
  }

  const userPromises = [];
  for (let i = 0; i < simulatedUsers; i++) {
    userPromises.push(user());
  }

  await Promise.all(userPromises);

  const total = latencies.length;
  const rps = (total / durationSec).toFixed(1);
  const p = calculatePercentiles(latencies);
  const metrics = getServerMetrics();

  return {
    simulatedUsers,
    total,
    rps,
    p50: p.p50,
    p95: p.p95,
    p99: p.p99,
    count5xx,
    countTimeouts,
    ...metrics,
  };
}

async function main() {
  console.log('========================================================================================');
  console.log('⚡ REALISTIC E-COMMERCE SHOPPER CAPACITY BENCHMARK');
  console.log(' Targets: http://127.0.0.1:3000 (Worker 1) & http://127.0.0.1:3001 (Worker 2)');
  console.log(' Mix: 70% Catalog/Browsing (Cached) | 15% Search | 10% Cart/Stock (DB) | 5% Checkout');
  console.log('========================================================================================\n');

  // Verify baseline
  const p1 = await makeRequest({ method: 'GET', path: '/api/ready' });
  const p2 = await makeRequest({ method: 'GET', path: '/api/ready' });
  console.log(`Baseline Ready Check: Worker 1 = ${p1.ms}ms (HTTP ${p1.status}) | Worker 2 = ${p2.ms}ms (HTTP ${p2.status})\n`);

  console.log('Shoppers |   RPS   |  p50 (ms) |  p95 (ms) |  p99 (ms) | 5xx | Timeouts | System RAM | Workers RSS | PG Active');
  console.log('---------+---------+-----------+-----------+-----------+-----+----------+------------+-------------+----------');

  const tiers = [50, 100, 200, 300, 400, 500];

  for (const users of tiers) {
    const res = await runTier(users, 10);
    console.log(
      `${String(res.simulatedUsers).padStart(8)} | ` +
      `${String(res.rps).padStart(7)} | ` +
      `${String(res.p50).padStart(9)} | ` +
      `${String(res.p95).padStart(9)} | ` +
      `${String(res.p99).padStart(9)} | ` +
      `${String(res.count5xx).padStart(3)} | ` +
      `${String(res.countTimeouts).padStart(8)} | ` +
      `${String(res.usedMemMb).padStart(10)} | ` +
      `${String(res.workerRss).padStart(11)} | ` +
      `${String(res.activePg).padStart(9)}`
    );
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n========================================================================================');
  console.log('🏁 BENCHMARK COMPLETE');
  console.log('========================================================================================');
}

main().catch(console.error);
