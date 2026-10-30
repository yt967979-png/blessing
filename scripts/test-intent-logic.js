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

// ── Test E: Precision Scheduler Engine (User's Exact Telegram Test Cases) ──
function parseTimeInIST(timeStr, refDate = new Date()) {
  if (!timeStr) return null;
  const clean = timeStr.trim().toLowerCase();
  const match = clean.match(/(\d{1,2})(?:[:.\s](\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  let m = match[2] ? parseInt(match[2], 10) : 0;
  const mer = match[3] ? match[3].toLowerCase() : null;
  if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) return null;

  const istOffset = 5.5 * 3600 * 1000;
  const istNow = new Date(refDate.getTime() + istOffset);
  const curHours = istNow.getUTCHours();
  const curMinutes = istNow.getUTCMinutes();
  const curSeconds = istNow.getUTCSeconds();

  if (mer === 'pm' && h < 12) h += 12;
  else if (mer === 'am' && h === 12) h = 0;
  else if (!mer && h <= 12) {
    if (curHours >= 12 && h < 12) h += 12;
    else if (curHours < 12 && (h < curHours || (h === curHours && m < curMinutes))) h += 12;
  }

  const diffH = h - curHours;
  const diffM = m - curMinutes;
  const diffS = -curSeconds;
  const diffMs = (diffH * 3600 + diffM * 60 + diffS) * 1000;
  const targetDate = new Date(refDate.getTime() + diffMs);

  const formatted12h = targetDate.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return { hours: h, minutes: m, targetDate, diffMs, formatted12h };
}

function parseScheduleInstruction(rawText, refDate = new Date()) {
  const lower = rawText.toLowerCase();

  const isReschedule =
    lower.includes('change') ||
    lower.includes('chajneg') ||
    lower.includes('chaneg') ||
    lower.includes('update') ||
    lower.includes('reschedule') ||
    lower.includes('modify') ||
    lower.includes('move');

  let target = 'both';
  if (lower.includes('tamil') && !lower.includes('english') && !lower.includes('both')) target = 'tamil';
  else if (lower.includes('english') && !lower.includes('tamil') && !lower.includes('both')) target = 'english';
  else if (lower.includes('all') && !lower.includes('both') && !lower.includes('combo')) target = 'all';

  const stockMatch =
    rawText.match(/(?:at|with|to|=|is)?\s*(\d+)\s*(?:stock|copies|qty|quantity)\b/i) ||
    rawText.match(/(?:stock|qty|quantity)\s*(?:at|to|is|=)?\s*(\d+)\b/i) ||
    rawText.match(/\b(\d+)\s*stock\b/i);
  const stockQty = stockMatch ? parseInt(stockMatch[1], 10) : 100;

  let launchTimeStr = null;
  let revertTimeStr = null;

  const revertSplit = rawText.split(/\b(?:revert|comming soon|coming soon)\b/i);
  if (revertSplit.length > 1) {
    const launchPart = revertSplit[0];
    const revertPart = revertSplit.slice(1).join(' ');

    const launchMatch =
      launchPart.match(/(?:at|to|time\s+to|for)\s*(?:today\s+)?(\d{1,2}(?:[:.\s]\d{2})?\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))/i) ||
      launchPart.match(/\b(\d{1,2}[:.]\d{2})\b/i) ||
      launchPart.match(/\b(\d{1,2}\s+\d{2})\b/i);
    if (launchMatch) launchTimeStr = launchMatch[1].trim();

    const revertMatch =
      revertPart.match(/(?:at|in|to)\s*(?:today\s+)?(\d{1,2}(?:[:.\s]\d{2})?\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))/i) ||
      revertPart.match(/\b(\d{1,2}[:.]\d{2})\b/i) ||
      revertPart.match(/\b(\d{1,2}\s+\d{2})\b/i) ||
      revertPart.match(/\b(\d{1,2}\s*(?:am|pm))\b/i);
    if (revertMatch) revertTimeStr = revertMatch[1].trim();
  } else {
    const launchMatch =
      rawText.match(/(?:at|to|time\s+to|for)\s*(?:today\s+)?(\d{1,2}(?:[:.\s]\d{2})?\s*(?:am|pm)?|\d{1,2}\s*(?:am|pm))/i) ||
      rawText.match(/\b(\d{1,2}[:.]\d{2})\b/i) ||
      rawText.match(/\b(\d{1,2}\s+\d{2})\b/i);
    if (launchMatch) launchTimeStr = launchMatch[1].trim();
  }

  const launchParsed = launchTimeStr ? parseTimeInIST(launchTimeStr, refDate) : null;
  const revertParsed = revertTimeStr ? parseTimeInIST(revertTimeStr, refDate) : null;

  const isScheduleRequest = Boolean(
    (lower.includes('launch') ||
      lower.includes('lauch') ||
      lower.includes('launcgh') ||
      lower.includes('lunch') ||
      lower.includes('revert') ||
      lower.includes('coming soon') ||
      lower.includes('comming soon') ||
      isReschedule) &&
      (launchParsed || revertParsed)
  );

  return { isScheduleRequest, isReschedule, target, stockQty, launchTimeStr, launchParsed, revertTimeStr, revertParsed };
}

