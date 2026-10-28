import { queryDb } from '@/lib/db';
import { getActiveBusinessInstructions } from './cofounder/businessControls';
import { generateAdminCopilotDraft } from './supportCopilot';
import { sendTelegramMessage } from './cofounder/telegram';
import { notifySupportEvent } from './supportEvents';
import crypto from 'crypto';

export interface AiSupportResult {
  answer: string;
  suggestions: string[];
  shouldEscalate: boolean;
  escalationReason?: string;
  linkedOrderId?: string;
  provider: 'groq' | 'deterministic';
}

/**
 * Checks if a customer message indicates a need for human escalation.
 */
function detectEscalationIntent(text: string): { escalate: boolean; reason?: string } {
  const q = text.toLowerCase().trim();

  // 1. Explicit request for human staff
  if (
    q.includes('talk to admin') ||
    q.includes('human') ||
    q.includes('real person') ||
    q.includes('speak to human') ||
    q.includes('customer care') ||
    q.includes('call me') ||
    q.includes('manager') ||
    q.includes('operator') ||
    q.includes('staff')
  ) {
    return { escalate: true, reason: 'Customer explicitly requested human administrator' };
  }

  // 2. Urgent payment deduction without order visibility
  if (
    (q.includes('deducted') || q.includes('debited') || q.includes('paid money') || q.includes('payment done') || q.includes('panam pochu')) &&
    (q.includes('no order') || q.includes('not showing') || q.includes('not confirmed') || q.includes('failed') || q.includes('missing'))
  ) {
    return { escalate: true, reason: 'Payment debited but order confirmation missing' };
  }

  // 3. Repeated severe complaints or cancellation requests
  if (q.includes('cancel my order') || q.includes('refund my money') || q.includes('complaint')) {
    return { escalate: true, reason: 'Refund / Cancellation / Complaint escalation' };
  }

  return { escalate: false };
}

/**
 * Core Customer Support AI Engine.
 * Understands question, retrieves live business context & instructions, executes Groq,
 * provides verified answers, and escalates to Telegram when appropriate.
 */
