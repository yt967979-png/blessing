const assert = require('assert');

console.log('======================================================');
console.log('🧪 BLESSING AI CO-FOUNDER — INTENT & COMMAND TESTS');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function check(cond, name, detail = '') {
  if (cond) {
    passed++;
    console.log(`✅ [PASS] ${name}`);
  } else {
    failed++;
    console.error(`❌ [FAIL] ${name}: ${detail}`);
  }
}

// 1. Test Book Launch Intent Detection
function isBookLaunchCommand(rawText) {
  const lower = rawText.toLowerCase().trim();
  return (
    (lower.includes('launch') &&
      (lower.includes('book') ||
        lower.includes('guide') ||
        lower.includes('combo') ||
        lower.includes('stock') ||
        lower.includes('both') ||
        lower.includes('edition'))) ||
    ((lower.includes('both') || lower.includes('all') || lower.includes('combo')) &&
      lower.includes('stock') &&
      (lower.includes('set') || lower.includes('at') || lower.includes('make') || lower.includes('launch') || lower.includes('change') || lower.includes('put')))
  );
}

// 2. Test Storefront Decoration Intent (Theme only)
function isLaunchOrDecorate(rawText) {
  const lower = rawText.toLowerCase().trim();
  return (
    !lower.includes('book') &&
    !lower.includes('guide') &&
    !lower.includes('stock') &&
    ((lower.includes('launch') && (lower.includes('decorate') || lower.includes('impressive') || lower.includes('sparkle') || lower.includes('theme'))) ||
      (lower.includes('decorate') && (lower.includes('website') || lower.includes('storefront') || lower.includes('experience'))))
  );
}

// 3. Test Parameter Parsing
function parseBookLaunchParams(rawText) {
  const lower = rawText.toLowerCase().trim();

  let target = 'both';
  if (lower.includes('tamil') && !lower.includes('english') && !lower.includes('both')) {
    target = 'tamil';
  } else if (lower.includes('english') && !lower.includes('tamil') && !lower.includes('both')) {
    target = 'english';
  } else if (lower.includes('all') && !lower.includes('both') && !lower.includes('combo')) {
    target = 'all';
  }

  const stockMatch =
    rawText.match(/(?:at|with|to|=|is)?\s*(\d+)\s*(?:stock|copies|qty|quantity)\b/i) ||
    rawText.match(/(?:stock|qty|quantity)\s*(?:at|to|is|=)?\s*(\d+)\b/i) ||
    rawText.match(/\b(\d+)\s*stock\b/i);
  const stockQty = stockMatch ? parseInt(stockMatch[1], 10) : 100;

  const timeMatch = rawText.match(/(?:at\s+)?(today\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}(?::\d{2})?\s*(?:am|pm)|today\b)/i);
  const scheduledTime = timeMatch ? timeMatch[1].trim() : undefined;

  return { target, stockQty, scheduledTime };
}

// --- RUN TESTS ---

// Test A: Founder's exact phrase
const phrase1 = "launch books at today 6 pm both at 100 stock";
check(isBookLaunchCommand(phrase1) === true, 'Exact phrase matches Book Launch Command');
check(isLaunchOrDecorate(phrase1) === false, 'Exact phrase does NOT collide with Storefront Decoration');

const params1 = parseBookLaunchParams(phrase1);
check(params1.target === 'both', 'Target resolved to "both"');
check(params1.stockQty === 100, 'Stock resolved to 100');
check(params1.scheduledTime.toLowerCase() === 'today 6 pm', 'Scheduled time resolved to "today 6 pm"');

// Test B: Variant phrase
const phrase2 = "launch both books 100 stock";
check(isBookLaunchCommand(phrase2) === true, 'Variant phrase matches Book Launch Command');
check(isLaunchOrDecorate(phrase2) === false, 'Variant phrase does NOT trigger theme decoration');
const params2 = parseBookLaunchParams(phrase2);
check(params2.target === 'both', 'Variant target is "both"');
check(params2.stockQty === 100, 'Variant stock is 100');

// Test C: Storefront Decoration Only
const phrase3 = "Can you fully decorate the website and make the user experience impressive for launch?";
check(isBookLaunchCommand(phrase3) === false, 'Decoration phrase does NOT trigger Book Launch');
check(isLaunchOrDecorate(phrase3) === true, 'Decoration phrase correctly triggers Storefront Launch Theme');

// Test D: Single Medium Book Launch
const phrase4 = "launch tamil medium book at 50 stock today 4 pm";
check(isBookLaunchCommand(phrase4) === true, 'Single medium phrase matches Book Launch');
const params4 = parseBookLaunchParams(phrase4);
check(params4.target === 'tamil', 'Single medium target is "tamil"');
check(params4.stockQty === 50, 'Single medium stock is 50');
check(params4.scheduledTime.toLowerCase() === 'today 4 pm', 'Single medium time is "today 4 pm"');

console.log(`\n------------------------------------------------------`);
console.log(`📊 RESULTS: ${passed} Passed, ${failed} Failed (${passed + failed} Total)`);
console.log(`------------------------------------------------------`);

if (failed > 0) process.exit(1);

