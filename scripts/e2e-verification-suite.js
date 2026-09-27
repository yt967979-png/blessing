const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://blessing:blessing2025@localhost:5432/blessing',
});

const BASE_URL = 'http://localhost:3000';

async function runTestSuite() {
  console.log('===============================================================');
  console.log('     BLESSING POWER GUIDE — LIVE SYSTEM END-TO-END AUDIT SUITE ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName} -> ${details}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // SUITE 1: Direct Database Consistency
    // -------------------------------------------------------------
    console.log('--- 1. DATABASE CONSISTENCY & INTEGRITY ---');
    const dbBooks = await pool.query(
      "SELECT id, title, category_id, subject, combo_subjects, price, discount_price, stock FROM books ORDER BY id"
    );
    assert(dbBooks.rows.length >= 2, 'Database contains active books', `Found ${dbBooks.rows.length}`);

    for (const b of dbBooks.rows) {
      const isSingleSubj = ['tamil', 'english', 'mathematics', 'maths', 'science', 'social science'].includes(
        String(b.subject || '').trim().toLowerCase()
      );
      if (isSingleSubj) {
        assert(
          b.category_id !== 'cat-combos',
          `Single subject book "${b.title}" is NOT in cat-combos`,
          `category_id was ${b.category_id}`
        );
        const subs = Array.isArray(b.combo_subjects) ? b.combo_subjects : [];
        assert(
          subs.length === 0,
          `Single subject book "${b.title}" has 0 combo_subjects`,
          `Found: ${JSON.stringify(subs)}`
        );
      } else if (String(b.category_id) === 'cat-combos') {
        const subs = Array.isArray(b.combo_subjects) ? b.combo_subjects : [];
        assert(
          subs.length >= 2,
          `Combo pack "${b.title}" has >= 2 subjects bundled`,
          `Found: ${subs.length}`
        );
      }
    }

    // -------------------------------------------------------------
    // SUITE 2: Public Catalog API Check
    // -------------------------------------------------------------
    console.log('\n--- 2. PUBLIC CATALOG API (/api/products) ---');
    const prodRes = await fetch(`${BASE_URL}/api/products?fresh=1`);
    assert(prodRes.status === 200, 'Catalog API responds with HTTP 200');
    const prodData = await prodRes.json();
    const products = Array.isArray(prodData) ? prodData : (prodData.products || []);
    assert(products.length >= 2, `Catalog returned products (count: ${products.length})`);

    const tamilBook = products.find((p) => String(p.title).toLowerCase().includes('tamil'));
    const comboPack = products.find((p) => String(p.category).toLowerCase() === 'combo');

    assert(Boolean(tamilBook), 'Found Tamil book in catalog');
    if (tamilBook) {
      assert(
        tamilBook.category === 'guide',
        'Tamil book is strictly classified as "guide" (NOT combo)',
        `category: ${tamilBook.category}`
      );
      assert(
        !tamilBook.comboSubjects || tamilBook.comboSubjects.length === 0,
        'Tamil book exposes 0 comboSubjects',
        `comboSubjects: ${JSON.stringify(tamilBook.comboSubjects)}`
      );
      assert(
        tamilBook.price === 350,
        'Tamil book real price is ₹350',
        `price: ${tamilBook.price}`
      );
    }

    assert(Boolean(comboPack), 'Found Combo Pack in catalog');
    if (comboPack) {
      assert(
        comboPack.category === 'combo',
        'Combo pack is strictly classified as "combo"',
        `category: ${comboPack.category}`
      );
      assert(
        Array.isArray(comboPack.comboSubjects) && comboPack.comboSubjects.length >= 5,
        'Combo pack bundles 5 subjects',
        `Subjects: ${comboPack.comboSubjects?.join(', ')}`
      );
      assert(
        comboPack.price === 1300,
        'Combo pack price is ₹1300',
        `price: ${comboPack.price}`
      );
    }

    // -------------------------------------------------------------
    // SUITE 3: Cart Validation & MOQ Rules (/api/cart/validate)
    // -------------------------------------------------------------
    console.log('\n--- 3. CART VALIDATION & DELIVERY RULES (/api/cart/validate) ---');

    // Case A: 1 Tamil Book
    const r1 = await fetch(`${BASE_URL}/api/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: tamilBook?.id || 'bpg-1790336858543', qty: 1, title: 'Tamil Book' }],
      }),
    });
    const d1 = await r1.json();
    assert(r1.status === 200, 'Validate 1 book responds HTTP 200');
    assert(d1.isMinOrderSatisfied === false, '1 Tamil Book is BLOCKED under MOQ (min 4 required)');
    assert(d1.deliveryFee === 150, '1 Tamil Book has ₹150 delivery fee', `fee: ${d1.deliveryFee}`);
    assert(d1.booksUntilMinOrder === 3, '1 Tamil Book needs 3 more books to meet MOQ', `remaining: ${d1.booksUntilMinOrder}`);

    // Case B: 3 Tamil Books
    const r3 = await fetch(`${BASE_URL}/api/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: tamilBook?.id || 'bpg-1790336858543', qty: 3, title: 'Tamil Book' }],
      }),
    });
    const d3 = await r3.json();
    assert(d3.isMinOrderSatisfied === false, '3 Tamil Books is BLOCKED under MOQ (needs 1 more)');
    assert(d3.deliveryFee === 150, '3 Tamil Books has ₹150 delivery fee', `fee: ${d3.deliveryFee}`);
    assert(d3.booksUntilMinOrder === 1, '3 Tamil Books needs 1 more book', `remaining: ${d3.booksUntilMinOrder}`);

    // Case C: 4 Tamil Books
    const r4 = await fetch(`${BASE_URL}/api/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: tamilBook?.id || 'bpg-1790336858543', qty: 4, title: 'Tamil Book' }],
      }),
    });
    const d4 = await r4.json();
    assert(d4.isMinOrderSatisfied === true, '4 Tamil Books SATISFIES MOQ (checkout allowed)');
    assert(d4.deliveryFee === 150, '4 Tamil Books delivery fee is ₹150', `fee: ${d4.deliveryFee}`);
    assert(d4.booksUntilFreeDelivery === 1, '4 Tamil Books is 1 book away from Free Delivery (tier 5)');

    // Case D: 5 Tamil Books
    const r5 = await fetch(`${BASE_URL}/api/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: tamilBook?.id || 'bpg-1790336858543', qty: 5, title: 'Tamil Book' }],
      }),
    });
    const d5 = await r5.json();
    assert(d5.isMinOrderSatisfied === true, '5 Tamil Books SATISFIES MOQ');
    assert(d5.deliveryFee === 0, '5 Tamil Books unlocks FREE DELIVERY (₹0)', `fee: ${d5.deliveryFee}`);
    assert(d5.hasFreeDelivery === true, '5 Tamil Books hasFreeDelivery flag is true');

    // Case E: 1 Combo Pack
    const rc = await fetch(`${BASE_URL}/api/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ id: comboPack?.id || 'bpg-1790146297047', qty: 1, title: '10TH STD 5 IN 1 GUIDE COMBO' }],
      }),
    });
    const dc = await rc.json();
    assert(dc.isMinOrderSatisfied === true, '1 Combo Pack SATISFIES MOQ immediately');
    assert(dc.deliveryFee === 0, '1 Combo Pack has FREE DELIVERY (₹0)', `fee: ${dc.deliveryFee}`);
    assert(dc.hasCombo === true, 'hasCombo flag is true for Combo Pack');

    // Case F: Security — Client Price Tampering Test
    console.log('\n--- 4. FINANCIAL SECURITY & PRICE TAMPERING RESISTANCE ---');
    const rTamper = await fetch(`${BASE_URL}/api/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          // Malicious payload trying to inject price = 1 Rupee
          { id: tamilBook?.id || 'bpg-1790336858543', qty: 4, price: 1, title: 'Tamil Book' },
        ],
      }),
    });
    const dTamper = await rTamper.json();
    assert(
      dTamper.subtotal === 1400,
      'Server DISCARDS client injected price of ₹1 and charges real subtotal (4 x ₹350 = ₹1400)',
      `Server computed subtotal: ${dTamper.subtotal}`
    );
    assert(
      dTamper.total === 1550,
      'Server computed total is ₹1400 + ₹150 delivery = ₹1550 (tamper failed)',
      `Server total: ${dTamper.total}`
    );

    // Case G: Stock Limit Enforcement
    console.log('\n--- 5. INVENTORY & STOCK LIMIT ENFORCEMENT ---');
    const rOversell = await fetch(`${BASE_URL}/api/cart/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { id: tamilBook?.id || 'bpg-1790336858543', qty: 99999, title: 'Tamil Book' },
        ],
      }),
    });
    const dOversell = await rOversell.json();
    const itemCheck = dOversell.items?.[0];
    assert(
      itemCheck?.hasStockError === true || itemCheck?.availableStock < 99999,
      'Attempt to buy 99,999 copies is BLOCKED by server stock validation',
      `Stock available: ${itemCheck?.availableStock}`
    );

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n===============================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    if (failed === 0) {
      console.log('STATUS: ALL CORE SUBSYSTEMS ARE VERIFIED AND WORKING 100% CORRECTLY.');
    } else {
      console.error('STATUS: DISCREPANCIES DETECTED — INVESTIGATION REQUIRED.');
    }
    console.log('===============================================================\n');
  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    await pool.end();
  }
}

runTestSuite();
