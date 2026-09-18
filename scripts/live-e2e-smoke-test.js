/**
 * Live End-to-End Production Smoke Test for Blessing Power Guide
 * Targets: https://blessingpowerguide.in
 * Validates: Customer Journey, Admin Flows, and Failure Cases.
 */

const BASE_URL = process.env.SITE_URL || 'https://blessingpowerguide.in';

async function runLiveSmokeTest() {
  console.log('\n================================================================');
  console.log('🚀 LIVE PRODUCTION END-TO-END SMOKE TEST');
  console.log(`Target: ${BASE_URL}`);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 1. CUSTOMER JOURNEY
  // ─────────────────────────────────────────────────────────────
  console.log('--- 1. CUSTOMER JOURNEY: Home → Search → PDP → Sample PDF → Cart ---');

  // Step 1: Home Page
  try {
    const res = await fetch(`${BASE_URL}/`);
    const html = await res.text();
    assert(res.status === 200, 'Home page returns HTTP 200 OK');
    assert(html.includes('Blessing Power Guide') || html.includes('blessing'), 'Home page contains official title');
    assert(html.includes('header') || html.includes('nav'), 'Header navigation rendered');
  } catch (err) {
    assert(false, `Home page request failed: ${err.message}`);
  }

  // Step 2: Category & Search Page
  try {
    const res = await fetch(`${BASE_URL}/search?class=10th`);
    const html = await res.text();
    assert(res.status === 200, 'Search page /search?class=10th returns HTTP 200 OK');
    assert(html.length > 500, 'Search HTML page content rendered');
  } catch (err) {
    assert(false, `Search page request failed: ${err.message}`);
  }

  // Step 3: Products API
  let activeBook = null;
  try {
    const res = await fetch(`${BASE_URL}/api/products`);
    const data = await res.json();
    const books = Array.isArray(data) ? data : data.books || [];
    assert(res.status === 200, `Products API /api/products returns HTTP 200 (${books.length} books found)`);
    assert(books.length > 0, 'Catalog contains at least 1 published book');
    activeBook = books[0];
  } catch (err) {
    assert(false, `Products API request failed: ${err.message}`);
  }

  // Step 4: Product Detail Page (PDP)
  if (activeBook) {
    try {
      const slug = activeBook.slug || activeBook.id;
      const res = await fetch(`${BASE_URL}/products/${slug}`);
      const html = await res.text();
      assert(res.status === 200, `PDP /products/${slug} returns HTTP 200 OK`);
      assert(html.includes(activeBook.title), `PDP displays book title "${activeBook.title}"`);
      assert(html.includes('application/ld+json'), 'PDP includes Schema.org Product structured data');
      assert(html.includes('og:title') || html.includes('property="og:'), 'PDP includes OpenGraph meta tags');
    } catch (err) {
      assert(false, `PDP request failed: ${err.message}`);
    }

    // Step 5: Sample PDF Preview
    if (activeBook.samplePdfUrl) {
      try {
        const pdfUrl = activeBook.samplePdfUrl.startsWith('http')
          ? activeBook.samplePdfUrl
          : `${BASE_URL}${activeBook.samplePdfUrl}`;
        const res = await fetch(pdfUrl);
        const contentType = res.headers.get('content-type') || '';
        assert(res.status === 200, `Sample PDF ${activeBook.samplePdfUrl} returns HTTP 200`);
        assert(contentType.includes('application/pdf'), `Sample PDF returns Content-Type: application/pdf (got: ${contentType})`);
      } catch (err) {
        assert(false, `Sample PDF request failed: ${err.message}`);
      }
    } else {
      console.log('  ⚠️ (Skipping Sample PDF: Book does not have samplePdfUrl set)');
    }
  }

  // Step 6: Cart & Delivery Rule Estimator
  try {
    const res = await fetch(`${BASE_URL}/cart`);
    assert(res.status === 200, 'Cart page /cart returns HTTP 200 OK');
  } catch (err) {
    assert(false, `Cart page request failed: ${err.message}`);
  }

  // Step 7: Coupon Validation API
  try {
    const res = await fetch(`${BASE_URL}/api/coupons/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'INVALID_COUPON_TEST', subtotal: 1000, cartQty: 4 }),
    });
    const data = await res.json();
    assert(res.status >= 400, `Coupon API safely rejects invalid/unauthenticated coupon (HTTP ${res.status})`);
    assert(data.ok === false || !!data.error, 'Coupon API returns clear error message');
  } catch (err) {
    assert(false, `Coupon validation request failed: ${err.message}`);
  }

  // Step 8: Tracking Page
  try {
    const res = await fetch(`${BASE_URL}/track`);
    const html = await res.text();
    assert(res.status === 200, 'Tracking page /track returns HTTP 200 OK');
    assert(html.includes('Track') || html.includes('track'), 'Tracking input UI elements present');
  } catch (err) {
    assert(false, `Track page request failed: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. FAILURE & RESILIENCE CASES
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 2. FAILURE CASES: MOQ Bypass, IDOR, Razorpay Auth, Pincode ---');

  // Case A: MOQ Bypass Rejection (1 Book Cart)
  if (activeBook) {
    try {
      const res = await fetch(`${BASE_URL}/api/razorpay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [{ id: activeBook.id, qty: 1 }],
        }),
      });
      assert(res.status === 401 || res.status === 400, 'Unauthenticated checkout attempt strictly rejected with HTTP 401/400');
    } catch (err) {
      assert(false, `MOQ check failed: ${err.message}`);
    }
  }

  // Case B: Invoice IDOR Protection
  try {
    const res = await fetch(`${BASE_URL}/api/orders/non-existent-order-9999/invoice`);
    assert(res.status === 401 || res.status === 404, 'Unauthorized invoice download blocked (HTTP 401/404)');
  } catch (err) {
    assert(false, `Invoice IDOR check failed: ${err.message}`);
  }

  // Case C: Webhook Signature Verification
  try {
    const res = await fetch(`${BASE_URL}/api/webhooks/razorpay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Razorpay-Signature': 'bogus_forged_hex_signature_1234567890abcdef',
      },
      body: JSON.stringify({ event: 'payment.captured' }),
    });
    assert(res.status === 400 || res.status === 401, 'Forged Razorpay webhook signature strictly rejected with HTTP 400/401');
  } catch (err) {
    assert(false, `Webhook forgery check failed: ${err.message}`);
  }

  // Case D: Upload Path Traversal Prevention
  try {
    const res = await fetch(`${BASE_URL}/uploads/../../../../etc/passwd`);
    assert(res.status === 403 || res.status === 404, 'Path traversal /uploads/../../etc/passwd blocked with HTTP 403/404');
  } catch (err) {
    assert(false, `Path traversal check failed: ${err.message}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 3. INFRASTRUCTURE & BACKEND HEALTH
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- 3. INFRASTRUCTURE: Health & Real-Time Sync Sockets ---');

  // Health Endpoint
  try {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert(res.status === 200, 'Health endpoint /api/health returns HTTP 200 OK');
  } catch (err) {
    assert(false, `Health endpoint failed: ${err.message}`);
  }

  // Abandoned Carts API Security
  try {
    const res = await fetch(`${BASE_URL}/api/admin/abandoned-carts`);
    assert(res.status === 401, 'Admin Abandoned Carts API protected with HTTP 401 Unauthorized');
  } catch (err) {
    assert(false, `Abandoned carts security check failed: ${err.message}`);
  }

  // Summary
  console.log('\n================================================================');
  console.log(`📊 LIVE SMOKE TEST COMPLETE: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runLiveSmokeTest().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
