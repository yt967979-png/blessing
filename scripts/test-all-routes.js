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
        const pass = res.statusCode === route.expectedStatus;
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
        status: 0,
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
        status: 408,
        ms: Date.now() - start,
        pass: false,
        error: 'Timeout exceeded 8000ms',
      });
    });
  });
}

async function runAllTests() {
  console.log(`\n======================================================`);
  console.log(`🧪 BLESSING POWER GUIDE — AUTOMATED ROUTE MONITOR & TEST`);
  console.log(` Target: ${baseUrl}`);
  console.log(` Date: ${new Date().toISOString()}`);
  console.log(`======================================================\n`);

  let totalPassed = 0;
  let totalFailed = 0;

  for (const route of routesToTest) {
    const result = await fetchRoute(route);
    const icon = result.pass ? '✅' : '❌';
    const statusText = result.pass ? `HTTP ${result.status}` : `FAIL (${result.status || result.error})`;
    
    console.log(`${icon} [${result.ms}ms] ${route.name.padEnd(28)} ${route.path.padEnd(30)} ${statusText}`);

    if (result.pass) {
      totalPassed++;
    } else {
      totalFailed++;
      if (result.error) console.log(`   └─ Error: ${result.error}`);
    }
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`📊 RESULTS: ${totalPassed} Passed, ${totalFailed} Failed (${routesToTest.length} Total)`);
  console.log(`------------------------------------------------------\n`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAllTests();
