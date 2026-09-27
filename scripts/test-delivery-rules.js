const MIN_BOOKS_PER_ORDER = 4;
const FREE_DELIVERY_AT_QTY = 5;
const STANDARD_DELIVERY_FEE = 150;
const COMBO_BOOK_EQUIVALENT = 5;

function isComboItem(item) {
  if (!item) return false;
  const title = String(item.title || item.name || '').toLowerCase();

  const hasComboTitle =
    title.includes('combo') ||
    title.includes('5 in 1') ||
    title.includes('5-in-1') ||
    title.includes('6 in 1') ||
    title.includes('6-in-1') ||
    title.includes('7 in 1') ||
    title.includes('7-in-1') ||
    title.includes('all in one') ||
    title.includes('all-in-one') ||
    title.includes('full set');

  if (hasComboTitle) return true;

  const comboSubs = item.comboSubjects || item.combo_subjects;
  if (Array.isArray(comboSubs) && comboSubs.length >= 2) {
    return true;
  }

  const isIndividualGuide =
    title.includes('guide') ||
    title.includes('book') ||
    /\b(tamil|english|maths|mathematics|science|social|physics|chemistry|biology|computer)\b/i.test(title) ||
    (item.subject && !/combo|all/i.test(String(item.subject)));

  if (isIndividualGuide && !hasComboTitle) {
    return false;
  }

  if (item.category_id === 'cat-combos') return true;
  if (item.category === 'combo') return true;

  return false;
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

const sampleCart = [
  {
    id: 'bpg-1790336858543',
    title: '10th Standard Tamil Book',
    qty: 1,
    price: 350,
    category: 'guide',
    category_id: 'cat-10th'
  }
];

console.log('--- 1 SINGLE TAMIL GUIDE ---');
console.log('isComboItem:', isComboItem(sampleCart[0]));
console.log('cartHasCombo:', cartHasCombo(sampleCart));
console.log('effectiveBookCount:', effectiveBookCount(sampleCart));
console.log('isMoqSatisfied (min 4):', isMoqSatisfied(sampleCart));
console.log('deliveryFee (1 book):', deliveryFeeForQty(effectiveBookCount(sampleCart), cartHasCombo(sampleCart)));
console.log('deliveryFee (4 books):', deliveryFeeForQty(4, false));
console.log('deliveryFee (5 books):', deliveryFeeForQty(5, false));

const comboCart = [
  {
    id: 'bpg-1790146297047',
    title: '10TH STD 5 IN 1 GUIDE COMBO',
    qty: 1,
    price: 1300,
    category: 'combo',
    category_id: 'cat-combos'
  }
];

console.log('\n--- 1 COMBO PACK (5-in-1) ---');
console.log('isComboItem(combo):', isComboItem(comboCart[0]));
console.log('cartHasCombo(combo):', cartHasCombo(comboCart));
console.log('isMoqSatisfied(combo):', isMoqSatisfied(comboCart));
console.log('deliveryFee(combo):', deliveryFeeForQty(effectiveBookCount(comboCart), cartHasCombo(comboCart)));