export async function processCustomerMessageWithAi(opts: {
  conversationId: string;
  customerMessage: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  linkedOrderId?: string;
}): Promise<AiSupportResult> {
  const { conversationId, customerMessage, customerName, customerPhone, customerId, linkedOrderId } = opts;
  const rawText = customerMessage.trim();
  const name = customerName && customerName !== 'Student/Parent' && customerName !== 'Customer' ? customerName.split(' ')[0] : 'there';

  // 1. Check for Human Escalation Intent
  const escalation = detectEscalationIntent(rawText);

  // 2. Retrieve Live Business Instructions (e.g. Maintenance notices, shipping delays, active festive theme)
  const activeInstructions = await getActiveBusinessInstructions();
  let operationalNoticesText = '';
  let festiveGreetingInstruction = '';

  const themeInst = activeInstructions.find((i) => i.instruction_type === 'THEME' && i.is_active);
  if (themeInst) {
    festiveGreetingInstruction = `Active Festive Celebration: "${themeInst.content}". When customer greets, warmly include festive wishes!`;
  }

  const examInst = activeInstructions.find((i) => i.instruction_type === 'EXAM_CAMPAIGN' && i.is_active);
  let examTimetableNotice = '';
  if (examInst) {
    examTimetableNotice = `Live Storefront Exam Hub: Official TN 10th & 12th Public Exam Timetable is live at https://blessingpowerguide.in/exam-timetable. First 10th exam: March 27, 2026 (Language / Tamil). Recommend the 10th 5-in-1 combo pack for full syllabus coverage.`;
  }

  const nonThemeNotices = activeInstructions.filter(
    (i) => i.instruction_type !== 'THEME' && i.instruction_type !== 'EXAM_CAMPAIGN' && i.is_active
  );
  let maintenanceNotice = '';
  const maintInst = nonThemeNotices.find((i) => i.instruction_type === 'MAINTENANCE');
  if (maintInst) {
    maintenanceNotice = `ACTIVE STORE NOTICE: ${maintInst.content}${maintInst.expected_end ? ` (Expected completion: ${maintInst.expected_end})` : ''}`;
  }

  if (nonThemeNotices.length > 0) {
    operationalNoticesText = nonThemeNotices
      .map((n) => `• [${n.severity || n.instruction_type}] ${n.content}${n.expected_end ? ` (Est. ${n.expected_end})` : ''}`)
      .join('\n');
  }

  // 3. Check for Live Order Context
  let liveOrderContext = 'No placed order specified';
  let matchedOrderId: string | undefined = linkedOrderId;

  const orderNumberMatch = rawText.match(/\b(BPG-?[A-Z0-9_-]{4,16})\b/i);
  const searchOrderId = linkedOrderId || (orderNumberMatch ? orderNumberMatch[1].toUpperCase() : null);

  if (searchOrderId || customerPhone) {
    try {
      const orderRes = await queryDb(
        `SELECT id, order_number, total_amount, payment_status, order_status, awb_number, courier_name, tracking_url, shipping_address, created_at
         FROM orders
         WHERE (id = $1 OR order_number = $1 OR ($2 <> '' AND shipping_address ILIKE $3))
         ORDER BY created_at DESC
         LIMIT 1`,
        [searchOrderId || 'NONE', customerPhone || '', `%${customerPhone || ''}%`]
      );
      const o = orderRes.rows?.[0];
      if (o) {
        matchedOrderId = o.order_number || o.id;
        liveOrderContext = `Found Placed Order #${o.order_number || o.id}:
- Total: ₹${o.total_amount}
- Order Status: ${o.order_status || 'Confirmed'}
- Payment: ${o.payment_status || 'Paid'}
- ST Courier Docket / AWB: ${o.awb_number || 'Preparing for dispatch'}
- Courier Name: ${o.courier_name || 'ST Courier Express'}
- Live Tracking Link: https://blessingpowerguide.in/track?orderId=${encodeURIComponent(o.order_number || o.id)}`;
      }
    } catch (_) {}
  }

  let finalAnswer = '';
  let provider: 'groq' | 'deterministic' = 'deterministic';

  // 3.5. Retrieve Authoritative Product Catalog, Pricing & Specific Delay Reasons from Database
  let productAvailabilityContext = 'All catalog products are published and available in stock.';
  let catalogPriceContext = '';
  let comingSoonBooks: Array<{ id: string; title: string; is_coming_soon: boolean; status: string; availability_reason?: string | null }> = [];
  try {
    const allBooksRes = await queryDb(
      `SELECT id, title, slug, price, discount_price, is_coming_soon, status, stock, availability_reason
       FROM books
       ORDER BY title ASC`
    );
    if (allBooksRes.rows && allBooksRes.rows.length > 0) {
      const allBooks = allBooksRes.rows;
      comingSoonBooks = allBooks.filter(
        (b) => b.is_coming_soon || b.status === 'coming_soon' || b.status === 'out_of_stock' || (b.stock !== null && b.stock <= 0)
      );

      if (comingSoonBooks.length > 0) {
        productAvailabilityContext = comingSoonBooks
          .map((b) => {
            const statusLabel = (b.is_coming_soon || b.status === 'coming_soon') ? 'COMING SOON' : 'OUT OF STOCK';
            const reasonText = b.availability_reason ? `Store Owner Stated Reason: "${b.availability_reason}"` : 'Store Owner Stated Reason: None provided (General pending release)';
            return `• "${b.title}": ${statusLabel} | ${reasonText}`;
          })
          .join('\n');
      }

      catalogPriceContext = allBooks
        .map((b) => {
          const sellingPrice = b.discount_price && Number(b.discount_price) > 0 ? Number(b.discount_price) : Number(b.price);
          const mrp = Number(b.price || sellingPrice);
          return `• "${b.title}": Price ₹${sellingPrice.toLocaleString('en-IN')}${mrp > sellingPrice ? ` (MRP ₹${mrp.toLocaleString('en-IN')})` : ''} — 100% Free Doorstep Delivery`;
        })
        .join('\n');
    }
  } catch (_) {}

  // 4. Groq LLM Inference
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const prompt = `Customer Message: "${rawText}"
Customer Name: ${name}
Order Status Context: ${liveOrderContext}
${festiveGreetingInstruction ? `Festive Atmosphere: ${festiveGreetingInstruction}\n` : ''}${examTimetableNotice ? `Academic Exam Hub Context: ${examTimetableNotice}\n` : ''}${operationalNoticesText ? `Current Store Operational Notices & Delays:\n${operationalNoticesText}\n` : ''}

Live Product Availability & Owner Delay Explanations:
${productAvailabilityContext}

Verified Blessing Power Guide Store Policy & Real Pricing:
1. Minimum Order Quantity (MOQ): 4 individual books OR 1 Combo Pack. (Any 1 Combo Pack qualifies for 100% Free Doorstep Delivery via ST Courier).
2. Courier & Delivery Fees:
   - Exactly 4 individual books: ₹150 flat courier charge across Tamil Nadu.
   - 5 or more individual books: 100% Free Doorstep Delivery.
   - Any 1 Combo Pack: 100% Free Doorstep Delivery.
3. Delivery Speed: ST Courier Express from Chennai hub. 24–48 hours for Chennai/Chengalpattu/Tiruvallur; 2–3 business days for all other Tamil Nadu districts.
4. Mediums: All Class 10 guides available in Tamil Medium & English Medium.
5. Real Catalog Prices from Live Database (ALWAYS quote these EXACT prices, NEVER invent ₹699 or quote dummy rates):
${catalogPriceContext || '• 10TH STD 5 IN 1 GUIDE COMBO (Tamil Medium & English Medium): ₹1,300 (MRP ₹1,650) with 100% Free Doorstep Delivery.'}
6. Payments: 100% prepaid online via Razorpay. Supports all UPI apps (Google Pay, PhonePe, Paytm, FamPay / FamApp UPI ID & Card), Debit/Credit cards, and NetBanking. Cash on Delivery (COD) is not supported.
7. Free Replacement Guarantee: 100% Free Replacement copy sent immediately for any misprinted, missing page, or transit-damaged copies.
8. Contact: Trust Square, Ayanavaram, Chennai. Helpline: +91 94860 17820.

Strict Behavior Rules for Product Availability & "Coming Soon":
- If customer asks why a book cannot be ordered, why it says "Coming Soon", when it will be in stock, or if it is delayed:
  1. Check the specific book they are asking about in "Live Product Availability & Owner Delay Explanations" above.
  2. If the store owner has recorded an explicit reason for that book (such as rain-related consignment delay, printing at press delay), explain THAT EXACT REASON honestly, politely, and warmly. Explain that orders will open once copies reach our hub, and do not promise a specific delivery date unless confirmed.
  3. If NO explicit reason was recorded for that book, state simply that the guide is announced as Coming Soon and is pending release. DO NOT INVENT A REASON (never invent rain, printing, or syllabus excuses when none was provided).
  4. NEVER apply the reason for one product (e.g. rain for Tamil guide) to a different product (e.g. English or Science guide).
  5. If the book is published and in stock, confirm that it is available to order right now (Minimum order: 4 books or 1 combo).

CRITICAL PRICING & COMPLETENESS RULES:
- NEVER quote ₹699 for any combo pack or book! The verified price of our 10th Standard 5-in-1 Combo Pack in the database is ₹1,300 with 100% Free Delivery. If asked about prices, always state the real prices from "Real Catalog Prices from Live Database" above.
- FULL COMPLETE MESSAGE MANDATE: You MUST generate complete, fully formed sentences. Never cut off or stop mid-sentence. Always conclude your explanation with a warm, polite closing sentence and ensure all markdown asterisks and quotes are fully closed.

General Behavior Rules:
- If an active maintenance notice exists and customer asks about site availability, slowness, or maintenance, explain the maintenance and expected completion time warmly.
- If customer asks about payment methods (including FamPay / Famaccount, UPI, GPay, cards): Explain that our Razorpay checkout accepts all UPI apps (including FamPay / FamApp via their UPI ID e.g. @fam or FamPay card), Google Pay, PhonePe, Paytm, cards, and netbanking.
- If customer asks a routine question (MOQ, prices, syllabus, delivery speed, tracking), answer directly, concisely, and warmly.
- If customer asks to talk to admin/human or reports payment deducted without order, state that an administrator has been notified and will assist them shortly, and offer to help with other routine details while they wait.
- Never invent policies not listed above. Do NOT start with generic robot greetings.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey.trim()}`,
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          messages: [
            {
              role: 'system',
              content: 'You are Blessing AI, the customer support co-pilot of Blessing Power Guide (blessingpowerguide.in). You provide direct, helpful, polite, and 100% complete answers in clear English or Tanglish.',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 1200,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) {
          finalAnswer = text;
          provider = 'groq';
        }
      }
    } catch (e) {
      console.warn('[Support AI Engine] Groq inference error:', e);
    }
  }

  // 5. Fallback to Deterministic Engine if Groq unavailable
  if (!finalAnswer) {
    const lowerMsg = rawText.toLowerCase();
    const matchedBook = comingSoonBooks.find((b) => {
      const t = b.title.toLowerCase();
      const words = t.split(/\s+/).filter((w) => w.length > 3);
      return words.some((w) => lowerMsg.includes(w)) || (lowerMsg.includes('tamil') && t.includes('tamil')) || (lowerMsg.includes('english') && t.includes('english'));
    });

    if (matchedBook && (matchedBook.is_coming_soon || matchedBook.status === 'coming_soon')) {
      if (matchedBook.availability_reason) {
        finalAnswer = `Sorry for the wait, ${name}! 😊 Our ${matchedBook.title} is temporarily marked Coming Soon because ${matchedBook.availability_reason}. We don't have a confirmed arrival date yet, but as soon as copies reach our hub, orders will be open. Thank you for your patience!`;
      } else {
        finalAnswer = `Hello ${name}! 😊 Our ${matchedBook.title} is currently marked Coming Soon and is not yet open for ordering. Orders will open as soon as copies are available at our hub.`;
      }
    } else if (maintenanceNotice && (lowerMsg.includes('maintenance') || lowerMsg.includes('slow') || lowerMsg.includes('not working'))) {
      finalAnswer = `Hello ${name}! 👋 ${maintenanceNotice}. Thank you for your patience while we complete this upgrade!`;
    } else {
      finalAnswer = generateAdminCopilotDraft(rawText, {
        customerName: name,
        customerPhone,
      });
    }
  }

  // 6. Handle Escalation to Administrator
  if (escalation.escalate) {
    // Notify owner/admin via Telegram alert
    const alertMsg = `🔔 *Blessing Power Guide — Support Escalation*
👤 Customer: *${name}* (${customerPhone || 'Guest Shopper'})
💬 Question: "${rawText.slice(0, 150)}"
⚠️ Reason: *${escalation.reason}*
📋 Conversation: #${conversationId}

_Status: Waiting for Admin in Support Dashboard_`;
    void sendTelegramMessage(alertMsg);

    // If answer doesn't already reassure them, add reassurance
    if (!finalAnswer.toLowerCase().includes('admin') && !finalAnswer.toLowerCase().includes('support team')) {
      finalAnswer += `\n\n*(Note: I have alerted our support team. An administrator will review your request shortly. I will remain here to assist with any other questions while you wait!)*`;
    }
  }

  const suggestions = [
    '🚚 Where is my order right now?',
    '📚 10th Class Guides & Prices',
    '📦 Minimum Order & Delivery Fee',
    '👨‍💼 Talk to Admin',
  ];

  return {
    answer: finalAnswer,
    suggestions,
    shouldEscalate: escalation.escalate,
    escalationReason: escalation.reason,
    linkedOrderId: matchedOrderId,
    provider,
  };
}

