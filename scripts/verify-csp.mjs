import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');

// Extract scriptSrc, scriptSrcElem, and the CSP value array
const scriptSrcMatch = src.match(/const\s+scriptSrc\s*=\s*\[([\s\S]*?)\]/);
const scriptSrcElemMatch = src.match(/const\s+scriptSrcElem\s*=\s*\[([\s\S]*?)\]/);
const cspArrayMatch = src.match(/key:\s*"Content-Security-Policy",[\s\S]*?value:\s*\[([\s\S]*?)\]\.join/);

if (!cspArrayMatch) {
  console.error('CSP block not found');
  process.exit(1);
}

const extractStrings = (raw) => (raw ? [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]) : []);

const scriptSrc = extractStrings(scriptSrcMatch ? scriptSrcMatch[1] : '').join(' ');
const scriptSrcElem = extractStrings(scriptSrcElemMatch ? scriptSrcElemMatch[1] : '').join(' ');
const arrayItems = extractStrings(cspArrayMatch[1]);

// Assemble full CSP string matching runtime execution
const parts = [
  ...arrayItems,
  scriptSrc,
  scriptSrcElem,
].filter(Boolean);

const joined = parts.join('; ');
console.log(joined);
console.log('---');
const checks = {
  'cdn in script-src': /script-src[^;]*cdn\.razorpay\.com/.test(joined),
  'cdn in script-src-elem': /script-src-elem[^;]*cdn\.razorpay\.com/.test(joined),
  'cdn in connect-src': /connect-src[^;]*cdn\.razorpay\.com/.test(joined),
};
for (const [label, ok] of Object.entries(checks)) {
  console.log(`${label}: ${ok}`);
}
if (Object.values(checks).some((v) => !v)) process.exit(1);

