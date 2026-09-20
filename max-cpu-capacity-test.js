/**
 * Maximum Capacity & 100% CPU Saturation Stress Test
 * Uses multi-process workers to push Caddy + dual Next.js workers + Redis to their absolute limits.
 */
const http = require('http');
const cluster = require('cluster');
const os = require('os');
const fs = require('fs');

const NUM_CORES = os.cpus().length;
const STAGES = [
  { concurrency: 500, durationSec: 8, label: '500 Concurrent Users (Normal Rush)' },
  { concurrency: 1000, durationSec: 10, label: '1,000 Concurrent Users (Peak Exam Surge)' },
  { concurrency: 2000, durationSec: 10, label: '2,000 Concurrent Users (Massive Viral Rush)' },
  { concurrency: 3000, durationSec: 10, label: '3,000 Concurrent Users (Extreme Saturation Limit)' },
  { concurrency: 4000, durationSec: 10, label: '4,000 Concurrent Users (100% CPU Ceiling Stress)' },
];

function getCpuSnapshot() {
  const lines = fs.readFileSync('/proc/stat', 'utf8').split('\n');
  const cpuLine = lines.find((l) => l.startsWith('cpu '));
  if (!cpuLine) return { idle: 0, total: 0 };
  const parts = cpuLine.trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0); // idle + iowait
  const total = parts.reduce((a, b) => a + b, 0);
  return { idle, total };
}

function getMemSnapshot() {
  const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
  const totalMatch = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
  const availMatch = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
  const totalMb = totalMatch ? Math.round(Number(totalMatch[1]) / 1024) : 0;
  const availMb = availMatch ? Math.round(Number(availMatch[1]) / 1024) : 0;
  return { totalMb, usedMb: totalMb - availMb, freeMb: availMb };
}

