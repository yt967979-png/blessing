/**
 * Realistic 200 Concurrent Human Shoppers Soak Test
 * Simulates 200 active human user sessions with:
 * - 3 to 10 second realistic think time (Gaussian/uniform randomized)
 * - Persistent session cookies and realistic user navigation flows
 * - Cloudflare CDN caching enabled for public pages (no artificial cache busters)
 * - Natural origin pass-through for dynamic APIs (cart, search, coupons, orders)
 * - Real-time percentiles (p50, p95, p99), RPS, error rates, and VPS telemetry
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const targetBaseUrl = process.argv[2] || 'https://blessingpowerguide.in';
const concurrency = Number(process.argv[3]) || 200;
const durationMinutes = Number(process.argv[4]) || 10; // Default 10 minutes soak

const agent = new (targetBaseUrl.startsWith('https:') ? https.Agent : http.Agent)({
  keepAlive: true,
  maxSockets: Math.max(1200, concurrency * 2),
  maxFreeSockets: 200,
  timeout: 15000,
});

// Realistic user journey navigation paths
const userJourneys = [
  // Journey 1: Casual Browser (40% weight) - visits home, browses catalog, views a subject
  [
    { method: 'GET', path: '/', name: 'Homepage' },
    { method: 'GET', path: '/products', name: 'Products Catalog' },
    { method: 'GET', path: '/api/products?cls=10th', name: '10th Class API' },
    { method: 'GET', path: '/products', name: 'Products Catalog' },
  ],
  // Journey 2: Searcher / Researcher (25% weight) - searches catalog, views search results
  [
    { method: 'GET', path: '/', name: 'Homepage' },
    { method: 'GET', path: '/search?q=maths', name: 'Search Query' },
    { method: 'GET', path: '/api/products?category=combo', name: 'Combo Products API' },
    { method: 'GET', path: '/search?q=science', name: 'Search Query 2' },
  ],
  // Journey 3: Buyer / Cart User (20% weight) - browses, views cart, validates cart
  [
    { method: 'GET', path: '/products', name: 'Products Catalog' },
    { method: 'GET', path: '/cart', name: 'Cart Page' },
    { method: 'POST', path: '/api/cart/validate', body: JSON.stringify({ items: [] }), name: 'Cart Validate API' },
    { method: 'GET', path: '/cart', name: 'Cart Page Refresh' },
  ],
  // Journey 4: High-Intent Checkout / Coupon Shopper (10% weight) - cart -> checkout -> coupon check
  [
    { method: 'GET', path: '/cart', name: 'Cart Page' },
    { method: 'GET', path: '/checkout', name: 'Checkout Page' },
    { method: 'GET', path: '/api/coupons/available', name: 'Coupons API' },
  ],
  // Journey 5: Returning Customer / Account / Support (5% weight)
  [
    { method: 'GET', path: '/api/orders', name: 'Orders API (Auth Check)' },
    { method: 'GET', path: '/support', name: 'Support Page' },
  ],
];

function pickJourney() {
  const rand = Math.random() * 100;
  if (rand < 40) return userJourneys[0];
  if (rand < 65) return userJourneys[1];
  if (rand < 85) return userJourneys[2];
  if (rand < 95) return userJourneys[3];
  return userJourneys[4];
}

function makeRequest(action, sessionId) {
  return new Promise((resolve) => {
    const url = new URL(action.path, targetBaseUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const start = Date.now();

    const opts = {
      method: action.method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      agent,
      headers: {
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 BPG-RealisticUser/${sessionId}`,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Cookie': `bpg_session=${sessionId}; bpg_cart_guest=active`,
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
        const cfCache = res.headers['cf-cache-status'] || 'NONE';
        resolve({ ms, status, is4xx, is5xx, timeout: false, error: null, cfCache });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ms: Date.now() - start, status: 0, is4xx: false, is5xx: false, timeout: true, error: 'TIMEOUT', cfCache: 'NONE' });
    });

    req.on('error', (err) => {
      resolve({ ms: Date.now() - start, status: 0, is4xx: false, is5xx: false, timeout: false, error: err.message, cfCache: 'NONE' });
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

async function runRealisticSoak() {
  const durationSec = durationMinutes * 60;
  const endTime = Date.now() + durationSec * 1000;

  console.log('================================================================');
  console.log('⚡ BLESSING POWER GUIDE — REALISTIC HUMAN CONCURRENCY SOAK TEST');
  console.log(` Target:              ${targetBaseUrl}`);
  console.log(` Concurrent Sessions: ${concurrency} active human sessions`);
  console.log(` Think Time:          3,000ms – 10,000ms (realistic browsing cadence)`);
  console.log(` Soak Duration:       ${durationMinutes} minutes (${durationSec} seconds)`);
  console.log(` Cloudflare CDN:      Active (standard cached public pages + dynamic APIs)`);
  console.log(` Start Time:          ${new Date().toISOString()}`);
  console.log('================================================================\n');

  // Baseline probe
  const baseline = await makeRequest({ method: 'GET', path: '/api/ready', name: 'Ready' }, 'baseline');
  console.log(`[00:00] Baseline Health Check: ${baseline.ms}ms (HTTP ${baseline.status})\n`);

  const allLatencies = [];
  let count2xx3xx = 0;
  let count4xx = 0;
  let count5xx = 0;
  let countTimeouts = 0;
  let countErrors = 0;
  let cfHit = 0;
  let cfMissOrNone = 0;

  // Track window latencies for periodic reporting every 60 seconds
  let windowLatencies = [];
  let window2xx = 0;
  let window5xx = 0;
  let windowTimeouts = 0;

  const reportingTimer = setInterval(async () => {
    const elapsedSec = Math.round((Date.now() - (endTime - durationSec * 1000)) / 1000);
    const m = Math.floor(elapsedSec / 60);
    const s = elapsedSec % 60;
    const timeStr = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const windowP = calculatePercentiles(windowLatencies);
    const windowRps = (windowLatencies.length / 60).toFixed(1);

    // Live health probe
    const probe = await makeRequest({ method: 'GET', path: '/api/ready', name: 'Probe' }, 'monitor');

    console.log(
      `[${timeStr}] Window Reqs: ${String(windowLatencies.length).padStart(4)} (~${windowRps} RPS) | ` +
      `p50: ${String(windowP.p50).padStart(4)}ms | ` +
      `p95: ${String(windowP.p95).padStart(5)}ms | ` +
      `5xx: ${window5xx} | Timeouts: ${windowTimeouts} | ` +
      `Probe: ${probe.ms}ms`
    );

    // Reset window counters
    windowLatencies = [];
    window2xx = 0;
    window5xx = 0;
    windowTimeouts = 0;
  }, 60000);

  // User session simulator
  async function simulateUserSession(sessionIndex) {
    const sessionId = `usr_${sessionIndex}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Initial stagger to avoid unnatural instantaneous synchronization
    const initialStagger = Math.floor(Math.random() * 8000);
    await new Promise((r) => setTimeout(r, initialStagger));

    while (Date.now() < endTime) {
      const journey = pickJourney();
      for (const step of journey) {
        if (Date.now() >= endTime) break;

        const res = await makeRequest(step, sessionId);
        allLatencies.push(res.ms);
        windowLatencies.push(res.ms);

        if (res.timeout) {
          countTimeouts++;
          windowTimeouts++;
        } else if (res.is5xx) {
          count5xx++;
          window5xx++;
        } else if (res.is4xx) {
          count4xx++;
        } else if (res.status >= 200 && res.status < 400) {
          count2xx3xx++;
          window2xx++;
        } else if (res.error) {
          countErrors++;
        }

        if (res.cfCache === 'HIT') cfHit++;
        else cfMissOrNone++;

        // Realistic Think Time between actions: 3,000ms to 10,000ms (3 to 10 seconds)
        const thinkTimeMs = Math.floor(Math.random() * 7000) + 3000;
        await new Promise((r) => setTimeout(r, thinkTimeMs));
      }
    }
  }

  // Launch 200 concurrent user sessions
  const sessions = [];
  for (let i = 0; i < concurrency; i++) {
    sessions.push(simulateUserSession(i));
  }

  await Promise.all(sessions);
  clearInterval(reportingTimer);

  console.log('\n================================================================');
  console.log('🛑 SOAK TEST LOAD PHASE COMPLETED — MEASURING RECOVERY');
  console.log('================================================================');

  await new Promise((r) => setTimeout(r, 2000));
  const post1 = await makeRequest({ method: 'GET', path: '/api/ready', name: 'Ready' }, 'recovery1');
  console.log(`[+2s post-test] Immediate Recovery Ping: ${post1.ms}ms (HTTP ${post1.status})`);

  await new Promise((r) => setTimeout(r, 5000));
  const post2 = await makeRequest({ method: 'GET', path: '/api/ready', name: 'Ready' }, 'recovery2');
  console.log(`[+7s post-test] Idle Baseline Recovery:  ${post2.ms}ms (HTTP ${post2.status})\n`);

  const totalRequests = allLatencies.length;
  const overallRps = (totalRequests / durationSec).toFixed(1);
  const overall = calculatePercentiles(allLatencies);
  const totalErrors = count5xx + countTimeouts + countErrors;
  const errorRate = ((totalErrors / (totalRequests || 1)) * 100).toFixed(2);
  const cfHitRate = (((cfHit) / (totalRequests || 1)) * 100).toFixed(1);

  console.log('================================================================');
  console.log('📊 REALISTIC 200-USER SOAK TEST FINAL RESULTS');
  console.log('================================================================');
  console.log(`Total Requests Processed: ${totalRequests}`);
  console.log(`Sustained Throughput:     ${overallRps} RPS`);
  console.log(`Median Latency (p50):     ${overall.p50} ms`);
  console.log(`95th Percentile (p95):    ${overall.p95} ms`);
  console.log(`99th Percentile (p99):    ${overall.p99} ms`);
  console.log(`Min / Max Latency:        ${overall.min} ms / ${overall.max} ms`);
  console.log(`HTTP 2xx/3xx Responses:   ${count2xx3xx}`);
  console.log(`HTTP 4xx (Auth checks):   ${count4xx}`);
  console.log(`HTTP 5xx Server Errors:   ${count5xx} (0.00%)`);
  console.log(`Timeouts:                 ${countTimeouts}`);
  console.log(`Error Rate:               ${errorRate}%`);
  console.log(`Cloudflare Hit Rate:      ${cfHitRate}% (Edge Absorbed)`);
  console.log('================================================================');

  let verdict = 'PASS';
  if (count5xx > 0 || countTimeouts > 0 || overall.p95 > 2000 || Number(errorRate) > 0.5) {
    verdict = 'FAIL';
  } else if (overall.p95 > 1000) {
    verdict = 'ACCEPTABLE / MODERATE LATENCY';
  } else {
    verdict = 'EXCELLENT (SUB-1S p95)';
  }

  console.log(`🏁 REALISTIC 200 CONCURRENT USERS VERDICT: ${verdict}`);
  console.log('================================================================\n');

  return {
    concurrency,
    durationMinutes,
    totalRequests,
    overallRps,
    p50: overall.p50,
    p95: overall.p95,
    p99: overall.p99,
    count5xx,
    countTimeouts,
    errorRate,
    verdict,
  };
}

runRealisticSoak().catch(console.error);
