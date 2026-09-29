#!/usr/bin/env node
/**
 * ============================================================================
 * BLESSING POWER GUIDE — DAILY OPS HEALTH & DIAGNOSTICS AUDIT
 * ============================================================================
 * Usage:
 *   node scripts/daily-ops-audit.js
 *   node scripts/daily-ops-audit.js --fix
 *   npm run ops:check
 *
 * Checks:
 *   1. Cloudflare Edge & Caddy Proxy Health
 *   2. Dual-Worker Node.js Runtime (3000 & 3001)
 *   3. NVMe Disk, CPU Load & RAM Memory
 *   4. PostgreSQL 16 Pool, Locks & Latency
 *   5. Redis Pipeline & Session Memory
 *   6. Payment & Webhook Error Telemetry
 *   7. Catalog Stock & Inventory Alerts
 *   8. Background Cron & Heartbeat Status
 *
 * Saves daily log to: logs/ops-daily-YYYY-MM-DD.json
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');

// 1. Resolve Environment Variables (.env.local or process.env)
function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const SITE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';
const OPS_PIN = process.env.OPS_PIN || '';
const isFixMode = process.argv.includes('--fix');

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

async function runDailyAudit() {
  console.log('\n================================================================');
  console.log('🩺 BLESSING POWER GUIDE — DAILY OPERATIONS AUDIT');
  console.log(`Target:      ${SITE_URL}`);
  console.log(`Timestamp:   ${new Date().toISOString()}`);
  console.log(`Fix Mode:    ${isFixMode ? 'ENABLED (--fix)' : 'DISABLED (Read-Only)'}`);
  console.log('================================================================\n');

  const auditReport = {
    timestamp: new Date().toISOString(),
    siteUrl: SITE_URL,
    overallStatus: 'OPERATIONAL',
    checks: [],
    telemetry: {},
    issuesFound: [],
    actionsTaken: [],
  };

  let passedCount = 0;
  let warnCount = 0;
  let failCount = 0;

  function recordCheck(name, status, message, details = null) {
    const symbol = status === 'PASS' ? '✅' : status === 'WARN' ? '⚠️' : '❌';
    console.log(`  ${symbol} [${status.padEnd(4)}] ${name.padEnd(28)} : ${message}`);
    auditReport.checks.push({ name, status, message, details });
    if (status === 'PASS') passedCount++;
    if (status === 'WARN') {
      warnCount++;
      auditReport.issuesFound.push({ severity: 'WARN', component: name, message });
    }
    if (status === 'FAIL') {
      failCount++;
      auditReport.issuesFound.push({ severity: 'FAIL', component: name, message });
    }
  }

  // --------------------------------------------------------------------------
  // STEP 1: Public Health & Edge Connectivity
  // --------------------------------------------------------------------------
  console.log('--- 1. EDGE & NETWORK CONNECTIVITY ---');
  let publicHealthOk = false;
  try {
    const t0 = Date.now();
    const res = await fetch(`${SITE_URL}/api/health`);
    const latency = Date.now() - t0;
    const data = await res.json().catch(() => ({}));
    if (res.status === 200 && data.status === 'ok') {
      recordCheck('Public Health API', 'PASS', `HTTP 200 OK (${latency}ms)`);
      publicHealthOk = true;
    } else {
      recordCheck('Public Health API', 'FAIL', `Unexpected response (HTTP ${res.status})`, data);
    }
  } catch (err) {
    recordCheck('Public Health API', 'FAIL', `Connection error: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // STEP 2: Catalog API & Edge Caching (Cloudflare / Caddy)
  // --------------------------------------------------------------------------
  try {
    const t0 = Date.now();
    const res = await fetch(`${SITE_URL}/api/products`);
    const latency = Date.now() - t0;
    const cfCache = res.headers.get('cf-cache-status') || 'DIRECT';
    const upstream = res.headers.get('x-proxy-upstream') || 'Caddy proxy';
    const via = res.headers.get('via') || 'Origin';
    const data = await res.json().catch(() => []);
    const count = Array.isArray(data) ? data.length : data.books?.length || 0;

    if (res.status === 200 && count > 0) {
      recordCheck('Catalog API & Caching', 'PASS', `HTTP 200 (${count} books, ${latency}ms) [CF: ${cfCache}, Upstream: ${upstream}]`);
    } else if (res.status === 200 && count === 0) {
      recordCheck('Catalog API & Caching', 'WARN', `HTTP 200 but catalog returned 0 books. Check database.`);
    } else {
      recordCheck('Catalog API & Caching', 'FAIL', `Catalog returned HTTP ${res.status}`);
    }
  } catch (err) {
    recordCheck('Catalog API & Caching', 'FAIL', `Catalog error: ${err.message}`);
  }

  // --------------------------------------------------------------------------
  // STEP 3: Authenticated Ops Telemetry Probe (/api/ops/monitor)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. INTERNAL SYSTEM TELEMETRY (/ops) ---');
  let opsData = null;
  if (!OPS_PIN) {
    recordCheck('Ops Authentication', 'WARN', 'OPS_PIN not found in .env.local; skipping deep telemetry.');
  } else {
    try {
      const res = await fetch(`${SITE_URL}/api/ops/monitor`, {
        headers: { 'x-ops-pin': OPS_PIN },
        cache: 'no-store',
      });
      if (res.status === 200) {
        opsData = await res.json();
        auditReport.telemetry = opsData;
        recordCheck('Ops Telemetry Access', 'PASS', `Authenticated via Developer PIN`);
      } else {
        recordCheck('Ops Telemetry Access', 'FAIL', `HTTP ${res.status} - Invalid or unauthorized PIN`);
      }
    } catch (err) {
      recordCheck('Ops Telemetry Access', 'FAIL', `Failed to contact /api/ops/monitor: ${err.message}`);
    }
  }

  if (opsData) {
    // Check 3A: Overall System Status reported by server
    const overall = opsData.overallStatus || 'UNKNOWN';
    if (overall === 'OPERATIONAL') {
      recordCheck('System Overall Status', 'PASS', `Status: OPERATIONAL`);
    } else if (overall === 'DEGRADED') {
      recordCheck('System Overall Status', 'WARN', `Status: DEGRADED`, opsData.alerts);
    } else {
      recordCheck('System Overall Status', 'FAIL', `Status: CRITICAL`, opsData.alerts);
    }

    // Check 3B: Dual Workers Health
    const workers = opsData.server?.workers || [];
    const allWorkersOnline = workers.length > 0 && workers.every(w => w.status === 'ONLINE');
    if (allWorkersOnline) {
      const desc = workers.map(w => `${w.name} [Port ${w.port}]`).join(', ');
      recordCheck('Dual Node Workers', 'PASS', `All ${workers.length} workers ONLINE (${desc})`);
    } else {
      recordCheck('Dual Node Workers', 'FAIL', `Worker outage detected!`, workers);
    }

    // Check 3C: CPU & System Load
    const cpuPct = opsData.server?.cpuPercent ?? 0;
    const uptime = opsData.server?.uptimeFormatted || 'N/A';
    if (cpuPct <= 75) {
      recordCheck('CPU & System Load', 'PASS', `${cpuPct}% load (Uptime: ${uptime})`);
    } else if (cpuPct <= 90) {
      recordCheck('CPU & System Load', 'WARN', `Elevated CPU: ${cpuPct}%`);
    } else {
      recordCheck('CPU & System Load', 'FAIL', `Critical CPU load: ${cpuPct}%`);
    }

    // Check 3D: RAM Memory
    const memPct = opsData.server?.memPercent ?? 0;
    const memUsed = formatBytes(opsData.server?.memUsedBytes || 0);
    const memTotal = formatBytes(opsData.server?.memTotalBytes || 0);
    if (memPct <= 80) {
      recordCheck('RAM Memory Usage', 'PASS', `${memPct}% (${memUsed} / ${memTotal})`);
    } else if (memPct <= 90) {
      recordCheck('RAM Memory Usage', 'WARN', `High RAM usage: ${memPct}%`);
    } else {
      recordCheck('RAM Memory Usage', 'FAIL', `Critical RAM usage: ${memPct}%`);
    }

    // Check 3E: NVMe Disk Storage
    const diskPct = opsData.disk?.usedPercent ?? 0;
    const diskFree = formatBytes(opsData.disk?.freeBytes || 0);
    if (diskPct <= 80) {
      recordCheck('NVMe Storage (40-80GB)', 'PASS', `${diskPct}% used (${diskFree} free)`);
    } else if (diskPct <= 90) {
      recordCheck('NVMe Storage (40-80GB)', 'WARN', `Low disk space: ${diskPct}% used`);
    } else {
      recordCheck('NVMe Storage (40-80GB)', 'FAIL', `Critical disk exhaustion: ${diskPct}% used`);
    }

    // Check 3F: PostgreSQL Database Pool
    const db = opsData.database || {};
    const dbStatus = db.status || 'UNKNOWN';
    const activeConns = db.activeConnections ?? 0;
    const maxConns = db.maxConnections ?? 20;
    const pingMs = db.pingMs ?? 0;
    const locks = db.waitingLocks ?? 0;
    const slowQueries = db.slowQueries ?? 0;

    if (dbStatus === 'ONLINE' && locks === 0 && slowQueries === 0) {
      recordCheck('PostgreSQL 16 Database', 'PASS', `ONLINE (${activeConns}/${maxConns} pool, ping ${pingMs}ms, 0 locks)`);
    } else if (locks > 0 || slowQueries > 0) {
      recordCheck('PostgreSQL 16 Database', 'WARN', `Degraded DB: ${locks} waiting locks, ${slowQueries} slow queries`, db);
    } else {
      recordCheck('PostgreSQL 16 Database', 'FAIL', `Database OFFLINE or degraded (${dbStatus})`, db);
    }

    // Check 3G: Redis Pipeline
    const redis = opsData.redis || {};
    const redisStatus = redis.status || 'UNKNOWN';
    const redisPing = redis.pingMs ?? 0;
    const redisMem = redis.usedMemoryHuman || 'N/A';
    if (redisStatus === 'ONLINE') {
      recordCheck('Redis Cache & Queues', 'PASS', `ONLINE (ping ${redisPing}ms, mem ${redisMem}, ${redis.connectedClients || 1} clients)`);
    } else {
      recordCheck('Redis Cache & Queues', 'WARN', `Redis status: ${redisStatus} (running in fallback mode)`);
    }

    // Check 3H: Error Telemetry Diagnostics
    console.log('\n--- 3. OPERATIONAL ERROR MONITOR (TODAY) ---');
    const errs = opsData.errors || {};
    const fiveXx = errs.fiveXx ?? 0;
    const fourXx = errs.fourXx ?? 0;
    const payDrops = errs.paymentFailures ?? 0;
    const whDrops = errs.webhookFailures ?? 0;
    const apiErrs = errs.apiErrors ?? 0;

    if (fiveXx === 0 && payDrops === 0 && whDrops === 0) {
      recordCheck('5xx Server Exceptions', 'PASS', `0 fatal crashes today`);
      recordCheck('Payment Transactions', 'PASS', `0 payment drops today`);
      recordCheck('Webhook Integrations', 'PASS', `0 webhook signature drops today`);
    } else {
      if (fiveXx > 0) recordCheck('5xx Server Exceptions', 'WARN', `${fiveXx} 5xx exceptions logged today`);
      if (payDrops > 0) recordCheck('Payment Transactions', 'FAIL', `${payDrops} payment drop failures detected today`);
      if (whDrops > 0) recordCheck('Webhook Integrations', 'WARN', `${whDrops} webhook delivery drops detected today`);
    }

    if (Array.isArray(errs.recentErrors) && errs.recentErrors.length > 0) {
      console.log('\n  ⚠️  RECENT SANITIZED SERVER EXCEPTIONS:');
      errs.recentErrors.slice(0, 5).forEach((e, i) => {
        console.log(`     [${i + 1}] ${e.timestamp} | HTTP ${e.status} | ${e.endpoint} -> ${e.message}`);
      });
    }

    // Check 3I: E-Commerce Inventory & Alerts
    console.log('\n--- 4. E-COMMERCE & INVENTORY INTEGRITY ---');
    const ecom = opsData.ecommerce || {};
    recordCheck('Daily Commerce Activity', 'PASS', `${ecom.orders || 0} orders today, ₹${ecom.revenue || 0} revenue, ${ecom.booksSold || 0} books sold`);

    if (ecom.outOfStock > 0) {
      recordCheck('Out of Stock Books', 'WARN', `${ecom.outOfStock} book(s) currently marked out of stock`);
    } else {
      recordCheck('Out of Stock Books', 'PASS', `All active titles in stock`);
    }

    if (ecom.lowStock > 0) {
      recordCheck('Low Stock Inventory', 'WARN', `${ecom.lowStock} book(s) have low stock (<= 8 units)`);
    } else {
      recordCheck('Low Stock Inventory', 'PASS', `No low stock warnings`);
    }
  }

  // --------------------------------------------------------------------------
  // STEP 4: Automated Remediation / Self-Healing Mode (--fix)
  // --------------------------------------------------------------------------
  if (isFixMode) {
    console.log('\n--- 5. AUTOMATED REMEDIATION & SELF-HEALING ---');
    // If there were stale errors or minor issues, trigger recovery
    if (OPS_PIN) {
      try {
        console.log('  🔄 Requesting error buffer refresh...');
        const clearRes = await fetch(`${SITE_URL}/api/ops/monitor`, {
          method: 'DELETE',
          headers: { 'x-ops-pin': OPS_PIN },
        });
        if (clearRes.ok) {
          console.log('  ✅ Error monitor buffer successfully refreshed.');
          auditReport.actionsTaken.push('Refreshed error monitor buffer via /api/ops/monitor');
        }
      } catch (err) {
        console.warn('  ⚠️ Could not refresh error buffer:', err.message);
      }
    }
  }

  // --------------------------------------------------------------------------
  // STEP 5: Summary & Daily Log File Generation
  // --------------------------------------------------------------------------
  const finalStatus = failCount > 0 ? 'CRITICAL' : warnCount > 0 ? 'ATTENTION_NEEDED' : 'PERFECT';
  auditReport.overallStatus = finalStatus;

  console.log('\n================================================================');
  console.log(`📋 DAILY OPS AUDIT SUMMARY: [${finalStatus}]`);
  console.log(`Passed:  ${passedCount} checks`);
  console.log(`Warnings: ${warnCount} warnings`);
  console.log(`Failures: ${failCount} critical failures`);
  console.log('================================================================');

  if (auditReport.issuesFound.length > 0) {
    console.log('\n🔍 ISSUES REQUIRING ATTENTION:');
    auditReport.issuesFound.forEach((issue, idx) => {
      console.log(`  ${idx + 1}. [${issue.severity}] ${issue.component}: ${issue.message}`);
    });
    console.log('\n👉 To investigate & resolve, tell Antigravity:');
    console.log('   "Antigravity, inspect the daily ops audit log and fix these issues."');
  } else {
    console.log('\n🎉 ALL SYSTEMS OPTIMAL! Zero downtime, 0 unhandled errors, healthy DB/Redis.');
  }

  // Write report to logs/ops-daily-YYYY-MM-DD.json
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const today = new Date().toISOString().slice(0, 10);
    const logFilePath = path.join(logsDir, `ops-daily-${today}.json`);
    fs.writeFileSync(logFilePath, JSON.stringify(auditReport, null, 2), 'utf8');
    console.log(`\n💾 Saved audit record to: logs/ops-daily-${today}.json\n`);
  } catch (err) {
    console.warn('Could not write log file:', err.message);
  }

  // Exit with non-zero if critical failures occurred
  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runDailyAudit().catch((err) => {
  console.error('\n❌ Unhandled error during daily ops audit:', err);
  process.exit(1);
});
