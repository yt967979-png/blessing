/**
 * Concurrency Benchmark with Live VPS Telemetry Sampling
 * Samples both Node processes (PIDs, CPU%, RSS, Core) during 100, 150, 200, and 300 concurrency.
 */
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const { URL } = require('url');

const targetBaseUrl = 'https://blessingpowerguide.in';
const sshKeyPath = 'C:\\Users\\yoges\\Downloads\\LightsailDefaultKey-ap-southeast-1.pem';
const sshHost = 'ubuntu@18.139.220.64';

const agent = new https.Agent({
  keepAlive: true,
  maxSockets: 600,
  maxFreeSockets: 100,
  timeout: 12000,
});

const actionPool = [
  { weight: 25, path: '/', name: 'Home' },
  { weight: 30, path: '/products', name: 'Products' },
  { weight: 15, path: '/api/products', name: 'API Products' },
  { weight: 15, path: '/search?q=maths', name: 'Search' },
  { weight: 10, path: '/cart', name: 'Cart' },
  { weight: 5, path: '/api/ready', name: 'Ready' },
];

const weighted = [];
for (const a of actionPool) {
  for (let i = 0; i < a.weight; i++) weighted.push(a.path);
}

function getRandomPath() {
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function makeRequest(path, cacheBust = false) {
  return new Promise((resolve) => {
    let full = path;
    if (cacheBust) {
      const sep = full.includes('?') ? '&' : '?';
      full += `${sep}_cb=${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }
    const url = new URL(full, targetBaseUrl);
    const start = Date.now();
    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 BPG-Investigator/1.0',
          'Accept': '*/*',
        },
        timeout: 10000,
      },
      (res) => {
        let len = 0;
        const upstream = res.headers['x-proxy-upstream'] || 'unknown';
        res.on('data', (c) => (len += c.length));
        res.on('end', () => resolve({ ms: Date.now() - start, status: res.statusCode, upstream }));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve({ ms: Date.now() - start, status: 408, upstream: 'timeout' });
    });
    req.on('error', (err) => resolve({ ms: Date.now() - start, status: 599, upstream: 'error' }));
    req.end();
  });
}

function sampleVpsTelemetry() {
  try {
    const cmd = `ssh -i "${sshKeyPath}" -o StrictHostKeyChecking=no ${sshHost} "/home/ubuntu/capture_telemetry.sh"`;
    return execSync(cmd, { encoding: 'utf8', timeout: 8000 });
  } catch (err) {
    return `SSH telemetry error: ${err.message}`;
  }
}

async function runTier(concurrency, durationSec = 12) {
  console.log(`\n==================================================`);
  console.log(`🚀 RUNNING TIER: ${concurrency} CONCURRENT USERS (${durationSec}s)`);
  console.log(`==================================================`);

  const endTime = Date.now() + durationSec * 1000;
  const latencies = [];
  const upstreamCounts = { '127.0.0.1:3000': 0, '127.0.0.1:3001': 0, other: 0 };
  let count2xx = 0;
  let count5xx = 0;
  let countTimeout = 0;

  let telemetrySample = '';
  let sampled = false;

  async function worker() {
    while (Date.now() < endTime) {
      const p = getRandomPath();
      const res = await makeRequest(p, false);
      latencies.push(res.ms);
      if (res.status >= 200 && res.status < 400) count2xx++;
      else if (res.status >= 500) count5xx++;
      else if (res.status === 408) countTimeout++;

      if (res.upstream.includes('3000')) upstreamCounts['127.0.0.1:3000']++;
      else if (res.upstream.includes('3001')) upstreamCounts['127.0.0.1:3001']++;
      else upstreamCounts.other++;

      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 30) + 10));
    }
  }

  // Trigger telemetry sampling at mid-run
  setTimeout(() => {
    if (!sampled) {
      sampled = true;
      console.log(`[Mid-run] Sampling live VPS telemetry via SSH...`);
      telemetrySample = sampleVpsTelemetry();
    }
  }, 4000);

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const total = latencies.length;
  const rps = (total / durationSec).toFixed(1);

  console.log(`--- TIER ${concurrency} BENCHMARK RESULTS ---`);
  console.log(`Total Requests: ${total} | RPS: ${rps}`);
  console.log(`p50: ${p50}ms | p95: ${p95}ms | p99: ${p99}ms`);
  console.log(`HTTP 2xx: ${count2xx} | HTTP 5xx: ${count5xx} | Timeouts: ${countTimeout}`);
  console.log(`Upstream Distribution: 3000 -> ${upstreamCounts['127.0.0.1:3000']} | 3001 -> ${upstreamCounts['127.0.0.1:3001']}`);

  console.log(`\n--- LIVE VPS TELEMETRY DURING TIER ${concurrency} ---`);
  console.log(telemetrySample);

  return { concurrency, rps, p50, p95, p99, count5xx, upstreamCounts, telemetrySample };
}

async function main() {
  console.log('================================================================');
  console.log('🔬 DUAL-WORKER & CONCURRENCY INVESTIGATION BENCHMARK');
  console.log(`Target: ${targetBaseUrl}`);
  console.log('================================================================');

  const tiers = [100, 150, 200, 300];
  const results = [];

  for (const t of tiers) {
    const r = await runTier(t, 10);
    results.push(r);
    console.log(`Cooling down 3 seconds...`);
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log('\n================================================================');
  console.log('🏁 INVESTIGATION COMPLETED');
  console.log('================================================================');
}

main().catch(console.error);
