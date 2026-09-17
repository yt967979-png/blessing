/**
 * Local VPS Internal Concurrency Benchmark
 * Directly measures Next.js + Caddy + Postgres capacity inside the VPS (0 WAN jitter / 0 Cloudflare queueing).
 */
const http = require('http');

const port = process.argv[2] || 3000;
const concurrency = Number(process.argv[3]) || 100;
const durationSec = Number(process.argv[4]) || 5;

const agent = new http.Agent({
  keepAlive: true,
  maxSockets: 500,
  maxFreeSockets: 100,
});

async function run() {
  console.log(`Testing http://127.0.0.1:${port}/api/ready at ${concurrency} concurrency for ${durationSec}s...`);
  const endTime = Date.now() + durationSec * 1000;
  const latencies = [];
  let count2xx = 0;
  let countErr = 0;

  async function worker() {
    while (Date.now() < endTime) {
      await new Promise((resolve) => {
        const start = Date.now();
        const req = http.get(`http://127.0.0.1:${port}/api/ready`, { agent }, (res) => {
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
      // realistic 10ms CPU yield
      await new Promise((r) => setTimeout(r, 10));
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

  console.log(`Port ${port}: Total=${total} | RPS=${rps} | p50=${p50}ms | p95=${p95}ms | p99=${p99}ms | 2xx=${count2xx} | Errors=${countErr}`);
}

run().catch(console.error);
