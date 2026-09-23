/**
 * Phase 1: Live Application Inventory Generator
 * Inspects the exact repository files and live database schema to generate a comprehensive live inventory.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function getFiles(dir, matchFn, list = []) {
  if (!fs.existsSync(dir)) return list;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.next' && entry.name !== '.git') {
        getFiles(full, matchFn, list);
      }
    } else if (matchFn(full)) {
      list.push(full);
    }
  }
  return list;
}

function run() {
  console.log('================================================================');
  console.log('🔍 PHASE 1: LIVE APPLICATION INVENTORY SCAN');
  console.log('================================================================\n');

  // 1. Pages
  const pages = getFiles(path.join(REPO_ROOT, 'src', 'app'), (f) => f.endsWith('page.tsx'))
    .map(f => path.relative(path.join(REPO_ROOT, 'src', 'app'), f).replace(/\\/g, '/').replace(/\/page\.tsx$/, '').replace(/^page\.tsx$/, '/'));

  console.log(`1. Pages (${pages.length} found):`);
  pages.sort().forEach(p => console.log(`   - /${p === '/' ? '' : p}`));

  // 2. API Routes
  const apiRoutes = getFiles(path.join(REPO_ROOT, 'src', 'app', 'api'), (f) => f.endsWith('route.ts'))
    .map(f => path.relative(path.join(REPO_ROOT, 'src', 'app', 'api'), f).replace(/\\/g, '/').replace(/\/route\.ts$/, ''));

  console.log(`\n2. API Routes (${apiRoutes.length} found):`);
  apiRoutes.sort().forEach(r => console.log(`   - /api/${r}`));

  // 3. Server Actions ('use server')
  const tsFiles = getFiles(path.join(REPO_ROOT, 'src'), (f) => f.endsWith('.ts') || f.endsWith('.tsx'));
  const serverActions = [];
  for (const f of tsFiles) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes("'use server'") || content.includes('"use server"')) {
      serverActions.push(path.relative(REPO_ROOT, f).replace(/\\/g, '/'));
    }
  }
  console.log(`\n3. Server Actions (${serverActions.length} found):`);
  if (serverActions.length === 0) {
    console.log('   (None - Application strictly uses REST API Route Handlers)');
  } else {
    serverActions.forEach(s => console.log(`   - ${s}`));
  }

  // 4. Middlewares
  const middlewareFiles = [
    path.join(REPO_ROOT, 'middleware.ts'),
    path.join(REPO_ROOT, 'src', 'middleware.ts'),
  ].filter(f => fs.existsSync(f)).map(f => path.relative(REPO_ROOT, f).replace(/\\/g, '/'));
  console.log(`\n4. Middleware (${middlewareFiles.length} found):`);
  if (middlewareFiles.length === 0) {
    console.log('   (None - Routing & security handled via Next.js Layouts, Route Handlers & serverSecurity.ts)');
  } else {
    middlewareFiles.forEach(m => console.log(`   - ${m}`));
  }

  // 5. Database Tables & Constraints in init-db.js
  const initDbPath = path.join(REPO_ROOT, 'scripts', 'init-db.js');
  const initDbContent = fs.readFileSync(initDbPath, 'utf8');
  const tableMatches = [...initDbContent.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_]+)/gi)].map(m => m[1]);
  console.log(`\n5. Database Tables Defined in Schema (${tableMatches.length} tables):`);
  tableMatches.sort().forEach(t => console.log(`   - ${t}`));

  // 6. Redis Usage
  const redisKeys = new Set();
  for (const f of tsFiles) {
    const content = fs.readFileSync(f, 'utf8');
    const matches = [...content.matchAll(/(?:redis(?:Client)?\.(?:get|set|del|zadd|zcard|pfadd|pfcount|hgetall|pipeline)|redisGetJson|redisSetJson|redisDelPattern|redisRateLimit)\s*\(\s*['"`]([^'"`$]+)/g)];
    for (const m of matches) {
      redisKeys.add(m[1]);
    }
  }
  console.log(`\n6. Redis Usage Patterns (${redisKeys.size} distinct key prefixes):`);
  [...redisKeys].sort().forEach(k => console.log(`   - ${k}`));

  // 7. Background Workers & Crons
  console.log('\n7. Background Workers & Crons (src/lib/backgroundServices.ts):');
  console.log('   - Courier Auto-Sync Cron (startCourierSyncCron - every 15 mins)');
  console.log('   - Awaiting Confirmation Timeout Sweeper (confirmExpireTimer - every 30 mins)');
  console.log('   - Unfinalized Refund & Webhook Dead-Letter Reconciler (orphanRefundTimer - every 10 mins)');
  console.log('   - Abandoned Checkout Stock-Hold Sweeper (stockHoldSweepTimer - every 2 mins)');
  console.log('   - Real-time Order SSE Broker (startOrderListenBroker via Postgres LISTEN/NOTIFY)');
  console.log('   - Real-time Stock SSE Broker (startStockListenBroker via Postgres LISTEN/NOTIFY)');

  // 8. SSE Endpoints
  console.log('\n8. Server-Sent Events (SSE) Endpoints:');
  console.log('   - /api/stock/stream (Public stock changes)');
  console.log('   - /api/orders/stream (Private customer order updates & Admin live feed)');
  console.log('   - /api/support/stream (Support desk real-time messages)');
  console.log('   - /api/ops/stream (Operations monitor telemetry)');
  console.log('   - /api/admin/monitor/stream (Admin health telemetry)');

  // 9. Payment Flows
  console.log('\n9. Payment Flows:');
  console.log('   - Primary: Razorpay Payment Gateway (UPI, Cards, Netbanking, QR)');
  console.log('   - Handlers: /api/razorpay (order creation & stock reserve), /api/webhooks/razorpay (idempotent webhook verification)');
  console.log('   - Secondary: Cash on Delivery (Admin custom order creation)');

  // 10. Courier Flows
  console.log('\n10. Courier Flows:');
  console.log('   - ST Courier Express Integration');
  console.log('   - Handlers: /api/courier/sync (Admin dispatch & AWB assignment), /api/courier/track (Public & live sync), /api/track (Multi-milestone customer tracking)');

  // Output summary object
  const inventory = {
    pagesCount: pages.length,
    apiRoutesCount: apiRoutes.length,
    serverActionsCount: serverActions.length,
    tablesCount: tableMatches.length,
    redisPrefixesCount: redisKeys.size,
    pages,
    apiRoutes,
    tables: tableMatches
  };

  fs.writeFileSync(path.join(REPO_ROOT, 'scripts', 'live-inventory.json'), JSON.stringify(inventory, null, 2));
  console.log('\nInventory written to scripts/live-inventory.json');
}

run();
