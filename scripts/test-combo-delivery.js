/**
 * Automated Verification for Combo Pack Delivery Rules
 * Validates:
 * 1. 1 Combo Pack alone satisfies Minimum Order Quantity (MOQ).
 * 2. 1 Combo Pack qualifies for 100% FREE DOORSTEP DELIVERY (₹0).
 * 3. 1 Combo Pack + other books qualifies for 100% FREE DOORSTEP DELIVERY (₹0).
 * 4. Regular books (< 4) still enforce MOQ.
 * 5. Exactly 4 regular books charges ₹150 delivery.
 * 6. 5+ regular books qualifies for FREE delivery.
 */

const assert = require('assert');

const MIN_BOOKS_PER_ORDER = 4;
const FREE_DELIVERY_AT_QTY = 5;
const STANDARD_DELIVERY_FEE = 150;
const COMBO_BOOK_EQUIVALENT = 5;

function isComboItem(item) {
  if (!item) return false;
  if (item.category === 'combo') return true;
  if (item.category_id === 'cat-combos') return true;
  const title = String(item.title || '').toLowerCase();
  return (
    title.includes('combo') ||
    title.includes('5 in 1') ||
    title.includes('5-in-1') ||
    title.includes('all in one') ||
    title.includes('all-in-one')
  );
}

function cartHasCombo(items) {
  if (!Array.isArray(items)) return false;
  return items.some((item) => Number(item.qty || 0) > 0 && isComboItem(item));
}

function effectiveBookCount(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const qty = Math.max(0, Number(item.qty || 0));
    if (qty <= 0) return sum;
    if (isComboItem(item)) {
      return sum + qty * COMBO_BOOK_EQUIVALENT;
    }
    return sum + qty;
  }, 0);
}

function deliveryFeeForQty(bookQty, hasCombo = false) {
  if (hasCombo) return 0;
  const q = Math.max(0, Number(bookQty) || 0);
  if (q <= 0) return 0;
  return q >= FREE_DELIVERY_AT_QTY ? 0 : STANDARD_DELIVERY_FEE;
}

function isMoqSatisfied(itemsOrQty) {
  if (typeof itemsOrQty === 'number') {
    return itemsOrQty >= MIN_BOOKS_PER_ORDER;
  }
  if (!Array.isArray(itemsOrQty) || itemsOrQty.length === 0) return false;
  if (cartHasCombo(itemsOrQty)) return true;
  return effectiveBookCount(itemsOrQty) >= MIN_BOOKS_PER_ORDER;
}

function booksUntilMinOrder(itemsOrQty) {
  if (typeof itemsOrQty === 'number') {
    return Math.max(0, MIN_BOOKS_PER_ORDER - Math.max(0, Number(itemsOrQty) || 0));
  }
  if (!Array.isArray(itemsOrQty) || itemsOrQty.length === 0) return MIN_BOOKS_PER_ORDER;
  if (cartHasCombo(itemsOrQty)) return 0;
  return Math.max(0, MIN_BOOKS_PER_ORDER - effectiveBookCount(itemsOrQty));
}

console.log('================================================================');
console.log('🧪 VERIFYING COMBO PACK FREE DELIVERY & MOQ RULES');
console.log('================================================================\n');

// TEST 1: 1 Individual Guide Book (e.g. 10th Maths)
const cart1 = [{ id: 'b1', title: '10th Maths Standard Guide', category: 'guide', qty: 1 }];
assert.strictEqual(cartHasCombo(cart1), false);
assert.strictEqual(isMoqSatisfied(cart1), false, '1 regular guide must not satisfy MOQ');
assert.strictEqual(booksUntilMinOrder(cart1), 3, 'Must need 3 more books');
assert.strictEqual(deliveryFeeForQty(effectiveBookCount(cart1), cartHasCombo(cart1)), 150);
console.log('✅ [PASS] 1 regular guide requires 3 more books for MOQ (delivery: ₹150)');

