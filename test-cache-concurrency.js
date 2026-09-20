/**
 * Comprehensive Caching & High-Concurrency Traffic Stress Test
 * Simulates real students browsing the catalog and home page simultaneously.
 */
const http = require('http');

async function testEndpoint(name, path, concurrency, durationSec) {
  console.log(`\n===============================================================`);
  console.log(`⚡ STRESS TEST: ${name}`);
  console.log(`Target: http://127.0.0.1:3000${path}`);
  console.log(`Concurrency: ${concurrency} simultaneous users | Duration: ${durationSec}s`);
  console.log(`===============================================================`);

  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 1000,
    maxFreeSockets: 200,
  });

  // Prime cache with 1 request
  await new Promise((resolve) => {
    http.get(`http://127.0.0.1:3000${path}`, { agent }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        console.log(`[Prime Cache] Status=${res.statusCode}, X-Cache-Status=${res.headers['x-cache-status'] || 'N/A'}, Size=${data.length} bytes`);
        resolve();
      });
    }).on('error', resolve);
  });

  const endTime = Date.now() + durationSec * 1000;
  const latencies = [];
  let count2xx = 0;
  let countErr = 0;
  const cacheHeaders = {};

  async function worker() {
    while (Date.now() < endTime) {
      await new Promise((resolve) => {
        const start = Date.now();
        const req = http.get(`http://127.0.0.1:3000${path}`, { agent }, (res) => {
          const cacheHeader = res.headers['x-cache-status'] || 'NONE';
          cacheHeaders[cacheHeader] = (cacheHeaders[cacheHeader] || 0) + 1;
          res.on('data', () => {});
          res.on('end', () => {
            latencies.push(Date.now() - start);
            if (res.statusCode === 200) count2xx++;
            else countErr++;
            resolve();
          });
        });
        req.on('error', () => {
          countErr++;
          resolve();
        });
      });
      // 5ms pacing between clicks
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const total = latencies.length;
  const rps = (total / durationSec).toFixed(1);

  console.log(`\n📊 RESULTS FOR ${name}:`);
  console.log(`  Total Requests Served: ${total}`);
  console.log(`  Throughput:            ${rps} req/sec`);
  console.log(`  Success (200 OK):      ${count2xx} (100% target)`);
  console.log(`  Errors / Dropped:      ${countErr}`);
  console.log(`  P50 Latency (Median):  ${p50} ms`);
  console.log(`  P95 Latency:           ${p95} ms`);
  console.log(`  P99 Latency:           ${p99} ms`);
  console.log(`  Cache Hits Breakdown: `, cacheHeaders);
  console.log(`===============================================================\n`);
}

async function main() {
  // Test 1: Products Catalog API (100 concurrent)
  await testEndpoint('Catalog API (/api/products)', '/api/products', 100, 5);

  // Test 2: Products Catalog API High Rush (250 concurrent)
  await testEndpoint('Catalog API High Rush (/api/products)', '/api/products', 250, 5);

  // Test 3: Filtered Catalog Search (Class 10 filter)
  await testEndpoint('Filtered Catalog (/api/products?cls=10th)', '/api/products?cls=10th', 100, 5);
}

main().catch(console.error);
