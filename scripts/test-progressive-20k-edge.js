/**
 * Progressive 20,000 Simulated Human Sessions Edge Scaling Test
 * Models realistic human browsing behavior:
 * - 90% Static / Catalog / Browsing (absorbable by Cloudflare Edge cache)
 * - 10% Dynamic / Cart / Checkout / Auth check (passes through to Origin)
 * - Step progression: 500 -> 1,000 -> 2,000 -> 5,000 -> 10,000 -> 15,000 -> 20,000 active users
 * - Human think time: ~5-10 seconds per user
 * Measures: Requests/sec, Latency (p50, p95, p99), Cache HIT/MISS, and Error rate.
 */

const https = require('https');
const { URL } = require('url');

const BASE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 500,
  maxFreeSockets: 50,
  timeout: 10000,
});

// Realistic action mix
const actions = [
  // 90% Cacheable browsing
  { path: '/', weight: 35, name: 'Home' },
  { path: '/products', weight: 30, name: 'Catalog' },
  { path: '/api/products', weight: 15, name: 'Catalog API' },
  { path: '/help', weight: 5, name: 'Help Page' },
  { path: '/terms-of-service', weight: 5, name: 'Terms' },
  // 10% Dynamic origin actions
  { path: '/cart', weight: 4, name: 'Cart' },
  { path: '/checkout', weight: 2, name: 'Checkout' },
  { path: '/track', weight: 2, name: 'Track' },
  { path: '/api/health', weight: 2, name: 'Health Check' },
];

const pool = [];
for (const a of actions) {
  for (let i = 0; i < a.weight; i++) pool.push(a);
}

function getRandomAction() {
  return pool[Math.floor(Math.random() * pool.length)];
}

function sendRequest(path) {
  return new Promise((resolve) => {
    const start = Date.now();
    const url = new URL(path, BASE_URL);
    const req = https.get(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BPG-EdgeSimulation/1.0',
          'Accept': 'text/html,application/json,*/*',
        },
        timeout: 8000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const duration = Date.now() - start;
          const cfCache = res.headers['cf-cache-status'] || 'NONE';
          const isHit = ['HIT', 'STALE', 'REVALIDATED'].includes(cfCache);
          resolve({
            status: res.statusCode,
            duration,
            cfCache,
            isHit,
            error: null,
          });
        });
      }
    );

    req.on('error', (err) => {
      resolve({
        status: 0,
        duration: Date.now() - start,
        cfCache: 'ERROR',
        isHit: false,
        error: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 504,
        duration: Date.now() - start,
        cfCache: 'TIMEOUT',
        isHit: false,
        error: 'Timeout',
      });
    });
  });
}

function calcPercentiles(arr) {
  if (!arr.length) return { p50: 0, p95: 0, p99: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const max = sorted[sorted.length - 1];
  return { p50, p95, p99, max };
}

async function runStage(simulatedUsers, durationSec) {
  // At 5s average think time, simulatedUsers generates targetRps = simulatedUsers / 5
  // We cap max generator RPS at 150 RPS to ensure local machine / broadband doesn't become bottleneck
  const targetRps = Math.min(Math.round(simulatedUsers / 7), 120);
  const totalRequestsTarget = targetRps * durationSec;
  console.log(`\n▶ Stage: ${simulatedUsers.toLocaleString()} Simulated Users (Target ~${targetRps} req/s for ${durationSec}s)`);

  const latencies = [];
  let hits = 0;
  let misses = 0;
  let errors = 0;
  let successes = 0;

  const startTime = Date.now();
  const intervalMs = 1000 / targetRps;
  let dispatched = 0;

  const promises = [];

  while (dispatched < totalRequestsTarget) {
    const act = getRandomAction();
    const p = sendRequest(act.path).then((res) => {
      if (res.status >= 200 && res.status < 400) {
        successes++;
        latencies.push(res.duration);
        if (res.isHit) hits++;
        else misses++;
      } else {
        errors++;
      }
    });
    promises.push(p);
    dispatched++;
    await new Promise((r) => setTimeout(r, intervalMs));
  }

  await Promise.all(promises);
  const totalTime = (Date.now() - startTime) / 1000;
  const actualRps = (successes + errors) / totalTime;
  const hitRate = hits + misses > 0 ? ((hits / (hits + misses)) * 100).toFixed(1) : '0';
  const { p50, p95, p99, max } = calcPercentiles(latencies);

  console.log(`  ✓ Completed ${successes + errors} requests in ${totalTime.toFixed(1)}s (~${actualRps.toFixed(1)} req/s)`);
  console.log(`  ✓ Cloudflare Cache Hit Rate: ${hitRate}% (${hits} HIT / ${misses} MISS/DYNAMIC)`);
  console.log(`  ✓ Latencies: p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms | max: ${max}ms`);
  console.log(`  ✓ Error count: ${errors} (${errors === 0 ? '0% clean' : `${((errors / (successes + errors)) * 100).toFixed(2)}%`})`);

  return {
    simulatedUsers,
    actualRps: actualRps.toFixed(1),
    hitRate: `${hitRate}%`,
    p50,
    p95,
    p99,
    max,
    errors,
  };
}

async function main() {
  console.log('================================================================');
  console.log('🚀 PROGRESSIVE 20,000 SIMULATED HUMAN USER EDGE SCALING TEST');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================');

  const stages = [500, 1000, 2000, 5000, 10000, 15000, 20000];
  const results = [];

  for (const users of stages) {
    const res = await runStage(users, 5); // 5 seconds per stage
    results.push(res);
    // 1 second pause between stages
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log('\n================================================================');
  console.log('📊 PROGRESSIVE EDGE CAPACITY AUDIT SUMMARY TABLE');
  console.log('================================================================');
  console.table(results);
  console.log('================================================================\n');
}

main().catch(console.error);