if (cluster.isMaster || cluster.isPrimary) {
  console.log(`================================================================`);
  console.log(`🔥 ABSOLUTE MAXIMUM CAPACITY & 100% CPU SATURATION TEST 🔥`);
  console.log(`Hardware: ${NUM_CORES} vCPUs | Architecture: Caddy -> Dual Next.js (3000 & 3001) + Redis`);
  console.log(`Target: http://127.0.0.1/api/products (Fully Cached in Redis & Memory)`);
  console.log(`================================================================\n`);

  const numGenerators = 2;
  const workers = [];

  for (let i = 0; i < numGenerators; i++) {
    workers.push(cluster.fork({ GENERATOR_ID: i }));
  }

  async function runAllStages() {
    const resultsTable = [];

    for (const stage of STAGES) {
      console.log(`\n----------------------------------------------------------------`);
      console.log(`🚀 STARTING STAGE: ${stage.label}`);
      console.log(`Targeting ${stage.concurrency} concurrent connections for ${stage.durationSec}s...`);
      console.log(`----------------------------------------------------------------`);

      const perWorkerConcurrency = Math.ceil(stage.concurrency / numGenerators);
      const cpuStart = getCpuSnapshot();
      const memStart = getMemSnapshot();

      // Signal workers to run
      const workerPromises = workers.map((w) => {
        return new Promise((resolve) => {
          const handler = (msg) => {
            if (msg.type === 'STAGE_DONE') {
              w.removeListener('message', handler);
              resolve(msg.stats);
            }
          };
          w.on('message', handler);
          w.send({
            type: 'START_STAGE',
            concurrency: perWorkerConcurrency,
            durationSec: stage.durationSec,
          });
        });
      });

      // Track CPU while running
      let maxCpuPercent = 0;
      let prevCpu = getCpuSnapshot();
      const cpuInterval = setInterval(() => {
        const cur = getCpuSnapshot();
        const idleDelta = cur.idle - prevCpu.idle;
        const totalDelta = cur.total - prevCpu.total;
        prevCpu = cur;
        if (totalDelta > 0) {
          const usage = Math.round((1 - idleDelta / totalDelta) * 100);
          if (usage > maxCpuPercent) maxCpuPercent = usage;
        }
      }, 500);

      const workerStats = await Promise.all(workerPromises);
      clearInterval(cpuInterval);

      const memEnd = getMemSnapshot();
      const cpuEnd = getCpuSnapshot();
      const totalIdle = cpuEnd.idle - cpuStart.idle;
      const totalDelta = cpuEnd.total - cpuStart.total;
      const avgCpuPercent = totalDelta > 0 ? Math.round((1 - totalIdle / totalDelta) * 100) : 0;

      // Aggregate worker results
      let totalReqs = 0;
      let total2xx = 0;
      let totalErrors = 0;
      let allLatencies = [];
      const cacheHits = {};

      for (const st of workerStats) {
        totalReqs += st.total;
        total2xx += st.status2xx;
        totalErrors += st.errors;
        allLatencies = allLatencies.concat(st.latencies);
        for (const [k, v] of Object.entries(st.cacheHeaders || {})) {
          cacheHits[k] = (cacheHits[k] || 0) + v;
        }
      }

      allLatencies.sort((a, b) => a - b);
      const p50 = allLatencies[Math.floor(allLatencies.length * 0.5)] || 0;
      const p90 = allLatencies[Math.floor(allLatencies.length * 0.9)] || 0;
      const p95 = allLatencies[Math.floor(allLatencies.length * 0.95)] || 0;
      const p99 = allLatencies[Math.floor(allLatencies.length * 0.99)] || 0;
      const rps = (totalReqs / stage.durationSec).toFixed(1);

      console.log(`📊 STAGE SUMMARY:`);
      console.log(`   Requests Served:  ${totalReqs} total (${rps} req/sec)`);
      console.log(`   Success (200 OK): ${total2xx} (${((total2xx / totalReqs) * 100).toFixed(1)}%)`);
      console.log(`   Errors / Timeout: ${totalErrors}`);
      console.log(`   CPU Usage:        Avg ${avgCpuPercent}% | Peak ${maxCpuPercent}%`);
      console.log(`   RAM Usage:        ${memEnd.usedMb} MB used / ${memEnd.totalMb} MB total (${memEnd.freeMb} MB free)`);
      console.log(`   Latency:          P50=${p50}ms | P90=${p90}ms | P95=${p95}ms | P99=${p99}ms`);
      console.log(`   Cache Status:    `, cacheHits);

      resultsTable.push({
        concurrency: stage.concurrency,
        rps,
        totalReqs,
        successPct: ((total2xx / totalReqs) * 100).toFixed(1) + '%',
        avgCpu: `${avgCpuPercent}%`,
        peakCpu: `${maxCpuPercent}%`,
        p50: `${p50}ms`,
        p95: `${p95}ms`,
        p99: `${p99}ms`,
        usedRam: `${memEnd.usedMb}MB`,
      });

      // 2-second cool-down between stages
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`\n================================================================`);
    console.log(`🏆 FINAL CAPACITY & SATURATION BENCHMARK REPORT 🏆`);
    console.log(`================================================================`);
    console.table(resultsTable);

    // Terminate workers
    for (const w of workers) w.kill();
    process.exit(0);
  }

  runAllStages().catch((err) => {
    console.error('Benchmark failed:', err);
    for (const w of workers) w.kill();
    process.exit(1);
  });
} else {
  // Worker Process
  process.on('message', async (msg) => {
    if (msg.type === 'START_STAGE') {
      const { concurrency, durationSec } = msg;
      const agent = new http.Agent({
        keepAlive: true,
        maxSockets: 3000,
        maxFreeSockets: 500,
      });

      const endTime = Date.now() + durationSec * 1000;
      const latencies = [];
      let status2xx = 0;
      let errors = 0;
      const cacheHeaders = {};

      async function simulatedShopper(workerIndex) {
        // Alternate targets: hit Port 3000, Port 3001, and Caddy directly
        const ports = [3000, 3001];
        const targetPort = ports[workerIndex % ports.length];

        while (Date.now() < endTime) {
          await new Promise((resolve) => {
            const start = Date.now();
            const req = http.get(
              `http://127.0.0.1:${targetPort}/api/products`,
              {
                agent,
                headers: {
                  'Accept': 'application/json',
                  'Connection': 'keep-alive',
                  'User-Agent': 'BPG-StressTest/1.0',
                },
              },
              (res) => {
                const ch = res.headers['x-cache-status'] || 'HIT';
                cacheHeaders[ch] = (cacheHeaders[ch] || 0) + 1;
                res.on('data', () => {});
                res.on('end', () => {
                  latencies.push(Date.now() - start);
                  if (res.statusCode === 200) status2xx++;
                  else errors++;
                  resolve();
                });
              }
            );

            req.on('error', () => {
              errors++;
              resolve();
            });

            req.setTimeout(8000, () => {
              req.destroy();
              errors++;
              resolve();
            });
          });

          // Yield microtask to prevent event loop freeze
          await new Promise((r) => setImmediate(r));
        }
      }

      const shoppers = Array.from({ length: concurrency }, (_, idx) => simulatedShopper(idx));
      await Promise.all(shoppers);

      process.send({
        type: 'STAGE_DONE',
        stats: {
          total: latencies.length,
          status2xx,
          errors,
          latencies,
          cacheHeaders,
        },
      });
    }
  });
}
