const assert = require('assert');

function classifyQuery(userPrompt) {
  const q = userPrompt.trim().toLowerCase();

  // 1. Office or helpline
  const isOfficeOrHelpline =
    q.includes('office') ||
    q.includes('helpline') ||
    q.includes('working hours') ||
    q.includes('office hours') ||
    q.includes('opening hours') ||
    q.includes('office time') ||
    q.includes('office timing') ||
    q.includes('ayanavaram') ||
    q.includes('where is your office') ||
    q.includes('where are you located') ||
    q.includes('head office') ||
    q.includes('call office') ||
    q.includes('phone helpline') ||
    q.includes('store location') ||
    (q.includes('hours') && (q.includes('working') || q.includes('open') || q.includes('timing') || q.includes('office'))) ||
    (q.includes('chennai') && (q.includes('office') || q.includes('address') || q.includes('hours') || q.includes('location') || q.includes('shop') || q.includes('store') || q.includes('center') || q.includes('centre')));

  if (isOfficeOrHelpline) return 'OFFICE_HELPLINE';

  // 2. Delivery timelines
  const isDeliveryTimelines =
    q.includes('how many days') ||
    q.includes('when will it come') ||
    q.includes('delivery time') ||
    q.includes('transit time') ||
    q.includes('timelines') ||
    q.includes('how long') ||
    q.includes('delivery days') ||
    q.includes('when will i receive') ||
    q.includes('when will i get') ||
    q.includes('courier speed') ||
    q.includes('eppo varum') ||
    ((q.includes('chennai') || q.includes('madurai') || q.includes('coimbatore') || q.includes('trichy') || q.includes('salem') || q.includes('tirunelveli') || q.includes('erode') || q.includes('vellore') || q.includes('thanjavur') || q.includes('bangalore') || q.includes('kerala')) &&
      (q.includes('delivery') || q.includes('courier') || q.includes('reach') || q.includes('arrive') || q.includes('days') || q.includes('time') || q.includes('ship')));

  if (isDeliveryTimelines) return 'DELIVERY_TIMELINES';

  // 3. Books & catalog
  const isBooksCatalog =
    q.includes('book') ||
    q.includes('guide') ||
    q.includes('catalog') ||
    q.includes('10th') ||
    q.includes('math') ||
    q.includes('science') ||
    q.includes('tamil') ||
    q.includes('english');

  if (isBooksCatalog) return 'BOOKS_CATALOG';

  return 'OTHER';
}

console.log('🧪 Testing Intent Classification:');

// Test 1: User asked office and working hours (with "chennai")
const q1 = 'Where is your Chennai office and what are your working hours?';
assert.strictEqual(classifyQuery(q1), 'OFFICE_HELPLINE', `Failed on: ${q1}`);
console.log(`✅ "${q1}" => OFFICE_HELPLINE (NOT DELIVERY TIMELINES)`);

// Test 2: Quick menu pill query
const q2 = 'Office & Helpline';
assert.strictEqual(classifyQuery(q2), 'OFFICE_HELPLINE', `Failed on: ${q2}`);
console.log(`✅ "${q2}" => OFFICE_HELPLINE`);

// Test 3: Actual delivery query mentioning Chennai
const q3 = 'How many days for delivery to Chennai?';
assert.strictEqual(classifyQuery(q3), 'DELIVERY_TIMELINES', `Failed on: ${q3}`);
console.log(`✅ "${q3}" => DELIVERY_TIMELINES`);

// Test 4: Another delivery query
const q4 = 'When will it reach Madurai via ST courier?';
assert.strictEqual(classifyQuery(q4), 'DELIVERY_TIMELINES', `Failed on: ${q4}`);
console.log(`✅ "${q4}" => DELIVERY_TIMELINES`);

// Test 5: Browse Books Catalog
const q5 = 'Browse Books Catalog';
assert.strictEqual(classifyQuery(q5), 'BOOKS_CATALOG', `Failed on: ${q5}`);
console.log(`✅ "${q5}" => BOOKS_CATALOG`);

console.log('\n🎉 ALL INTENT TESTS PASSED DETERMINISTICALLY!');
