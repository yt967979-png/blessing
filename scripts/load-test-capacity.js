/**
 * Production Capacity & Concurrency Load Test Harness
 * Measures real latency percentiles (p50, p95, p99), RPS, and error rates across:
 * - Realistic user traffic distribution (60% browsing, 15% search, 10% cart, 5% orders, 5% support, 5% checkout)
 * - Both Cache HIT and Cache MISS scenarios
 * - Gradual concurrency step-up: 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500
 * - Real-time SSE streaming connection scaling
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const targetBaseUrl = process.argv[2] || 'https://blessingpowerguide.in';
const runMode = process.argv[3] || 'all';

const agent = new (targetBaseUrl.startsWith('https:') ? https.Agent : http.Agent)({
  keepAlive: true,
  maxSockets: 700,
  maxFreeSockets: 100,
  timeout: 15000,
});

// Realistic user action pool (Phase 3 distribution)
const actionPool = [
  // 60% Browsing / Catalog
  { weight: 20, method: 'GET', path: '/', name: 'Homepage' },
  { weight: 20, method: 'GET', path: '/products', name: 'Products Catalog' },
  { weight: 10, method: 'GET', path: '/api/products', name: 'Products API' },
  { weight: 10, method: 'GET', path: '/api/products?cls=10th', name: '10th Class API' },

  // 15% Product / Search
  { weight: 10, method: 'GET', path: '/search?q=maths', name: 'Search Query' },
  { weight: 5, method: 'GET', path: '/api/products?category=combo', name: 'Combo Products API' },

  // 10% Cart
  { weight: 7, method: 'GET', path: '/cart', name: 'Cart Page' },
  { weight: 3, method: 'POST', path: '/api/cart/validate', body: JSON.stringify({ items: [] }), name: 'Cart Validate API' },

  // 5% Account / Order History
  { weight: 5, method: 'GET', path: '/api/orders', name: 'Orders API (Auth Check)' },

  // 5% Support
  { weight: 5, method: 'GET', path: '/support', name: 'Support Page' },

  // 5% Checkout / Coupons
  { weight: 3, method: 'GET', path: '/checkout', name: 'Checkout Page' },
  { weight: 2, method: 'GET', path: '/api/coupons/available', name: 'Available Coupons API' },
];

const weightedActions = [];
for (const action of actionPool) {
  for (let i = 0; i < action.weight; i++) {
    weightedActions.push(action);
  }
}

function getRandomAction() {
  const idx = Math.floor(Math.random() * weightedActions.length);
  return weightedActions[idx];
}

function makeRequest(action, cacheBust = false) {
  return new Promise((resolve) => {
    let fullPath = action.path;
    if (cacheBust) {
      const sep = fullPath.includes('?') ? '&' : '?';
      fullPath += `${sep}_cb=${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }

    const url = new URL(fullPath, targetBaseUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const start = Date.now();

    const opts = {
      method: action.method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      agent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 BPG-LoadTester/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
      },
      timeout: 12000,
    };

    if (action.body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(action.body);
    }

    const req = transport.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        const ms = Date.now() - start;
        const status = res.statusCode;
        const is4xx = status >= 400 && status < 500;
        const is5xx = status >= 500;
        resolve({ ms, status, is4xx, is5xx, timeout: false, error: null });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ms: Date.now() - start, status: 0, is4xx: false, is5xx: false, timeout: true, error: 'TIMEOUT' });
    });

    req.on('error', (err) => {
      resolve({ ms: Date.now() - start, status: 0, is4xx: false, is5xx: false, timeout: false, error: err.message });
    });

    if (action.body) {
      req.write(action.body);
    }
    req.end();
  });
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  latencies.sort((a, b) => a - b);
  const sum = latencies.reduce((acc, v) => acc + v, 0);
  const avg = Math.round(sum / latencies.length);
  const min = latencies[0];
  const max = latencies[latencies.length - 1];
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  return { p50, p95, p99, avg, min, max };
}

async function runConcurrencyTier(concurrency, durationSec = 10, cacheBust = false) {
  const endTime = Date.now() + durationSec * 1000;
  const latencies = [];
  let count2xx3xx = 0;
  let count4xx = 0;
  let count5xx = 0;
  let countTimeouts = 0;
  let countErrors = 0;

  async function worker() {
    while (Date.now() < endTime) {
      const action = getRandomAction();
      const res = await makeRequest(action, cacheBust);

      latencies.push(res.ms);
      if (res.timeout) {
        countTimeouts++;
      } else if (res.is5xx) {
        count5xx++;
      } else if (res.is4xx) {
        count4xx++;
      } else if (res.status >= 200 && res.status < 400) {
        count2xx3xx++;
      } else if (res.error) {
        countErrors++;
      }

      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 40) + 10));
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  const totalRequests = latencies.length;
  const rps = (totalRequests / durationSec).toFixed(1);
  const percentiles = calculatePercentiles(latencies);
  const totalErrors = count5xx + countTimeouts + countErrors;
  const errorRate = ((totalErrors / (totalRequests || 1)) * 100).toFixed(2);

  return {
    concurrency,
    durationSec,
    totalRequests,
    rps,
    p50: percentiles.p50,
    p95: percentiles.p95,
    p99: percentiles.p99,
    avg: percentiles.avg,
    count2xx3xx,
    count4xx,
    count5xx,
    countTimeouts,
    countErrors,
    errorRate,
  };
}

async function runSseLoadTier(concurrency, durationSec = 10) {
  console.log(`\nTesting ${concurrency} simultaneous SSE connections...`);
  const connections = [];
  let connectedCount = 0;
  let droppedCount = 0;
  let messagesReceived = 0;

  const url = new URL('/api/stock/stream', targetBaseUrl);
  const transport = url.protocol === 'https:' ? https : http;

  const connectSingleSse = (id) => {
    return new Promise((resolve) => {
      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'GET',
          agent,
          headers: {
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        },
        (res) => {
          if (res.statusCode === 200) {
            connectedCount++;
          } else {
            droppedCount++;
          }
          res.on('data', (chunk) => {
            const str = chunk.toString();
            if (str.includes('data:')) {
              messagesReceived++;
            }
          });
          res.on('end', () => droppedCount++);
          res.on('error', () => droppedCount++);
          resolve({ req, res });
        }
      );

      req.on('error', () => {
        droppedCount++;
        resolve({ req, res: null });
      });

      req.setTimeout(15000, () => {
        req.destroy();
        resolve({ req, res: null });
      });

      req.end();
    });
  };

  for (let i = 0; i < concurrency; i++) {
    connections.push(connectSingleSse(i));
    if (i % 25 === 0) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  const active = await Promise.all(connections);

  await new Promise((r) => setTimeout(r, durationSec * 1000));

  for (const conn of active) {
    if (conn && conn.req) {
      try {
        conn.req.destroy();
      } catch (_) {}
    }
  }

  return {
    concurrency,
    connectedCount,
    droppedCount,
    messagesReceived,
    healthy: droppedCount === 0 || droppedCount / concurrency < 0.05,
  };
}

async function main() {
  console.log('================================================================');
  console.log('⚡ BLESSING POWER GUIDE — PRODUCTION CAPACITY / LOAD TEST');
  console.log(` Target: ${targetBaseUrl}`);
  console.log(` Date:   ${new Date().toISOString()}`);
  console.log(` Mode:   ${runMode}`);
  console.log('================================================================\n');

  const concurrencyLevels = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];

  // 1. Baseline check
  console.log('--- BASELINE CHECK (5 seconds idle probe) ---');
  const baselineRes = await makeRequest({ method: 'GET', path: '/api/ready', name: 'Ready' });
  console.log(`Initial DB Ping Latency: ${baselineRes.ms}ms (HTTP ${baselineRes.status})`);

  // 2. Cache HIT Scenario
  console.log('\n================================================================');
  console.log('📊 SCENARIO A: STANDARD USER LOAD (EDGE CDN CACHED & PUBLIC)');
  console.log('================================================================');
  console.log('Conc |   RPS   |  p50 (ms) |  p95 (ms) |  p99 (ms) |  5xx  | Timeout | Err Rate | Status');
  console.log('-----+---------+-----------+-----------+-----------+-------+---------+----------+-------');

  const scenarioAResults = [];
  for (const c of concurrencyLevels) {
    const res = await runConcurrencyTier(c, 8, false);
    scenarioAResults.push(res);
    let status = 'GREEN';
    if (res.p95 > 1000 || Number(res.errorRate) > 0.5) status = 'YELLOW';
    if (res.p95 > 2000 || Number(res.errorRate) > 1.0 || res.count5xx > 0 || res.countTimeouts > 0) status = 'RED';

    console.log(
      `${String(c).padStart(4)} | ` +
      `${String(res.rps).padStart(7)} | ` +
      `${String(res.p50).padStart(9)} | ` +
      `${String(res.p95).padStart(9)} | ` +
      `${String(res.p99).padStart(9)} | ` +
      `${String(res.count5xx).padStart(5)} | ` +
      `${String(res.countTimeouts).padStart(7)} | ` +
      `${String(res.errorRate + '%').padStart(8)} | ` +
      `${status}`
    );

    await new Promise((r) => setTimeout(r, 1500));
  }

  // 3. Cache MISS Scenario (Dynamic SSR / PostgreSQL engine queries)
  console.log('\n================================================================');
  console.log('📊 SCENARIO B: UNCACHED / CACHE MISS (APPLICATION & DATABASE ENGINE)');
  console.log('================================================================');
  console.log('Conc |   RPS   |  p50 (ms) |  p95 (ms) |  p99 (ms) |  5xx  | Timeout | Err Rate | Status');
  console.log('-----+---------+-----------+-----------+-----------+-------+---------+----------+-------');

  const scenarioBResults = [];
  for (const c of [10, 25, 50, 75, 100, 150, 200, 250, 300]) {
    const res = await runConcurrencyTier(c, 8, true);
    scenarioBResults.push(res);
    let status = 'GREEN';
    if (res.p95 > 1000 || Number(res.errorRate) > 0.5) status = 'YELLOW';
    if (res.p95 > 2000 || Number(res.errorRate) > 1.0 || res.count5xx > 0 || res.countTimeouts > 0) status = 'RED';

    console.log(
      `${String(c).padStart(4)} | ` +
      `${String(res.rps).padStart(7)} | ` +
      `${String(res.p50).padStart(9)} | ` +
      `${String(res.p95).padStart(9)} | ` +
      `${String(res.p99).padStart(9)} | ` +
      `${String(res.count5xx).padStart(5)} | ` +
      `${String(res.countTimeouts).padStart(7)} | ` +
      `${String(res.errorRate + '%').padStart(8)} | ` +
      `${status}`
    );

    if (status === 'RED' && (res.countTimeouts > 5 || res.count5xx > 5)) {
      console.log(`⚠️ Early break at ${c} concurrency to preserve production stability.`);
      break;
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  // 4. Real-time SSE Stream Concurrency Scaling
  console.log('\n================================================================');
  console.log('📊 SCENARIO C: REAL-TIME SSE SUPPORT & STOCK CONCURRENCY');
  console.log('================================================================');
  const sseLevels = [10, 25, 50, 100, 200, 300];
  const sseResults = [];
  for (const sseC of sseLevels) {
    const sseRes = await runSseLoadTier(sseC, 6);
    sseResults.push(sseRes);
    console.log(`SSE Conc: ${sseC.toString().padStart(3)} | Connected: ${sseRes.connectedCount.toString().padStart(3)} | Dropped: ${sseRes.droppedCount.toString().padStart(2)} | Messages: ${sseRes.messagesReceived.toString().padStart(3)} | Health: ${sseRes.healthy ? 'PASS' : 'FAIL'}`);
    await new Promise((r) => setTimeout(r, 1500));
  }

  // 5. Burst Test (Traffic Spike: 50 -> 200 -> 500)
  console.log('\n================================================================');
  console.log('📊 SCENARIO D: BURST TRAFFIC SPIKE TEST');
  console.log('================================================================');
  console.log('Testing spike from 50 to 200 concurrent users...');
  const burst1 = await runConcurrencyTier(200, 6, false);
  console.log(`Burst 200: RPS ${burst1.rps} | p50: ${burst1.p50}ms | p95: ${burst1.p95}ms | 5xx: ${burst1.count5xx} | Timeouts: ${burst1.countTimeouts}`);
  
  await new Promise((r) => setTimeout(r, 2000));
  const recoveryPing1 = await makeRequest({ method: 'GET', path: '/api/ready', name: 'Ready' });
  console.log(`Post-Burst Recovery Latency: ${recoveryPing1.ms}ms (HTTP ${recoveryPing1.status})`);

  console.log('\nTesting spike from 100 to 300 concurrent users...');
  const burst2 = await runConcurrencyTier(300, 6, false);
  console.log(`Burst 300: RPS ${burst2.rps} | p50: ${burst2.p50}ms | p95: ${burst2.p95}ms | 5xx: ${burst2.count5xx} | Timeouts: ${burst2.countTimeouts}`);
  
  await new Promise((r) => setTimeout(r, 2000));
  const recoveryPing2 = await makeRequest({ method: 'GET', path: '/api/ready', name: 'Ready' });
  console.log(`Post-Burst Recovery Latency: ${recoveryPing2.ms}ms (HTTP ${recoveryPing2.status})`);

  console.log('\n================================================================');
  console.log('🏁 CAPACITY BENCHMARK RUN COMPLETED');
  console.log('================================================================');
}

main().catch(console.error);
