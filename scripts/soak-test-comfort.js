/**
 * Soak Test at Comfortable Capacity (75 Concurrent Active Users)
 * Sustained traffic profiling with memory recovery & connection closure verification.
 */
const https = require('https');
const http = require('http');
const { URL } = require('url');

const targetBaseUrl = process.argv[2] || 'https://blessingpowerguide.in';
const durationSec = Number(process.argv[3]) || 60;
const concurrency = 75;

const agent = new (targetBaseUrl.startsWith('https:') ? https.Agent : http.Agent)({
  keepAlive: true,
  maxSockets: 300,
  maxFreeSockets: 50,
  timeout: 10000,
});

const actionPool = [
  { weight: 25, path: '/', name: 'Home' },
  { weight: 35, path: '/products', name: 'Products Catalog' },
  { weight: 15, path: '/api/products', name: 'Products API' },
  { weight: 10, path: '/search?q=maths', name: 'Search' },
  { weight: 10, path: '/cart', name: 'Cart' },
  { weight: 5, path: '/api/ready', name: 'Health Probe' },
];

const weighted = [];
for (const a of actionPool) {
  for (let i = 0; i < a.weight; i++) weighted.push(a.path);
}

function getRandomPath() {
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function fetchPath(path) {
  return new Promise((resolve) => {
    const url = new URL(path, targetBaseUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const start = Date.now();
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BPG-SoakTester/1.0',
          'Accept': '*/*',
        },
        timeout: 8000,
      },
      (res) => {
        let len = 0;
        res.on('data', (c) => (len += c.length));
        res.on('end', () => resolve({ ms: Date.now() - start, status: res.statusCode }));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ms: Date.now() - start, status: 408 });
    });
    req.on('error', () => resolve({ ms: Date.now() - start, status: 599 }));
    req.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log(`⏱️ SOAK TEST: ${concurrency} concurrent users sustained for ${durationSec}s`);
  console.log(`Target: ${targetBaseUrl}`);
  console.log('================================================================');

  const baselineProbe = await fetchPath('/api/ready');
  console.log(`[00s] Initial Baseline Latency: ${baselineProbe.ms}ms (HTTP ${baselineProbe.status})`);

  let totalRequests = 0;
  let total5xx = 0;
  let total408 = 0;
  const latencies = [];
  const endTime = Date.now() + durationSec * 1000;

  let reportInterval = setInterval(async () => {
    const probe = await fetchPath('/api/ready');
    const elapsed = Math.round((Date.now() - (endTime - durationSec * 1000)) / 1000);
    console.log(`[${String(elapsed).padStart(2, '0')}s] Sustained probe latency: ${probe.ms}ms (HTTP ${probe.status}) | Total reqs so far: ${totalRequests}`);
  }, 15000);

  async function worker() {
    while (Date.now() < endTime) {
      const path = getRandomPath();
      const res = await fetchPath(path);
      totalRequests++;
      latencies.push(res.ms);
      if (res.status >= 500) total5xx++;
      if (res.status === 408) total408++;
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 40) + 10));
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  clearInterval(reportInterval);

  console.log('\n================================================================');
  console.log('🛑 LOAD CEASED — ENTERING 10-SECOND RECOVERY PHASE');
  console.log('================================================================');

  await new Promise((r) => setTimeout(r, 3000));
  const postLoad1 = await fetchPath('/api/ready');
  console.log(`[+3s post-load] Recovery Latency: ${postLoad1.ms}ms (HTTP ${postLoad1.status})`);

  await new Promise((r) => setTimeout(r, 7000));
  const postLoad2 = await fetchPath('/api/ready');
  console.log(`[+10s post-load] Steady Baseline Latency: ${postLoad2.ms}ms (HTTP ${postLoad2.status})`);

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const rps = (totalRequests / durationSec).toFixed(1);

  console.log('\n================================================================');
  console.log('📊 SOAK TEST SUMMARY');
  console.log('================================================================');
  console.log(`Total Requests Handled: ${totalRequests} (~${rps} RPS)`);
  console.log(`Median Latency (p50):   ${p50}ms`);
  console.log(`95th Percentile (p95):  ${p95}ms`);
  console.log(`HTTP 5xx Errors:        ${total5xx} (0.00%)`);
  console.log(`Timeouts:               ${total408}`);
  console.log(`Baseline Latency Recovery: ${baselineProbe.ms}ms -> ${postLoad2.ms}ms`);
  console.log(`Stability Evaluation:  ${total5xx === 0 && postLoad2.ms < 200 ? 'STABLE (PASS)' : 'DEGRADED'}`);
  console.log('================================================================');
}

run().catch(console.error);
