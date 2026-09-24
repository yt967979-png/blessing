/**
 * Test Harness: Combo Pack Coupon Validation
 * Validates that combo packs qualify for coupons with min_cart_qty >= 4 (such as BPGFIRST)
 */

const assert = require('assert');

// Mock coupons database row
const mockCoupon = {
  id: 'cpn-1789866158621-keok',
  code: 'BPGFIRST',
  discount_type: 'flat',
  discount_value: 150,
  min_cart_qty: 4,
  min_order_amount: 0,
  max_discount_amount: null,
  max_uses: 1000,
  used_count: 5,
  is_active: true,
  expires_at: '2026-10-01T00:00:00.000Z'
};

function computeDiscount(c, subtotal) {
  if (c.discount_type === 'flat') {
    return Math.min(Number(c.discount_value), subtotal);
  }
  const pct = Number(c.discount_value || 0) / 100;
  let raw = Math.round(subtotal * pct);
  if (c.max_discount_amount != null) {
    raw = Math.min(raw, Number(c.max_discount_amount));
  }
  return Math.min(raw, subtotal);
}

function isComboItem(item) {
  if (!item) return false;
  if (item.category === 'combo') return true;
  if (item.category_id === 'cat-combos') return true;
  const title = String(item.title || '').toLowerCase();
  return (
    title.includes('combo') ||
    title.includes('5 in 1') ||
    title.includes('5-in-1') ||
    title.includes('6 in 1') ||
    title.includes('6-in-1') ||
    title.includes('7 in 1') ||
    title.includes('7-in-1') ||
    title.includes('all in one') ||
    title.includes('all-in-one') ||
    title.includes('full set')
  );
}

function cartHasCombo(items) {
  if (!Array.isArray(items)) return false;
  return items.some((item) => Number(item.qty || 0) > 0 && isComboItem(item));
}

function validateCouponForCartMock(coupon, opts) {
  const rawCode = String(opts.code || '').trim().toUpperCase();
  if (!rawCode || rawCode !== coupon.code) {
    return { ok: false, error: 'Invalid coupon code.', status: 404 };
  }

  const hasCombo = Boolean(
    opts.hasCombo ||
    (Array.isArray(opts.items) && cartHasCombo(opts.items))
  );

  const minQty = Number(coupon.min_cart_qty || 4);
  if (!hasCombo && opts.cartQty < minQty) {
    return {
      ok: false,
      error: `Coupon "${coupon.code}" requires at least ${minQty} books in cart (or 1 Combo Pack). (Current: ${opts.cartQty})`,
      status: 400
    };
  }

  const minOrder = Number(coupon.min_order_amount || 0);
  if (opts.subtotal < minOrder) {
    return {
      ok: false,
      error: `Coupon "${coupon.code}" requires a minimum cart value of ₹${minOrder}.`,
      status: 400
    };
  }

  const discount = computeDiscount(coupon, opts.subtotal);
  return {
    ok: true,
    coupon: { id: coupon.id, code: coupon.code, discount }
  };
}

console.log('================================================================');
console.log('🧪 VERIFYING COMBO PACK COUPON VALIDATION RULES');
console.log('================================================================');

// Case 1: 1 regular guide book (should fail minQty = 4)
const case1 = validateCouponForCartMock(mockCoupon, {
  code: 'BPGFIRST',
  cartQty: 1,
  subtotal: 350,
  hasCombo: false,
  items: [{ id: 'b1', title: '10th Maths Guide', category: 'guide', qty: 1 }]
});
assert.strictEqual(case1.ok, false, '1 regular guide should fail coupon minQty');
assert.ok(case1.error.includes('requires at least 4 books'), 'Error should specify 4 books');
console.log('✅ [PASS] 1 regular book correctly rejected (requires at least 4 books in cart)');

// Case 2: 4 regular guide books (should succeed)
const case2 = validateCouponForCartMock(mockCoupon, {
  code: 'BPGFIRST',
  cartQty: 4,
  subtotal: 1400,
  hasCombo: false,
  items: [{ id: 'b1', title: '10th Maths Guide', category: 'guide', qty: 4 }]
});
assert.strictEqual(case2.ok, true, '4 regular guides should pass');
assert.strictEqual(case2.coupon.discount, 150, 'Discount should be 150');
console.log('✅ [PASS] 4 regular books correctly accepted with ₹150 discount');

// Case 3: 1 COMBO PACK ALONE (qty: 1, subtotal: 1300) -> MUST SUCCEED!
const case3 = validateCouponForCartMock(mockCoupon, {
  code: 'BPGFIRST',
  cartQty: 1,
  subtotal: 1300,
  hasCombo: true,
  items: [{ id: 'bpg-1790146297047', title: '10TH STD 5 IN 1 GUIDE COMBO', category: 'combo', qty: 1 }]
});
assert.strictEqual(case3.ok, true, '1 Combo pack ALONE MUST satisfy coupon requirement');
assert.strictEqual(case3.coupon.discount, 150, 'Discount must be ₹150');
console.log('✅ [PASS] 1 Combo Pack ALONE satisfies coupon requirements and receives ₹150 discount');

// Case 4: 1 Combo pack detected automatically via items array (hasCombo not explicitly passed)
const case4 = validateCouponForCartMock(mockCoupon, {
  code: 'BPGFIRST',
  cartQty: 1,
  subtotal: 1300,
  items: [{ id: 'bpg-1790146297047', title: '10TH STD 5 IN 1 GUIDE COMBO', category: 'combo', qty: 1 }]
});
assert.strictEqual(case4.ok, true, 'Auto-detect combo from items array MUST succeed');
assert.strictEqual(case4.coupon.discount, 150);
console.log('✅ [PASS] 1 Combo Pack auto-detected from items array satisfies coupon requirement');

// Case 5: 11th Std 6-in-1 Combo Pack (qty: 1, subtotal: 1650)
const case5 = validateCouponForCartMock(mockCoupon, {
  code: 'BPGFIRST',
  cartQty: 1,
  subtotal: 1650,
  items: [{ id: 'bpg-11th-6in1', title: '11TH STD 6 IN 1 COMBO', category: 'combo', qty: 1 }]
});
assert.strictEqual(case5.ok, true);
assert.strictEqual(case5.coupon.discount, 150);
console.log('✅ [PASS] 11th Std 6-in-1 Combo Pack satisfies coupon requirement');

console.log('\n================================================================');
console.log('🎉 ALL 5 COMBO COUPON TESTS PASSED: COMBO SATISFIES COUPON MOQ!');
console.log('================================================================');
