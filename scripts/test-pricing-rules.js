/**
 * Automated Unit Test Suite for Blessing Power Guide Pricing & Checkout Rules
 * Run with: node scripts/test-pricing-rules.js
 */

const assert = require('assert');

function mockBook(id, title, price, discountPrice, stock, status = 'published') {
  return {
    id,
    title,
    price,
    discount_price: discountPrice,
    stock,
    status,
  };
}

function computeCheckoutPricing(catalog, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Cart is empty. Add books before checkout.', status: 400 };
  }

  let calculatedSubtotal = 0;
  const verifiedItems = [];

  for (const item of items) {
    const itemQty = Math.max(1, Number(item.qty || 1));
    const book = catalog.get(item.id);
    if (!book) {
      return { ok: false, error: 'Book not found in catalog.', status: 400 };
    }
    if (book.status !== 'published' || book.stock <= 0) {
      return { ok: false, error: `"${book.title}" is out of stock.`, status: 400 };
    }
    if (itemQty > book.stock) {
      return { ok: false, error: `"${book.title}" — only ${book.stock} left in stock.`, status: 400 };
    }

    const mrp = Number(book.price) || 0;
    const rawSale = book.discount_price == null || book.discount_price === '' ? NaN : Number(book.discount_price);
    const unitPrice = Number.isFinite(rawSale) && rawSale > 0 && rawSale < mrp ? rawSale : mrp;
    const subtotal = unitPrice * itemQty;
    calculatedSubtotal += subtotal;

    verifiedItems.push({
      id: book.id,
      title: book.title,
      price: unitPrice,
      qty: itemQty,
      subtotal,
    });
  }

  const cartQty = verifiedItems.reduce((s, i) => s + Number(i.qty || 0), 0);
  if (cartQty < 4) {
    return {
      ok: false,
      error: `Minimum order quantity is 4 books. You currently have ${cartQty} book(s) in your cart.`,
      status: 400,
    };
  }

  const shippingFee = cartQty >= 5 ? 0 : 150;
  const finalTotal = Math.max(0, calculatedSubtotal + shippingFee);

  return {
    ok: true,
    subtotal: calculatedSubtotal,
    discountAmount: 0,
    shippingFee,
    totalAmount: finalTotal,
    verifiedItems,
  };
}

// Test Catalog
const catalog = new Map([
  ['b1', mockBook('b1', 'Maths Guide', 400, 320, 50)],
  ['b2', mockBook('b2', 'Science Guide', 450, 360, 50)],
  ['b3', mockBook('b3', 'Social Guide', 350, null, 50)],
  ['b4', mockBook('b4', 'English Guide', 300, 250, 50)],
  ['b5', mockBook('b5', 'Tamil Guide', 300, 250, 2)], // low stock
  ['b-out', mockBook('b-out', 'Out of Stock Book', 500, 400, 0, 'out_of_stock')],
]);

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n--- Running Pricing & Minimum Order Quantity Unit Tests ---');

runTest('1 book cart is rejected (MOQ = 4)', () => {
  const res = computeCheckoutPricing(catalog, [{ id: 'b1', qty: 1 }]);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.status, 400);
  assert(res.error.includes('Minimum order quantity is 4 books'));
});

runTest('3 books cart is rejected (MOQ = 4)', () => {
  const res = computeCheckoutPricing(catalog, [
    { id: 'b1', qty: 1 },
    { id: 'b2', qty: 1 },
    { id: 'b3', qty: 1 },
  ]);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.status, 400);
  assert(res.error.includes('You currently have 3 book(s)'));
});

runTest('Exactly 4 books applies ₹150 shipping fee', () => {
  const res = computeCheckoutPricing(catalog, [
    { id: 'b1', qty: 1 }, // 320
    { id: 'b2', qty: 1 }, // 360
    { id: 'b3', qty: 1 }, // 350 (no discount)
    { id: 'b4', qty: 1 }, // 250
  ]);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.subtotal, 1280);
  assert.strictEqual(res.shippingFee, 150);
  assert.strictEqual(res.totalAmount, 1430);
});

runTest('5 or more books qualifies for FREE shipping (₹0)', () => {
  const res = computeCheckoutPricing(catalog, [
    { id: 'b1', qty: 2 }, // 640
    { id: 'b2', qty: 1 }, // 360
    { id: 'b3', qty: 1 }, // 350
    { id: 'b4', qty: 1 }, // 250
  ]);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.subtotal, 1600);
  assert.strictEqual(res.shippingFee, 0);
  assert.strictEqual(res.totalAmount, 1600);
});

runTest('Out of stock book is rejected immediately', () => {
  const res = computeCheckoutPricing(catalog, [
    { id: 'b-out', qty: 1 },
    { id: 'b1', qty: 3 },
  ]);
  assert.strictEqual(res.ok, false);
  assert(res.error.includes('is out of stock'));
});

runTest('Requesting quantity higher than stock is rejected', () => {
  const res = computeCheckoutPricing(catalog, [
    { id: 'b5', qty: 5 }, // only 2 in stock
    { id: 'b1', qty: 2 },
  ]);
  assert.strictEqual(res.ok, false);
  assert(res.error.includes('only 2 left in stock'));
});

console.log(`\nResults: ${passed}/${total} tests passed.\n`);

if (passed !== total) {
  process.exit(1);
}
