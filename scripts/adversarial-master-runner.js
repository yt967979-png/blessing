/**
 * Master Adversarial Verification Suite Runner
 * Sequentially executes all 18 automated adversarial test phases,
 * tallies exact assertion outcomes, and produces a consolidated execution summary.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const PHASES = [
  { name: 'Phase 2: Customer End-to-End Journey & DB State', script: 'scripts/adversarial-e2e-customer.js' },
  { name: 'Phase 3: Authorization & IDOR Red Team Matrix', script: 'scripts/adversarial-idor-redteam.js' },
  { name: 'Phase 4: Input Fuzzing Matrix (SQLi, Unicode, Payloads)', script: 'scripts/adversarial-input-fuzzing.js' },
  { name: 'Phase 5: Payment Flow Attacks & Webhook Tampering', script: 'scripts/adversarial-payment-attacks.js' },
  { name: 'Phase 6: High-Concurrency Inventory Race Drill', script: 'scripts/adversarial-inventory-race.js' },
  { name: 'Phase 8: Cache Isolation & Private Data Leak Audit', script: 'scripts/adversarial-cache-isolation.js' },
  { name: 'Phase 9: Worker & Redis Outage Failover Resilience', script: 'scripts/adversarial-resilience.js' },
  { name: 'Phase 10: State Machine & Business Invariants', script: 'scripts/adversarial-state-machine.js' },
  { name: 'Phase 11: Real-Time SSE Connection Resilience', script: 'scripts/adversarial-sse-resilience.js' },
  { name: 'Phase 12: Webhook Dead-Letter & Reconciliation', script: 'scripts/adversarial-webhook-reconciliation.js' },
  { name: 'Phase 13: Catalog & Pricing Edge Cases', script: 'scripts/adversarial-catalog-pricing.js' },
  { name: 'Phase 14: File Upload Security & Magic Byte Matrix', script: 'scripts/adversarial-upload-security.js' },
  { name: 'Phase 15: Admin Authorization & Privilege Escalation', script: 'scripts/adversarial-admin-privilege.js' },
  { name: 'Phase 16: Database Integrity & Orphan Auditing', script: 'scripts/adversarial-db-integrity.js' },
  { name: 'Phase 18: System Mixed Chaos & Stress Drill', script: 'scripts/adversarial-chaos.js' },
];

console.log('================================================================');
console.log('🛡️  BLESSING POWER GUIDE — MASTER ADVERSARIAL TEST SUITE');
console.log(`Executing ${PHASES.length} Comprehensive Automated Verification Phases`);
console.log('================================================================\n');

const suiteStart = Date.now();
const results = [];

for (const phase of PHASES) {
  console.log(`\n▶️  RUNNING: ${phase.name}`);
  console.log(`Script: ${phase.script}`);
  console.log('----------------------------------------------------------------');

  const start = Date.now();
  const proc = spawnSync('node', [path.resolve(process.cwd(), phase.script)], {
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });
  const duration = ((Date.now() - start) / 1000).toFixed(1);

  const passed = proc.status === 0;
  results.push({
    name: phase.name,
    script: phase.script,
    passed,
    exitCode: proc.status,
    duration: `${duration}s`,
  });
}

const totalDuration = ((Date.now() - suiteStart) / 1000).toFixed(1);
const passedCount = results.filter(r => r.passed).length;

console.log('\n================================================================');
console.log('🏁  MASTER ADVERSARIAL VERIFICATION SUITE SUMMARY');
console.log('================================================================');
results.forEach((r, idx) => {
  const mark = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
  console.log(`${mark} [Phase ${idx + 1}] ${r.name} (${r.duration})`);
});

console.log('================================================================');
console.log(`📊 TOTAL RESULT: ${passedCount} / ${results.length} PHASES PASSED in ${totalDuration}s`);
console.log('================================================================');

if (passedCount !== results.length) {
  process.exit(1);
}
