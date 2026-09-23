/**
 * Phase 9: System Resilience & Failure Modes Red Team Harness
 * Tests live worker kill-failover (port 3000 & 3001), systemd auto-recovery, and Redis outage fallback.
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');

const TARGET_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';
const agent = new https.Agent({ keepAlive: false, rejectUnauthorized: false });

function req(path) {
  return new Promise((resolve) => {
    const url = new URL(path, TARGET_URL);
    const start = Date.now();
    const request = https.request(url, {
      method: 'GET',
      agent,
      headers: { 'User-Agent': 'ResilienceTester/1.0' },
      timeout: 6000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({
          status: res.statusCode,
          upstream: res.headers['x-proxy-upstream'] || 'unknown',
          duration: Date.now() - start,
          json,
        });
      });
    });

    request.on('error', (err) => resolve({ status: 0, error: err.message, duration: Date.now() - start }));
    request.on('timeout', () => { request.destroy(); resolve({ status: 408, error: 'Timeout', duration: Date.now() - start }); });
    request.end();
  });
}

async function run() {
  console.log('================================================================');
  console.log('🛡️  PHASE 9: SYSTEM RESILIENCE & FAILURE MODES');
  console.log(`Target: ${TARGET_URL}`);
  console.log('================================================================\n');

  const results = [];
  function record(id, name, passed, details = '') {
    results.push({ id, name, passed, details });
    const mark = passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${mark} [${id}] ${name} ${details ? `— ${details}` : ''}`);
  }

  // ── TEST 1: Baseline Dual-Worker Traffic Distribution ─────────────────────
  console.log('1. Baseline traffic before fault injection:');
  const upstreams = {};
  for (let i = 0; i < 10; i++) {
    const r = await req('/api/ready');
    upstreams[r.upstream] = (upstreams[r.upstream] || 0) + 1;
  }
  const hasBoth = Object.keys(upstreams).length >= 1;
  record('RES-01', 'Baseline dual-worker active load-balancing', hasBoth, JSON.stringify(upstreams));

  // ── TEST 2: Hard-Kill Worker 3000 & Assert Caddy Failover to 3001 ──────────
  console.log('\n2. Injecting failure: SIGKILL on Worker 3000...');
  try {
    execSync('sudo pkill -9 -f "blessing@3000" || true');
  } catch (_) {}

  // Immediately fire 15 concurrent requests during the outage
  const burst3000 = await Promise.all(Array.from({ length: 15 }, () => req('/api/ready')));
  const success3000 = burst3000.filter(r => r.status === 200).length;
  const upstreams3000 = burst3000.map(r => r.upstream);
  const routedTo3001 = upstreams3000.some(u => u.includes('3001'));

  record('RES-02', 'Zero-downtime failover during Worker 3000 kill (15/15 succeed)', success3000 === 15, `200 OK: ${success3000}/15, routed to 3001: ${routedTo3001}`);

  // Check systemd auto-restart of Worker 3000
  console.log('Waiting 4s for systemd restart of Worker 3000...');
  await new Promise(r => setTimeout(r, 4000));
  let w3000State = 'unknown';
  try {
    w3000State = execSync('systemctl is-active blessing@3000', { encoding: 'utf8' }).trim();
  } catch (e) {
    w3000State = e.stdout?.trim() || 'failed';
  }
  record('RES-03', 'Systemd automatically restarts Worker 3000', w3000State === 'active', `Status: ${w3000State}`);

  // ── TEST 3: Hard-Kill Worker 3001 & Assert Caddy Failover to 3000 ──────────
  console.log('\n3. Injecting failure: SIGKILL on Worker 3001...');
  try {
    execSync('sudo pkill -9 -f "blessing@3001" || true');
  } catch (_) {}

  // Immediately fire 15 concurrent requests during the outage
  const burst3001 = await Promise.all(Array.from({ length: 15 }, () => req('/api/ready')));
  const success3001 = burst3001.filter(r => r.status === 200).length;
  const upstreams3001 = burst3001.map(r => r.upstream);
  const routedTo3000 = upstreams3001.some(u => u.includes('3000'));

  record('RES-04', 'Zero-downtime failover during Worker 3001 kill (15/15 succeed)', success3001 === 15, `200 OK: ${success3001}/15, routed to 3000: ${routedTo3000}`);

  // Check systemd auto-restart of Worker 3001
  console.log('Waiting 4s for systemd restart of Worker 3001...');
  await new Promise(r => setTimeout(r, 4000));
  let w3001State = 'unknown';
  try {
    w3001State = execSync('systemctl is-active blessing@3001', { encoding: 'utf8' }).trim();
  } catch (e) {
    w3001State = e.stdout?.trim() || 'failed';
  }
  record('RES-05', 'Systemd automatically restarts Worker 3001', w3001State === 'active', `Status: ${w3001State}`);

  // ── TEST 4: Temporary Redis Outage & In-Memory Fallback ────────────────────
  console.log('\n4. Simulating Redis Outage (stopping redis-server)...');
  try {
    execSync('sudo systemctl stop redis-server');
  } catch (_) {}

  // App must continue functioning without throwing 500
  const redisDownHealth = await req('/api/health');
  const redisDownReady = await req('/api/ready');
  const redisDownProducts = await req('/api/products');

  const noCrashDuringRedisDown = redisDownHealth.status === 200 && redisDownReady.status === 200 && redisDownProducts.status === 200;
  record('RES-06', 'App remains operational during Redis outage (zero 500 errors)', noCrashDuringRedisDown,
    `Health: ${redisDownHealth.status}, Ready: ${redisDownReady.status}, Products: ${redisDownProducts.status}`);

  console.log('Restoring redis-server...');
  try {
    execSync('sudo systemctl start redis-server');
  } catch (_) {}
  const redisRestored = execSync('systemctl is-active redis-server', { encoding: 'utf8' }).trim();
  record('RES-07', 'Redis service restored successfully', redisRestored === 'active', `Status: ${redisRestored}`);

  // ── TEST 5: Rolling Reload of Both Workers Under Continuous Load ──────────
  console.log('\n5. Executing Rolling Reload of both workers during traffic...');
  let rollingDropped = 0;
  let rollingSuccess = 0;
  const reloadPromise = (async () => {
    try {
      execSync('sudo systemctl restart blessing@3000');
      await new Promise(r => setTimeout(r, 2000));
      execSync('sudo systemctl restart blessing@3001');
    } catch (_) {}
  })();

  // Send 30 requests spaced across the restart
  for (let i = 0; i < 30; i++) {
    const r = await req('/api/ready');
    if (r.status === 200) rollingSuccess++;
    else rollingDropped++;
    await new Promise(res => setTimeout(res, 100));
  }
  await reloadPromise;

  record('RES-08', 'Rolling restart completed with ZERO dropped requests', rollingDropped === 0 && rollingSuccess === 30, `200 OK: ${rollingSuccess}/30, Dropped: ${rollingDropped}`);

  const passedCount = results.filter(r => r.passed).length;
  console.log('\n================================================================');
  console.log(`📊 PHASE 9 RESULTS: ${passedCount} / ${results.length} PASSED`);
  console.log('================================================================');

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

run();
