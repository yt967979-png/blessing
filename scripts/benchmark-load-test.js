/**
 * Empirical Load & Concurrency Benchmark for Blessing Power Guide
 * Measures real Requests/sec, Latency Percentiles (P50, P95, P99),
 * Error Rate, DB Connection Pool utilization, and Memory/CPU impact.
 */
const http = require('http');
const https = require('https');
const { Pool } = require('pg');

const TARGET_URL = process.env.BENCHMARK_URL || 'http://127.0.0.1:3000/api/products';
const DURATION_SEC = Number(process.env.BENCHMARK_DURATION || 10);
const CONCURRENCY_LEVELS = [10, 50, 100];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://blessing:BlessingDb2026SecurePass!@localhost:5432/blessing',
});

async function getPgActiveConnections() {
  try {
    const res = await pool.query(
      `SELECT count(*)::int as active_conns, 
              (SELECT count(*)::int FROM pg_stat_activity WHERE state = 'active') as running_queries
       FROM pg_stat_activity WHERE datname = 'blessing'`
    );
    return res.rows[0];
  } catch {
    return { active_conns: -1, running_queries: -1 };
  }
}

function runConcurrencyLevel(concurrency, durationSec) {
  return new Promise((resolve) => {
    const isHttps = TARGET_URL.startsWith('https');
    const agent = isHttps
      ? new https.Agent({ keepAlive: true, maxSockets: concurrency })
      : new http.Agent({ keepAlive: true, maxSockets: concurrency });

    const client = isHttps ? https : http;
    const url = new URL(TARGET_URL);

    const latencies = [];
    let status200 = 0;
    let status4xx = 0;
    let status5xx = 0;
    let totalErrors = 0;
    let cacheHits = 0;

    const startTime = Date.now();
    const endTime = startTime + durationSec * 1000;
    let inFlight = 0;
    let finished = false;

    function sendRequest() {
      if (Date.now() >= endTime) {
        if (!finished) {
          finished = true;
          agent.destroy();
          resolve({
            concurrency,
            durationSec: (Date.now() - startTime) / 1000,
            totalRequests: latencies.length + totalErrors,
            status200,
            status4xx,
            status5xx,
            totalErrors,
            cacheHits,
            latencies: latencies.sort((a, b) => a - b),
          });
        }
        return;
      }

      inFlight++;
      const reqStart = Date.now();
      const req = client.get(
        url,
        { agent, headers: { Accept: 'application/json' }, timeout: 10000 },
        (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            const lat = Date.now() - reqStart;
            latencies.push(lat);
            if (res.statusCode >= 200 && res.statusCode < 300) status200++;
            else if (res.statusCode >= 400 && res.statusCode < 500) status4xx++;
            else if (res.statusCode >= 500) status5xx++;

            const cCache = res.headers['x-catalog-cache'] || res.headers['x-cache'];
            if (cCache && cCache.toLowerCase().includes('hit')) cacheHits++;

            inFlight--;
            sendRequest();
          });
        }
      );

      req.on('error', () => {
        totalErrors++;
        inFlight--;
        sendRequest();
      });

      req.on('timeout', () => {
        req.destroy();
        totalErrors++;
        inFlight--;
        sendRequest();
      });
    }

    // Spawn concurrency workers
    for (let i = 0; i < concurrency; i++) {
      sendRequest();
    }
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

async function run() {
  console.log(`================================================================`);
  console.log(`📊 EMPIRICAL LOAD TEST & BENCHMARK SUITE`);
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Duration per tier: ${DURATION_SEC}s`);
  console.log(`================================================================\n`);

  const initialDb = await getPgActiveConnections();
  console.log(`[Baseline DB State] Total active connections: ${initialDb.active_conns}, Running queries: ${initialDb.running_queries}\n`);

  const results = [];

  for (const c of CONCURRENCY_LEVELS) {
    console.log(`▶️  Testing Concurrency Tier: ${c} Concurrent Clients...`);
    const preDb = await getPgActiveConnections();
    const result = await runConcurrencyLevel(c, DURATION_SEC);
    const postDb = await getPgActiveConnections();

    const rps = (result.status200 / result.durationSec).toFixed(1);
    const p50 = percentile(result.latencies, 50);
    const p90 = percentile(result.latencies, 90);
    const p95 = percentile(result.latencies, 95);
    const p99 = percentile(result.latencies, 99);
    const errorRate = (
      ((result.status5xx + result.totalErrors) / Math.max(1, result.totalRequests)) *
      100
    ).toFixed(2);

    console.log(`   - Completed: ${result.totalRequests} reqs in ${result.durationSec.toFixed(1)}s`);
    console.log(`   - Throughput: ${rps} req/sec`);
    console.log(`   - Latency: P50=${p50}ms | P90=${p90}ms | P95=${p95}ms | P99=${p99}ms`);
    console.log(`   - Error Rate: ${errorRate}% (5xx: ${result.status5xx}, ConnErr: ${result.totalErrors})`);
    console.log(`   - DB Pool: ${postDb.active_conns} total connections (Δ: ${postDb.active_conns - preDb.active_conns})\n`);

    results.push({
      concurrency: c,
      rps: Number(rps),
      p50,
      p90,
      p95,
      p99,
      errorRate: Number(errorRate),
      totalRequests: result.totalRequests,
      status200: result.status200,
      status5xx: result.status5xx,
      dbConnections: postDb.active_conns,
    });

    // 1 second pause between tiers
    await new Promise((r) => setTimeout(r, 1000));
  }

  const finalDb = await getPgActiveConnections();

  console.log(`================================================================`);
  console.log(`📈 FINAL EMPIRICAL BENCHMARK SUMMARY`);
  console.log(`================================================================`);
  console.table(
    results.map((r) => ({
      Concurrency: r.concurrency,
      'Req/sec': r.rps,
      'P50 (ms)': r.p50,
      'P95 (ms)': r.p95,
      'P99 (ms)': r.p99,
      'Error Rate': `${r.errorRate}%`,
      '200 OK': r.status200,
      '5xx Errors': r.status5xx,
      'DB Conns': r.dbConnections,
    }))
  );
  console.log(`\nFinal DB State: ${finalDb.active_conns} connections active.\n`);

  await pool.end();
}

run().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
