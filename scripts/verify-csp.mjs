import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
const match = src.match(/key:\s*"Content-Security-Policy",[\s\S]*?value:\s*\[([\s\S]*?)\]\.join/);
if (!match) {
  console.error('CSP block not found');
  process.exit(1);
}
const parts = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
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
