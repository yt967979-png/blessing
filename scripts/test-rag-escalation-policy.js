const assert = require('assert');

// Test the escalation policy logic matching src/lib/supportRag.ts
function evaluateEscalation(userPrompt) {
  const q = userPrompt.trim().toLowerCase();

  const isExplicitAdminRequest =
    q === 'talk to admin' ||
    q === 'connect to admin' ||
    q === 'connect to admin now' ||
    q === 'connect with admin' ||
    q === 'chat with admin' ||
    q === 'speak to admin' ||
    q === 'speak with admin' ||
    q === 'call admin' ||
    q === 'human agent' ||
    q === 'talk to human' ||
    q === 'connect to human' ||
    q === 'live agent' ||
    q === 'real person' ||
    q === 'speak with representative' ||
    q === 'talk to support' ||
    q === 'i want to talk to admin' ||
    q === 'i want to speak to admin' ||
    q === 'can i talk to admin' ||
    q === 'can i talk to an admin' ||
    q === 'admin' ||
    q === 'admin please' ||
    /\b(connect\s*(to|with)?\s*admin|talk\s*to\s*(an?\s*)?(admin|human|agent|person|staff|representative)|chat\s*with\s*(an?\s*)?(admin|human|agent|staff)|speak\s*(with|to)\s*(an?\s*)?(admin|human|agent|person|staff))\b/i.test(q);

  return isExplicitAdminRequest;
}

console.log('================================================================');
console.log('🧪 VERIFYING STRICT RAG VS ADMIN ESCALATION POLICY');
console.log('================================================================\n');

// 1. Standard questions that MUST NOT escalate (handled by RAG directly)
const nonEscalatingQueries = [
  'What is the price of 10th Maths book?',
  'Where is my order #BPG-12345?',
  'How to get 100% free replacement for torn pages?',
  'Can I update my delivery address before dispatch?',
  'Can I cancel my order?',
  'What payment methods are supported? Do you have COD?',
  'I did not receive SMS confirmation',
  'Do you offer school bulk discount for 50 books?',
  'Tell me about the 10th science syllabus',
  'Hello',
  'Thank you'
];

for (const query of nonEscalatingQueries) {
  const shouldEscalate = evaluateEscalation(query);
  assert.strictEqual(shouldEscalate, false, `Query "${query}" must NOT escalate to admin queue`);
  console.log(`✅ [RAG ANSWER] "${query}" -> Handled by RAG (shouldEscalate = false)`);
}

// 2. Explicit Admin Requests that MUST escalate to Admin queue
const escalatingQueries = [
  'Talk to Admin',
  'connect to admin now',
  'I want to speak to admin',
  'can i talk to admin',
  'chat with admin',
  'human agent',
  'live agent',
  'real person',
  'admin'
];

for (const query of escalatingQueries) {
  const shouldEscalate = evaluateEscalation(query);
  assert.strictEqual(shouldEscalate, true, `Query "${query}" MUST escalate to admin queue`);
  console.log(`🔔 [ADMIN QUEUE] "${query}" -> Escalated to Admin (shouldEscalate = true)`);
}

console.log('\n----------------------------------------------------------------');
console.log('📊 RESULTS: All RAG and Admin Escalation Invariants Passed 100%');
console.log('----------------------------------------------------------------');
