/**
 * Transactional DB Stress Benchmark (Capacity #3)
 * Stress-tests stateful, database-dependent transactional operations:
 * - Real-time stock validation (POST /api/cart/validate)
 * - Coupon validation against DB rules (POST /api/coupons/validate)
 * - Order/Checkout status lookups (GET /api/checkout/status)
 * Measures raw PostgreSQL and Node.js concurrency under pure DB load.
 */

const http = require('http');

const targets = ['http://127.0.0.1:3000', 'http://127.0.0.1:3001'];
let targetIdx = 0;

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 400,
  maxFreeSockets: 50,
  timeout: 10000,
});

// Pool of purely stateful, database-intensive transactions
const txActions = [
  {
    weight: 40,
    method: 'POST',
    path: '/api/cart/validate',
    body: JSON.stringify({
      items: [
        { id: '1', qty: 2, title: '10th Maths Guide' },
        { id: '2', qty: 1, title: '10th Science Guide' }
      ]
    }),
    name: 'Live Stock Validate (DB Read/Lock Check)',
  },
  {
    weight: 30,
    method: 'POST',
    path: '/api/coupons/validate',
    body: JSON.stringify({ code: 'SAVE10', subtotal: 500, phone: '9360345770' }),
    name: 'Coupon Verification (DB Rule & Limit Check)',
  },
  {
    weight: 30,
    method: 'GET',
    path: '/api/checkout/status?orderId=order_test_bench_nonexistent',
    name: 'Checkout Session Status (DB Query)',
  },
];

const weighted = [];
for (const a of txActions) {
  for (let i = 0; i < a.weight; i++) weighted.push(a);
}

function getRandomTx() {
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function makeTxRequest(action) {
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
        'User-Agent': 'TxStressTester/1.0',
        'Accept': 'application/json',
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
        resolve({ ms, status, is5xx: status >= 500, timeout: false });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ms: Date.now() - start, status: 0, is5xx: false, timeout: true });
    });

    req.on('error', (err) => {
      resolve({ ms: Date.now() - start, status: 0, is5xx: false, timeout: false });
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

async function runTxTier(concurrency, durationSec = 8) {
  const endTime = Date.now() + durationSec * 1000;
  const latencies = [];
  let count2xx4xx = 0;
  let count5xx = 0;
  let countTimeouts = 0;

  async function worker() {
    while (Date.now() < endTime) {
      const tx = getRandomTx();
      const res = await makeTxRequest(tx);
      latencies.push(res.ms);
      if (res.timeout) countTimeouts++;
      else if (res.is5xx) count5xx++;
      else count2xx4xx++;

      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 20) + 10));
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  const total = latencies.length;
  const rps = (total / durationSec).toFixed(1);
  const p = calculatePercentiles(latencies);

  return {
    concurrency,
    total,
    rps,
    p50: p.p50,
    p95: p.p95,
    p99: p.p99,
    count5xx,
    countTimeouts,
  };
}

async function main() {
  console.log('========================================================================================');
  console.log('⚡ CAPACITY #3: PURE TRANSACTIONAL DATABASE STRESS TEST');
  console.log(' Targets: Dual Node Workers (:3000 & :3001) -> PostgreSQL Database Engine');
  console.log(' Operations: 40% Cart Stock Validation | 30% Coupon Rule Engine | 30% Session Lookups');
  console.log('========================================================================================\n');

  console.log('Tx Concurrency |   Tx/sec  |  p50 (ms) |  p95 (ms) |  p99 (ms) |  5xx Errors | Timeouts | Status');
  console.log('---------------+-----------+-----------+-----------+-----------+-------------+----------+--------');

  const tiers = [10, 25, 50, 75, 100, 150];

  for (const c of tiers) {
    const res = await runTxTier(c, 8);
    let status = 'GREEN';
    if (res.p95 > 500 || res.countTimeouts > 0) status = 'YELLOW';
    if (res.p95 > 1500 || res.count5xx > 0 || res.countTimeouts > 5) status = 'RED';

    console.log(
      `${String(res.concurrency).padStart(14)} | ` +
      `${String(res.rps).padStart(9)} | ` +
      `${String(res.p50).padStart(9)} | ` +
      `${String(res.p95).padStart(9)} | ` +
      `${String(res.p99).padStart(9)} | ` +
      `${String(res.count5xx).padStart(11)} | ` +
      `${String(res.countTimeouts).padStart(8)} | ` +
      `${status}`
    );
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log('\n========================================================================================');
  console.log('🏁 TRANSACTIONAL STRESS TEST COMPLETE');
  console.log('========================================================================================');
}

main().catch(console.error);
