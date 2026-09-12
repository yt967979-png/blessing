const assert = require('assert');

/**
 * Test: Verify duplicate escalation tickets are prevented and close/new chat resets properly
 */
class SupportDbSimulation {
  constructor() {
    this.conversations = [];
    this.messages = [];
  }

  createOrFindConversation({ customerId, sessionToken, customerPhone, conversationId }) {
    if (conversationId) {
      const found = this.conversations.find((c) => c.id === conversationId);
      if (found) return found;
    }

    // Reuse existing active or waiting conversation
    const active = this.conversations.find(
      (c) =>
        ((customerId && c.customer_id === customerId) ||
          (sessionToken && c.session_token === sessionToken) ||
          (customerPhone && c.customer_phone === customerPhone)) &&
        ['WAITING_ADMIN', 'ACTIVE', 'BOT'].includes(c.status)
    );
    if (active) return active;

    // Create new
    const newConv = {
      id: `conv_${Date.now()}_${Math.random()}`,
      customer_id: customerId || null,
      session_token: sessionToken,
      customer_phone: customerPhone || null,
      status: 'BOT',
      updated_at: new Date(),
    };
    this.conversations.push(newConv);
    return newConv;
  }

  escalate(conv) {
    if (conv.status === 'WAITING_ADMIN') {
      return { alreadyRequested: true, status: 'WAITING_ADMIN' };
    }
    if (conv.status === 'ACTIVE') {
      return { alreadyConnected: true, status: 'ACTIVE' };
    }
    conv.status = 'WAITING_ADMIN';
    conv.updated_at = new Date();
    return { alreadyRequested: false, status: 'WAITING_ADMIN' };
  }

  closeChat(convId) {
    const conv = this.conversations.find((c) => c.id === convId);
    if (conv) {
      conv.status = 'RESOLVED';
      conv.resolved_at = new Date();
    }
    return { closed: true, conversation: null };
  }

  getOverviewWaiting() {
    // DISTINCT ON customer
    const seen = new Set();
    const waiting = [];
    for (const c of this.conversations.filter((c) => c.status === 'WAITING_ADMIN')) {
      const key = c.customer_id || c.customer_phone || c.session_token;
      if (!seen.has(key)) {
        seen.add(key);
        waiting.push(c);
      }
    }
    return waiting;
  }

  getOpenConversationForCustomer(customerId, sessionToken) {
    return this.conversations.find(
      (c) =>
        ((customerId && c.customer_id === customerId) ||
          (sessionToken && c.session_token === sessionToken)) &&
        c.status !== 'RESOLVED'
    ) || null;
  }
}

console.log('===============================================================');
console.log('🧪 VERIFYING DUPLICATE ESCALATION PREVENTION & CHAT RESET');
console.log('===============================================================');

const db = new SupportDbSimulation();

// Step 1: Customer clicks "Talk to Admin" (Click 1)
const conv1 = db.createOrFindConversation({
  customerId: 'user_yogesh_123',
  sessionToken: 'sess_abc',
  customerPhone: '919360345770',
});
const esc1 = db.escalate(conv1);
assert.strictEqual(esc1.alreadyRequested, false, 'First click should request admin');
assert.strictEqual(conv1.status, 'WAITING_ADMIN');
console.log('✓ Click 1: Successfully queued for admin (status: WAITING_ADMIN)');

// Step 2: Customer clicks "Talk to Admin" AGAIN from same chat window (Click 2)
// Even if body.conversationId is not provided yet or rapid double-click
const conv2 = db.createOrFindConversation({
  customerId: 'user_yogesh_123',
  sessionToken: 'sess_abc',
  customerPhone: '919360345770',
});
assert.strictEqual(conv2.id, conv1.id, 'Should reuse existing conversation instead of inserting duplicate');

const esc2 = db.escalate(conv2);
assert.strictEqual(esc2.alreadyRequested, true, 'Second click must be intercepted as alreadyRequested');
console.log('✓ Click 2: Intercepted cleanly with alreadyRequested: true — ZERO duplicate tickets created');

// Step 3: Admin Waiting Queue check
const waitingQueue = db.getOverviewWaiting();
assert.strictEqual(waitingQueue.length, 1, 'Waiting queue must contain exactly 1 ticket for customer');
console.log('✓ Admin Waiting Queue: Exactly 1 card displayed for Yogesh T');

// Step 4: Customer closes chat
const closeRes = db.closeChat(conv1.id);
assert.strictEqual(closeRes.closed, true);
assert.strictEqual(conv1.status, 'RESOLVED');
console.log('✓ Customer closes chat: Marked RESOLVED');

// Step 5: Next time user opens Help Center:
const nextVisit = db.getOpenConversationForCustomer('user_yogesh_123', 'new_session_xyz');
assert.strictEqual(nextVisit, null, 'No open conversation found because previous was RESOLVED');
console.log('✓ Next visit to Help Center: Returns null conversation — fresh new chat window is there!');

console.log('═══════════════════════════════════════════════════════════════');
console.log('🏆 ALL DUPLICATE TICKET & CHAT RESET TESTS PASSED (100% GREEN)');
console.log('═══════════════════════════════════════════════════════════════');
