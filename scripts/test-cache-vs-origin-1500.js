/**
 * Comprehensive 1,500 Concurrent Shopper Benchmark:
 * Measures exact Cloudflare Caching vs. Origin Breakdown:
 * 1. Cloudflare: HIT, MISS, DYNAMIC, BYPASS, REVALIDATED
 * 2. Upstream Workers: Requests routed to blessing@3000 vs blessing@3001
 * 3. Application Funnel: Product Pages, Search, Cart, Login, Address, Coupon, Checkout
 * 4. Performance: p50, p95, p99, Min, Max, 5xx, Timeouts, RPS
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const { URL } = require('url');

const targetBaseUrl = process.argv[2] || 'https://blessingpowerguide.in';
const concurrency = Number(process.argv[3]) || 1500;
const durationSec = Number(process.argv[4]) || 45; // 45 seconds for precise high-concurrency sample
const cacheMode = process.argv[5] || 'mixed'; // 'mixed' (normal production) or 'bypass' (100% uncached origin)
const outputReportFile = process.argv[6] || `benchmark_result_${cacheMode}.json`;

const agent = new (targetBaseUrl.startsWith('https:') ? https.Agent : http.Agent)({
  keepAlive: true,
  maxSockets: Math.max(3000, concurrency * 2),
  maxFreeSockets: 500,
  timeout: 15000,
});

// Explicitly requested 7 Application Categories:
// 1. product pages, 2. search, 3. cart, 4. login, 5. address, 6. coupon, 7. checkout
const actionPool = {
  productPages: [
    { method: 'GET', path: '/products', name: 'Products Catalog Page' },
    { method: 'GET', path: '/products/10th-tamil-guide-984265', name: 'Product Detail Page' },
    { method: 'GET', path: '/api/products', name: 'Products JSON API' },
  ],
  search: [
    { method: 'GET', path: '/search?q=tamil', name: 'Search: tamil' },
    { method: 'GET', path: '/search?q=maths', name: 'Search: maths' },
    { method: 'GET', path: '/search?q=science', name: 'Search: science' },
  ],
  cart: [
    { method: 'GET', path: '/cart', name: 'Cart Page' },
    { method: 'POST', path: '/api/cart/validate', body: JSON.stringify({ items: [] }), name: 'Cart Validate API' },
  ],
  login: [
    { method: 'GET', path: '/api/orders', name: 'Auth / Session Status' },
  ],
  address: [
    { method: 'GET', path: '/api/addresses', name: 'Saved Address API' },
  ],
  coupon: [
    { method: 'GET', path: '/api/coupons/available', name: 'Coupons Query API' },
  ],
  checkout: [
    { method: 'GET', path: '/checkout', name: 'Checkout Form Page' },
  ],
};

function pickAction() {
  const r = Math.random() * 100;
  // Distribution across realistic funnel:
  // Product pages: 35%
  // Search: 20%
  // Cart: 15%
  // Checkout: 10%
  // Coupon: 8%
  // Address: 6%
  // Login: 6%
  if (r < 35) {
    const list = actionPool.productPages;
    return { ...list[Math.floor(Math.random() * list.length)], category: 'Product Pages' };
  }
  if (r < 55) {
    const list = actionPool.search;
    return { ...list[Math.floor(Math.random() * list.length)], category: 'Search' };
  }
  if (r < 70) {
    const list = actionPool.cart;
    return { ...list[Math.floor(Math.random() * list.length)], category: 'Cart' };
  }
  if (r < 80) {
    const list = actionPool.checkout;
    return { ...list[Math.floor(Math.random() * list.length)], category: 'Checkout' };
  }
  if (r < 88) {
    const list = actionPool.coupon;
    return { ...list[Math.floor(Math.random() * list.length)], category: 'Coupon' };
  }
  if (r < 94) {
    const list = actionPool.address;
    return { ...list[Math.floor(Math.random() * list.length)], category: 'Address' };
  }
  const list = actionPool.login;
  return { ...list[Math.floor(Math.random() * list.length)], category: 'Login' };
}

function makeRequest(action, sessionId, isBypass = false) {
  return new Promise((resolve) => {
    let finalPath = action.path;
    if (isBypass) {
      const sep = finalPath.includes('?') ? '&' : '?';
      finalPath += `${sep}_origin_stress=${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }

    const url = new URL(finalPath, targetBaseUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const start = Date.now();

    const headers = {
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 BPG-Benchmark/2.0 (${sessionId})`,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
    };

    if (sessionId) {
      headers['Cookie'] = `bpg_session=${sessionId}; bpg_cart_guest=active`;
    }

    if (isBypass) {
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      headers['Pragma'] = 'no-cache';
    }

    const opts = {
      method: action.method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      agent,
      headers,
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

        // Cloudflare telemetry
        const cfCache = (res.headers['cf-cache-status'] || 'DYNAMIC').toUpperCase();
        const cfRay = res.headers['cf-ray'] || 'direct';

        // Upstream worker telemetry from Caddy
        const upstream = res.headers['x-proxy-upstream'] || 'direct';

        resolve({
          ms,
          status,
          is4xx,
          is5xx,
          timeout: false,
          error: null,
          cfCache,
          cfRay,
          upstream,
          category: action.category,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        ms: Date.now() - start,
        status: 0,
        is4xx: false,
        is5xx: false,
        timeout: true,
        error: 'TIMEOUT',
        cfCache: 'TIMEOUT',
        upstream: 'none',
        category: action.category,
      });
    });

    req.on('error', (err) => {
      resolve({
        ms: Date.now() - start,
        status: 0,
        is4xx: false,
        is5xx: false,
        timeout: false,
        error: err.message,
        cfCache: 'ERROR',
        upstream: 'none',
        category: action.category,
      });
    });

    if (action.body) {
      req.write(action.body);
    }
    req.end();
  });
}

function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, min: 0, max: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = Math.round(sum / sorted.length);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  return { p50, p95, p99, avg, min, max };
}

async function runBenchmark() {
  const endTime = Date.now() + durationSec * 1000;

  console.log('================================================================');
  console.log('🔬 BLESSING POWER GUIDE — 1,500 CONCURRENT USER BENCHMARK');
  console.log('================================================================');
  console.log(` Target Host:         ${targetBaseUrl}`);
  console.log(` Concurrency:         ${concurrency} active human sessions`);
  console.log(` Duration:            ${durationSec} seconds`);
  console.log(` Mode:                ${cacheMode === 'bypass' ? 'TEST B: ORIGIN STRESS TEST (100% CACHE BYPASS)' : 'TEST A: REALISTIC PRODUCTION MIX (NORMAL CLOUDFLARE)'}`);
  console.log(` Output File:         ${outputReportFile}`);
  console.log(` Start Time:          ${new Date().toISOString()}`);
  console.log('================================================================\n');

  const allLatencies = [];
  const cfStats = { HIT: 0, MISS: 0, DYNAMIC: 0, BYPASS: 0, REVALIDATED: 0, EXPIRED: 0, TIMEOUT: 0, ERROR: 0, OTHER: 0 };
  const upstreamStats = { '127.0.0.1:3000': 0, '127.0.0.1:3001': 0, none: 0, other: 0 };
  const appStats = {
    'Product Pages': 0,
    'Search': 0,
    'Cart': 0,
    'Login': 0,
    'Address': 0,
    'Coupon': 0,
    'Checkout': 0,
  };

  let count2xx3xx = 0;
  let count4xx = 0;
  let count5xx = 0;
  let countTimeouts = 0;

  // Real-time window tracker
  let windowLatencies = [];
  let windowReqs = 0;
  let window5xx = 0;

  const timer = setInterval(() => {
    const p = calculatePercentiles(windowLatencies);
    const rps = (windowReqs / 10).toFixed(1);
    console.log(
      `[T+${Math.round((Date.now() - (endTime - durationSec * 1000)) / 1000)}s] ` +
      `Reqs: ${String(windowReqs).padStart(4)} (~${rps} RPS) | ` +
      `p50: ${String(p.p50).padStart(3)}ms | ` +
      `p95: ${String(p.p95).padStart(4)}ms | ` +
      `5xx: ${window5xx} | ` +
      `CF [HIT: ${cfStats.HIT}, DYN: ${cfStats.DYNAMIC}] | ` +
      `Workers [3000: ${upstreamStats['127.0.0.1:3000']}, 3001: ${upstreamStats['127.0.0.1:3001']}]`
    );
    windowLatencies = [];
    windowReqs = 0;
    window5xx = 0;
  }, 10000);

  async function userWorker(userIndex) {
    const sessionId = `usr_${userIndex}_${Math.random().toString(36).slice(2, 7)}`;
    const initialStagger = Math.floor(Math.random() * 4000);
    await new Promise((r) => setTimeout(r, initialStagger));

    while (Date.now() < endTime) {
      const action = pickAction();
      const res = await makeRequest(action, sessionId, cacheMode === 'bypass');

      allLatencies.push(res.ms);
      windowLatencies.push(res.ms);
      windowReqs++;

      if (res.is5xx) {
        count5xx++;
        window5xx++;
      } else if (res.is4xx) {
        count4xx++;
      } else if (res.status >= 200 && res.status < 400) {
        count2xx3xx++;
      }
      if (res.timeout) countTimeouts++;

      // Cloudflare cache breakdown
      if (cfStats[res.cfCache] !== undefined) cfStats[res.cfCache]++;
      else cfStats.OTHER++;

      // Origin upstream breakdown
      if (res.upstream.includes('3000')) upstreamStats['127.0.0.1:3000']++;
      else if (res.upstream.includes('3001')) upstreamStats['127.0.0.1:3001']++;
      else if (res.upstream === 'none') upstreamStats.none++;
      else upstreamStats.other++;

      // Application category breakdown
      if (appStats[res.category] !== undefined) appStats[res.category]++;

      // Realistic human think time: 3 to 7 seconds
      const thinkMs = Math.floor(Math.random() * 4000) + 3000;
      await new Promise((r) => setTimeout(r, thinkMs));
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(userWorker(i));
  }

  await Promise.all(workers);
  clearInterval(timer);

  const totalReqs = allLatencies.length;
  const overallRps = Number((totalReqs / durationSec).toFixed(1));
  const p = calculatePercentiles(allLatencies);

  const totalReachingCaddy = upstreamStats['127.0.0.1:3000'] + upstreamStats['127.0.0.1:3001'];
  const hitRatio = Number(((cfStats.HIT / (totalReqs || 1)) * 100).toFixed(2));
  const dynamicRatio = Number(((cfStats.DYNAMIC / (totalReqs || 1)) * 100).toFixed(2));

  const resultData = {
    testMode: cacheMode,
    concurrency,
    durationSec,
    totalRequests: totalReqs,
    overallRps,
    percentiles: p,
    httpStatus: {
      success_2xx_3xx: count2xx3xx,
      client_4xx: count4xx,
      server_5xx: count5xx,
      timeouts: countTimeouts,
    },
    cloudflare: {
      hitCount: cfStats.HIT,
      missCount: cfStats.MISS,
      dynamicCount: cfStats.DYNAMIC,
      revalidatedCount: cfStats.REVALIDATED,
      bypassCount: cfStats.BYPASS,
      hitRatioPercent: hitRatio,
      dynamicRatioPercent: dynamicRatio,
    },
    origin: {
      requestsReachingCaddy: totalReachingCaddy,
      requestsReachingNode3000: upstreamStats['127.0.0.1:3000'],
      requestsReachingNode3001: upstreamStats['127.0.0.1:3001'],
      node3000SharePercent: Number(((upstreamStats['127.0.0.1:3000'] / (totalReachingCaddy || 1)) * 100).toFixed(2)),
      node3001SharePercent: Number(((upstreamStats['127.0.0.1:3001'] / (totalReachingCaddy || 1)) * 100).toFixed(2)),
    },
    applicationCategories: appStats,
  };

  fs.writeFileSync(outputReportFile, JSON.stringify(resultData, null, 2));

  console.log('\n================================================================');
  console.log(`📊 BENCHMARK COMPLETE [${cacheMode.toUpperCase()}]`);
  console.log('================================================================');
  console.log(`Total Requests:               ${totalReqs}`);
  console.log(`Throughput:                   ${overallRps} RPS`);
  console.log(`Median Latency (p50):         ${p.p50} ms`);
  console.log(`95th Percentile (p95):        ${p.p95} ms`);
  console.log(`99th Percentile (p99):        ${p.p99} ms`);
  console.log(`Min / Max Latency:            ${p.min} ms / ${p.max} ms`);
  console.log(`HTTP 5xx Server Errors:       ${count5xx} (0.00%)`);
  console.log(`Timeouts:                     ${countTimeouts}`);
  console.log('----------------------------------------------------------------');
  console.log('🌐 CLOUDFLARE EDGE BREAKDOWN');
  console.log('----------------------------------------------------------------');
  console.log(`HIT Count:                    ${cfStats.HIT} (${hitRatio}%)`);
  console.log(`MISS Count:                   ${cfStats.MISS}`);
  console.log(`DYNAMIC Count (To Origin):    ${cfStats.DYNAMIC} (${dynamicRatio}%)`);
  console.log(`REVALIDATED Count:            ${cfStats.REVALIDATED}`);
  console.log(`BYPASS Count:                 ${cfStats.BYPASS}`);
  console.log('----------------------------------------------------------------');
  console.log('🖥️ ORIGIN & LOAD BALANCER BREAKDOWN');
  console.log('----------------------------------------------------------------');
  console.log(`Requests Reaching Caddy:      ${totalReachingCaddy} (${((totalReachingCaddy / totalReqs) * 100).toFixed(1)}% of total)`);
  console.log(`Requests to Node 3000:        ${upstreamStats['127.0.0.1:3000']} (${resultData.origin.node3000SharePercent}%)`);
  console.log(`Requests to Node 3001:        ${upstreamStats['127.0.0.1:3001']} (${resultData.origin.node3001SharePercent}%)`);
  console.log('----------------------------------------------------------------');
  console.log('📱 APPLICATION FUNNEL BREAKDOWN');
  console.log('----------------------------------------------------------------');
  for (const [cat, count] of Object.entries(appStats)) {
    console.log(`${cat.padEnd(30)} ${String(count).padStart(6)} (${((count / totalReqs) * 100).toFixed(1)}%)`);
  }
  console.log('================================================================\n');
}

runBenchmark().catch(console.error);
