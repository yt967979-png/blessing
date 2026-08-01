const http = require('http');
const https = require('https');

const baseUrl = process.argv[2] || 'http://127.0.0.1:3000';

const routesToTest = [
  { path: '/api/health', expectedStatus: 200, name: 'Health Probe' },
  { path: '/api/ready', expectedStatus: 200, name: 'Database Ready Probe' },
  { path: '/api/products', expectedStatus: 200, name: 'All Products API' },
  { path: '/api/products?cls=10th', expectedStatus: 200, name: '10th Standard Category API' },
  { path: '/api/products?cls=12th', expectedStatus: 200, name: '12th Standard Category API' },
  { path: '/api/products?category=combo', expectedStatus: 200, name: 'Combos Category API' },
  { path: '/', expectedStatus: 200, name: 'Home Page' },
  { path: '/products', expectedStatus: [200, 301, 302, 307, 308], name: 'Products Catalog Page' },
  { path: '/cart', expectedStatus: 200, name: 'Cart Page' },
  { path: '/checkout', expectedStatus: 200, name: 'Checkout Page' },
  { path: '/track', expectedStatus: 200, name: 'Order Tracking Page' },
  { path: '/search', expectedStatus: 200, name: 'Search Page' },
  { path: '/privacy-policy', expectedStatus: 200, name: 'Privacy Policy Page' },
  { path: '/shipping-policy', expectedStatus: 200, name: 'Shipping Policy Page' },
  { path: '/terms-of-service', expectedStatus: 200, name: 'Terms of Service Page' },
];

function fetchRoute(route) {
  return new Promise((resolve) => {
    const url = new URL(route.path, baseUrl);
    const transport = url.protocol === 'https:' ? https : http;
    const start = Date.now();

    const req = transport.get(url.href, { timeout: 8000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const ms = Date.now() - start;
        const pass = Array.isArray(route.expectedStatus)
          ? route.expectedStatus.includes(res.statusCode)
          : res.statusCode === route.expectedStatus;
        resolve({
          name: route.name,
          path: route.path,
          status: res.statusCode,
          ms,
          pass,
          bodySnippet: body.slice(0, 150),
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        name: route.name,
        path: route.path,
        status: 'ERROR',
        ms: Date.now() - start,
        pass: false,
        error: err.message,
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        name: route.name,
        path: route.path,
        status: 'TIMEOUT',
        ms: Date.now() - start,
        pass: false,
      });
    });
  });
}

async function runAllTests() {
  console.log('======================================================');
  console.log(`🧪 BLESSING POWER GUIDE — AUTOMATED ROUTE MONITOR & TEST`);
  console.log(` Target: ${baseUrl}`);
  console.log(` Date: ${new Date().toISOString()}`);
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  for (const route of routesToTest) {
    const res = await fetchRoute(route);
    if (res.pass) {
      passed++;
      console.log(`✅ [${res.ms}ms] ${res.name.padEnd(28)} ${res.path.padEnd(30)} HTTP ${res.status}`);
    } else {
      failed++;
      console.error(`❌ [${res.ms}ms] ${res.name.padEnd(28)} ${res.path.padEnd(30)} HTTP ${res.status} ${res.error ? `(${res.error})` : ''}`);
    }
  }

  console.log('\n------------------------------------------------------');
  console.log(`📊 RESULTS: ${passed} Passed, ${failed} Failed (${routesToTest.length} Total)`);
  console.log('------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests();