// TEST 2: Exactly 4 Individual Guides (MOQ Met)
const cart4 = [{ id: 'b1', title: '10th Maths Guide', category: 'guide', qty: 4 }];
assert.strictEqual(cartHasCombo(cart4), false);
assert.strictEqual(isMoqSatisfied(cart4), true, '4 regular guides satisfies MOQ');
assert.strictEqual(booksUntilMinOrder(cart4), 0);
assert.strictEqual(deliveryFeeForQty(effectiveBookCount(cart4), cartHasCombo(cart4)), 150, '4 regular guides pays ₹150 courier fee');
console.log('✅ [PASS] 4 regular guides satisfies MOQ but pays ₹150 delivery');

// TEST 3: 5 Individual Guides (Free Delivery Met)
const cart5 = [{ id: 'b1', title: '10th Maths Guide', category: 'guide', qty: 5 }];
assert.strictEqual(isMoqSatisfied(cart5), true);
assert.strictEqual(deliveryFeeForQty(effectiveBookCount(cart5), cartHasCombo(cart5)), 0, '5 regular guides gets FREE delivery');
console.log('✅ [PASS] 5 regular guides unlocks ₹0 FREE delivery');

// TEST 4: 1 Combo Pack ONLY ("10TH STD 5 IN 1 GUIDE COMBO")
const cartCombo = [{ id: 'bpg-1790146297047', title: '10TH STD 5 IN 1 GUIDE COMBO', category: 'combo', qty: 1 }];
assert.strictEqual(cartHasCombo(cartCombo), true, 'Must detect combo pack');
assert.strictEqual(isMoqSatisfied(cartCombo), true, '1 Combo Pack MUST satisfy MOQ on its own');
assert.strictEqual(booksUntilMinOrder(cartCombo), 0, '1 Combo Pack needs 0 more books');
const comboFee = deliveryFeeForQty(effectiveBookCount(cartCombo), cartHasCombo(cartCombo));
assert.strictEqual(comboFee, 0, '1 Combo Pack MUST qualify for ₹0 FREE DELIVERY');
console.log('✅ [PASS] 1 Combo Pack ALONE satisfies MOQ and unlocks 100% FREE DELIVERY (₹0)');

// TEST 5: 1 Combo Pack by category_id ('cat-combos')
const cartCatCombo = [{ id: 'bpg-c2', title: 'All in One Secondary Pack', category_id: 'cat-combos', qty: 1 }];
assert.strictEqual(cartHasCombo(cartCatCombo), true);
assert.strictEqual(isMoqSatisfied(cartCatCombo), true);
assert.strictEqual(deliveryFeeForQty(effectiveBookCount(cartCatCombo), cartHasCombo(cartCatCombo)), 0);
console.log('✅ [PASS] 1 Combo Pack via category_id (cat-combos) unlocks 100% FREE DELIVERY (₹0)');

// TEST 6: 1 Combo Pack + 1 Regular Guide (Mixed Cart)
const cartMixed = [
  { id: 'bpg-1790146297047', title: '10TH STD 5 IN 1 GUIDE COMBO', category: 'combo', qty: 1 },
  { id: 'b1', title: '10th Tamil Guide', category: 'guide', qty: 1 }
];
assert.strictEqual(cartHasCombo(cartMixed), true);
assert.strictEqual(isMoqSatisfied(cartMixed), true);
assert.strictEqual(deliveryFeeForQty(effectiveBookCount(cartMixed), cartHasCombo(cartMixed)), 0);
console.log('✅ [PASS] 1 Combo Pack + 1 Regular Guide maintains 100% FREE DELIVERY (₹0)');

console.log('\n================================================================');
console.log('🎉 ALL 6 BUSINESS INVARIANT CHECKS PASSED: 1 COMBO = FREE DELIVERY!');
console.log('================================================================');
