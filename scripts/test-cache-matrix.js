const https = require('https');

const routes = [
  { path: '/', type: 'Browsing (Cached)' },
  { path: '/products', type: 'Browsing (Cached)' },
  { path: '/help', type: 'Browsing (Cached)' },
  { path: '/terms-of-service', type: 'Browsing (Cached)' },
  { path: '/track', type: 'VPS DB (Never Cached)' },
  { path: '/orders', type: 'VPS DB (Never Cached)' },
  { path: '/checkout', type: 'VPS DB (Never Cached)' },
  { path: '/cart', type: 'VPS DB (Never Cached)' },
  { path: '/admin', type: 'VPS DB (Never Cached)' },
  { path: '/api/track?orderId=BPG-TEST', type: 'VPS DB (Never Cached)' },
  { path: '/api/health', type: 'VPS DB (Never Cached)' },
];

async function run() {
  console.log('Testing Cache Matrix on https://blessingpowerguide.in\n');
  for (const r of routes) {
    const t0 = Date.now();
    await new Promise((res) => {
      https.get('https://blessingpowerguide.in' + r.path, (resp) => {
        const ms = Date.now() - t0;
        const cache = resp.headers['cache-control'] || 'none';
        const cf = resp.headers['cf-cache-status'] || 'none';
        const cdnCache = resp.headers['cdn-cache-control'] || 'none';
        const isCorrect = r.type.includes('Never Cached')
          ? cache.includes('no-store') && (cf === 'DYNAMIC' || cf === 'none')
          : cache.includes('public') && (cdnCache.includes('max-age') || cf !== 'DYNAMIC');
        
        const statusIcon = isCorrect ? '✅' : '⚠️';
        console.log(`${statusIcon} ${r.path.padEnd(28)} [${r.type.padEnd(24)}] HTTP ${resp.statusCode} (${ms}ms) | CF: ${cf.padEnd(8)} | Cache: ${cache.slice(0, 32)}`);
        res();
      }).on('error', (err) => {
        console.error(`❌ ${r.path}: ${err.message}`);
        res();
      });
    });
  }
}

run();
