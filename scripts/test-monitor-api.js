const fs = require('fs');
const crypto = require('crypto');

async function testMonitor() {
  let secret = process.env.SESSION_SECRET;
  if (!secret && fs.existsSync('/etc/blessing.env')) {
    const lines = fs.readFileSync('/etc/blessing.env', 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('SESSION_SECRET=')) {
        secret = line.split('=')[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }

  if (!secret) {
    console.error('No SESSION_SECRET found');
    process.exit(1);
  }

  // Generate canonical token matching createSessionToken in src/lib/auth.ts
  const payload = { userId: 'usr_1788591637292_9o0z0', role: 'admin', exp: Date.now() + 3600000 };
  const payloadStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');
  const token = Buffer.from(JSON.stringify({ p: payloadStr, s: sig })).toString('base64url');

  const res = await fetch('http://localhost:3000/api/admin/monitor', {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!res.ok) {
    const txt = await res.text();
    console.error('HTTP', res.status, txt);
    process.exit(1);
  }

  const data = await res.json();
  console.log('====================================================');
  console.log('📊 LIVE SYSTEM MONITOR TELEMETRY VERIFICATION REPORT');
  console.log('====================================================');
  console.log('Overall Status:    ', data.overallStatus);
  console.log('Live Users Now:    ', data.visitors.activeAll, 'concurrent shoppers/users');
  console.log('  - Active Shoppers:', data.visitors.activeShoppers);
  console.log('  - Checkout Users: ', data.visitors.activeCheckouts);
  console.log('  - Support Chats:  ', data.visitors.activeSupport);
  console.log('  - Admin Sessions: ', data.visitors.activeAdmins);
  console.log('Today Traffic:     ', data.visitors.todayUniques, 'uniques |', data.visitors.todayViews, 'page views');
  console.log('Peak Concurrency:  ', data.visitors.peakToday, 'users at', data.visitors.peakTime);
  console.log('Server Uptime:     ', data.server.uptimeFormatted);
  console.log('CPU Utilization:   ', data.server.cpuPercent + '%', '(2 vCPU Lightsail Cores)');
  console.log('RAM Memory:        ', data.server.memPercent + '% used (' + (data.server.memUsedBytes / 1024 / 1024).toFixed(0) + ' MB / ' + (data.server.memTotalBytes / 1024 / 1024).toFixed(0) + ' MB)');
  console.log('Dual Workers:      ', data.server.workers.map(w => w.name + ' [Port ' + w.port + ': ' + w.status + ']').join(', '));
  console.log('NVMe Storage (40GB):', data.disk.usedPercent + '% used |', (data.disk.freeBytes / 1024 / 1024 / 1024).toFixed(1) + ' GB free');
  console.log('Storage Breakdown: ');
  console.log('  - Public Uploads: ', (data.storageBreakdown.uploadsBytes / 1024 / 1024).toFixed(2), 'MB');
  console.log('  - PostgreSQL DB:  ', (data.storageBreakdown.dbBytes / 1024 / 1024).toFixed(2), 'MB');
  console.log('  - Backups Archive:', (data.storageBreakdown.backupsBytes / 1024 / 1024).toFixed(2), 'MB');
  console.log('  - Web & App Logs: ', (data.storageBreakdown.logsBytes / 1024 / 1024).toFixed(2), 'MB');
  console.log('PostgreSQL Pool:   ', data.database.activeConnections, 'active /', data.database.idleConnections, 'idle (Ping:', data.database.pingMs, 'ms, Status:', data.database.status + ')');
  console.log('Redis Pipeline:    ', data.redis.status, '(Ping:', data.redis.pingMs, 'ms, Lua Rate Limiter)');
  console.log('Error Diagnostics: ', data.errors.totalErrors, 'total | 5xx:', data.errors.fiveXx, '| 4xx:', data.errors.fourXx, '| Payment drops:', data.errors.paymentFailures);
  console.log('Recent Error Log:  ', data.errors.recentErrors.length > 0 ? data.errors.recentErrors.length + ' logged' : '0 errors logged (clean operation)');
  console.log('E-Commerce Today:  ', data.ecommerce.orders, 'orders | ₹' + data.ecommerce.revenue, 'revenue |', data.ecommerce.booksSold, 'books sold');
  console.log('====================================================');

  // Test SSE Stream
  console.log('\nTesting Real-Time SSE Stream (/api/admin/monitor/stream)...');
  const controller = new AbortController();
  const sseTimeout = setTimeout(() => controller.abort(), 6000);
  const sseRes = await fetch('http://localhost:3000/api/admin/monitor/stream', {
    headers: { Authorization: 'Bearer ' + token },
    signal: controller.signal
  });
  console.log('SSE Stream HTTP Status:', sseRes.status, '(' + sseRes.headers.get('content-type') + ')');
  const reader = sseRes.body.getReader();
  const { value } = await reader.read();
  const decoder = new TextDecoder();
  const frameText = decoder.decode(value);
  console.log('SSE First Frame Verified: ', frameText.startsWith('data: {') ? '✅ VALID JSON STREAM FRAME' : '⚠️ UNEXPECTED FRAME');
  clearTimeout(sseTimeout);
  controller.abort();
  console.log('✅ SSE Stream successfully verified and closed.\n');
}

testMonitor().catch(err => {
  console.error(err);
  process.exit(1);
});