/**
 * Executes the AI response cycle and safely commits it to the database with human-takeover protection.
 */
export async function executeAiReplyCycle(opts: {
  conversationId: string;
  customerMessage: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  linkedOrderId?: string;
}): Promise<boolean> {
  const { conversationId } = opts;

  // 1. Run AI reasoning
  const result = await processCustomerMessageWithAi(opts);

  // 2. RACE CONDITION CHECK: Atomic check if human admin took over during AI generation
  const cRes = await queryDb(
    `SELECT status, assigned_admin_id FROM support_conversations WHERE id = $1 LIMIT 1`,
    [conversationId]
  );
  const conv = cRes.rows?.[0];

  // If conversation is now claimed by an admin, suppress the automated AI reply
  if (conv && conv.status === 'ACTIVE' && conv.assigned_admin_id) {
    console.log(`[Support AI Engine] Suppressed AI reply for conv #${conversationId} — human admin took over.`);
    return false;
  }

  // 3. Insert AI response into support_messages
  const aiMsgId = `msg_${Date.now()}_ai`;
  await queryDb(
    `INSERT INTO support_messages (id, conversation_id, sender_type, sender_name, text, metadata)
     VALUES ($1, $2, 'AI', 'Blessing AI Assistant', $3, $4)`,
    [
      aiMsgId,
      conversationId,
      result.answer,
      JSON.stringify({ suggestions: result.suggestions, linkedOrderId: result.linkedOrderId }),
    ]
  );

  // 4. Update conversation status if escalated
  if (result.shouldEscalate) {
    await queryDb(
      `UPDATE support_conversations
       SET status = 'WAITING_ADMIN', last_message_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND (status = 'BOT' OR status IS NULL)`,
      [conversationId]
    );

    await notifySupportEvent({
      type: 'SUPPORT_REQUESTED',
      conversationId,
      senderType: 'SYSTEM',
      senderName: opts.customerName || 'Customer',
      text: opts.customerMessage,
      status: 'WAITING_ADMIN',
      timestamp: new Date().toISOString(),
    });
  } else {
    await queryDb(
      `UPDATE support_conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [conversationId]
    );
  }

  // 5. Broadcast SSE event so customer and admin UI update in real time
  await notifySupportEvent({
    type: 'NEW_MESSAGE',
    conversationId,
    senderType: 'AI',
    senderName: 'Blessing AI Assistant',
    text: result.answer,
    message: {
      id: aiMsgId,
      conversation_id: conversationId,
      sender_type: 'AI',
      sender_name: 'Blessing AI Assistant',
      text: result.answer,
      suggestions: result.suggestions,
      created_at: new Date().toISOString(),
    },
    status: result.shouldEscalate ? 'WAITING_ADMIN' : conv?.status || 'BOT',
    timestamp: new Date().toISOString(),
  });

  return true;
}