// Simulated reference date: 2026-10-30 13:50:00 IST (08:20:00 UTC)
const refIST = new Date('2026-10-30T08:20:00.000Z');

// Test Case 1: "can you lauch book at 1 55 and revert to comming soon in  1 56"
const testPhrase1 = "can you lauch book at 1 55 and revert to comming soon in  1 56";
const sched1 = parseScheduleInstruction(testPhrase1, refIST);
check(sched1.isScheduleRequest === true, 'Sched1: Identified as schedule request despite typo "lauch"');
check(sched1.isReschedule === false, 'Sched1: Correctly identified as new schedule (not reschedule)');
check(sched1.launchParsed !== null, 'Sched1: Launch time parsed');
check(sched1.launchParsed.hours === 13 && sched1.launchParsed.minutes === 55, 'Sched1: Launch resolved to 13:55 (1:55 PM IST)');
check(sched1.revertParsed !== null, 'Sched1: Revert time parsed');
check(sched1.revertParsed.hours === 13 && sched1.revertParsed.minutes === 56, 'Sched1: Revert resolved to 13:56 (1:56 PM IST)');
check(sched1.launchParsed.diffMs === 5 * 60 * 1000, 'Sched1: Launch diff is exactly 5 minutes (300,000ms)');
check(sched1.revertParsed.diffMs === 6 * 60 * 1000, 'Sched1: Revert diff is exactly 6 minutes (360,000ms)');

// Test Case 2: "can you chajneg the launcgh time to 1 52 revert in 1 53"
const testPhrase2 = "can you chajneg the launcgh time to 1 52 revert in 1 53";
const sched2 = parseScheduleInstruction(testPhrase2, refIST);
check(sched2.isScheduleRequest === true, 'Sched2: Identified as schedule request despite typos "chajneg", "launcgh"');
check(sched2.isReschedule === true, 'Sched2: Correctly identified as reschedule/change');
check(sched2.launchParsed !== null, 'Sched2: Launch time parsed');
check(sched2.launchParsed.hours === 13 && sched2.launchParsed.minutes === 52, 'Sched2: Launch resolved to 13:52 (1:52 PM IST)');
check(sched2.revertParsed !== null, 'Sched2: Revert time parsed');
check(sched2.revertParsed.hours === 13 && sched2.revertParsed.minutes === 53, 'Sched2: Revert resolved to 13:53 (1:53 PM IST)');
check(sched2.launchParsed.diffMs === 2 * 60 * 1000, 'Sched2: Launch diff is exactly 2 minutes (120,000ms)');
check(sched2.revertParsed.diffMs === 3 * 60 * 1000, 'Sched2: Revert diff is exactly 3 minutes (180,000ms)');

console.log(`\n------------------------------------------------------`);
console.log(`📊 RESULTS: ${passed} Passed, ${failed} Failed (${passed + failed} Total)`);
console.log(`------------------------------------------------------`);

if (failed > 0) process.exit(1);

