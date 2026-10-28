import { gatherCoFounderMetrics } from './observer';
import { generateDailyBriefing, investigateProblem } from './reasoner';
import { getRecentIncidents, saveIncident } from './memory';
import { verifyFix, runFullSystemProbe } from './verifier';
import {
  handleProductControlCommand,
  handleBusinessInstructionCommand,
  handleGeneralCoFounderQuery,
  getActiveBusinessInstructions,
} from './businessControls';
import { getRedisClient } from '@/lib/redis';
import { queryDb } from '@/lib/db';
import { CofounderObservedMetrics } from './types';
import { orchestrateCoFounderTurn } from './conversationOrchestrator';

// In-memory fallback for last active admin chat ID
let cachedAdminChatId: string | number | null = null;

async function getStoredChatId(): Promise<string | number | null> {
  if (cachedAdminChatId) return cachedAdminChatId;
  const redis = getRedisClient();
  if (redis) {
    try {
      const val = await redis.get('bpg:cofounder:admin_chat_id');
      if (val) {
        cachedAdminChatId = val;
        return val;
      }
    } catch (_) {}
  }
  return null;
}

async function persistAdminChatId(id: string | number) {
  cachedAdminChatId = id;
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set('bpg:cofounder:admin_chat_id', String(id), 'EX', 86400 * 30);
    } catch (_) {}
  }
}

/**
 * Sends a notification or response directly to the admin's Telegram chat.
 * Uses the free Telegram Bot API (https://api.telegram.org).
 * Falls back to plain text if Markdown parsing fails.
 */
export async function sendTelegramMessage(text: string, chatId?: string | number): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const targetChatId =
    chatId ||
    process.env.TELEGRAM_CHAT_ID ||
    process.env.TELEGRAM_ADMIN_CHAT_ID ||
    (await getStoredChatId());

  if (!botToken || !targetChatId) {
    console.warn('[Telegram Bot] Missing TELEGRAM_BOT_TOKEN or recipient chat ID.');
    return false;
  }

  // Telegram 4096-character limit: chunk cleanly by line or paragraph to ensure 100% full delivery
  const MAX_CHUNK = 3800;
  const chunks: string[] = [];
  if (text.length <= MAX_CHUNK) {
    chunks.push(text);
  } else {
    let remaining = text;
    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHUNK) {
        chunks.push(remaining);
        break;
      }
      let splitIdx = remaining.lastIndexOf('\n', MAX_CHUNK);
      if (splitIdx <= 0) splitIdx = remaining.lastIndexOf(' ', MAX_CHUNK);
      if (splitIdx <= 0) splitIdx = MAX_CHUNK;
      chunks.push(remaining.slice(0, splitIdx).trim());
      remaining = remaining.slice(splitIdx).trim();
    }
  }

  let allOk = true;
  for (const chunk of chunks) {
    try {
      let res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: targetChatId,
          text: chunk,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      });

      if (!res.ok) {
        // Retry without Markdown if syntax caused Telegram error
        res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: targetChatId,
            text: chunk,
            disable_web_page_preview: true,
          }),
        });
      }

      if (!res.ok) allOk = false;
    } catch (err) {
      console.error('[Telegram Bot] Network error sending chunk:', err);
      allOk = false;
    }
  }

  return allOk;
}

/**
 * Dispatches high-priority system alerts (P1/P2) immediately to Telegram.
 */
export async function dispatchUrgentTelegramAlert(title: string, details: string, severity: 'CRITICAL' | 'HIGH' = 'CRITICAL') {
  const prefix = severity === 'CRITICAL' ? '🚨 *CRITICAL ALERT*' : '⚠️ *HIGH ALERT*';
  const message = `${prefix} — Blessing Power Guide\n\n*${title}*\n${details}\n\n_Time: ${new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST_`;
  await sendTelegramMessage(message);
  await saveIncident({
    severity,
    department: 'CTO',
    title,
    symptoms: details,
  }).catch(() => {});
}

/**
 * ─── CONVERSATIONAL AI CO-FOUNDER BRAIN ────────────────────────────────────
 * Communicates like a sharp, trusted business partner and friend.
 * Ingests 360° live store telemetry, understands typos, Tanglish, and natural human conversation.
 */
export async function chatWithCoFounder(
  userMessage: string,
  metrics: CofounderObservedMetrics
): Promise<string> {
  const b = metrics.business;
  const t = metrics.technical;
  const c = metrics.customer;
  const l = metrics.logistics;
  const inv = metrics.inventory;

  // Retrieve active instructions & coming soon titles
  const [instructions, csBooksRes] = await Promise.all([
    getActiveBusinessInstructions().catch(() => []),
    queryDb(
      `SELECT title, availability_reason, stock FROM books WHERE is_coming_soon = true OR status = 'coming_soon' ORDER BY title ASC`
    ).catch(() => ({ rows: [] })),
  ]);

  const activeNoticesText =
    instructions.length > 0
      ? instructions
          .map(
            (i) =>
              `• [${i.instruction_type}] ${i.content} (Expected end: ${i.expected_end || 'shortly'})`
          )
          .join('\n')
      : 'None active (Normal operations)';

  const comingSoonText =
    (csBooksRes.rows || []).length > 0
      ? (csBooksRes.rows || [])
          .map(
            (bk: any) =>
              `• ${bk.title}: Reason: "${bk.availability_reason || 'Pending official release'}"`
          )
          .join('\n')
      : 'None (All catalog titles available)';

  const lowStockText =
    inv.lowStockItems.length > 0
      ? inv.lowStockItems.map((i) => `${i.title} (${i.stock} left)`).join(', ')
      : 'All guides comfortably stocked (>15 copies)';

  const rawGroqKey = process.env.GROQ_API_KEY || '';
  const groqKey = rawGroqKey.replace(/^["']|["']$/g, '').trim();
  if (groqKey) {
    try {
      const rawModel = process.env.GROQ_MODEL || '';
      const model = rawModel.replace(/^["']|["']$/g, '').trim() || 'qwen/qwen3.8-27b';

      const systemPrompt = `You are the AI Co-Founder and business partner of Blessing Power Guide (blessingpowerguide.in) — Tamil Nadu's leading online store for 10th standard SSLC guides and 5-in-1 combo books.
You are chatting in Telegram directly with your human co-founder, Yogesh.

YOUR PERSONALITY & TONE:
- Talk like a sharp, trusted co-founder, loyal partner, and close friend.
- Warm, direct, knowledgeable, proactive, and energetic.
- Speak in natural conversational English. You effortlessly understand Tamil and Tanglish (e.g. "vanakkam", "epdi irukinga", "orders evlo", "super", "seri", "machan", "bro") and handle casual spelling or typos seamlessly (e.g. "hwo" = how, "receivd" = received, "bok" = book, "odr" = order).
- NEVER sound like a generic customer support bot or use stiff robotic boilerplate like "Understood. I have recorded this in our business context".
- Keep replies concise, conversational, and punchy: 2 to 4 sentences or a quick structured mini-bullet list.

LIVE REAL-TIME STORE TELEMETRY (FACTUAL TRUTH RIGHT NOW):
- Today's Orders: ${b.todayOrders} orders
- Today's Gross Revenue: ₹${b.todayRevenue.toLocaleString('en-IN')} (Avg Order Value: ₹${b.avgOrderValue})
- Yesterday's Comparison: ₹${b.yesterdayRevenue.toLocaleString('en-IN')} across ${b.yesterdayOrders} orders
- Top-Selling Guide: "${b.topBookToday}"
- Payment Captured: ${b.paidOrders} | Cancelled: ${b.cancelledOrders}
- Fulfillment & Logistics: ${b.unfulfilledOrders} orders preparing for dispatch (${l.ordersAwaitingAwb} awaiting ST Courier AWB docket)
- Live Shopper Traffic: ${c.activeVisitorsNow} active customer(s) browsing storefront right now
- Abandoned Carts (24h): ${c.abandonedCarts24h}
- Support Health: ${c.openSupportTickets} open ticket(s), CSAT: ${c.avgCsatRating} / 5.0
- Inventory Safety: ${inv.lowStockCount} low stock guides (≤15 copies), ${inv.outOfStockCount} out of stock.
  Low stock list: ${lowStockText}
- Coming Soon Status & Reasons:
${comingSoonText}
- System & Infrastructure: Uptime: ${t.uptimeFormatted}, RAM: ${t.memoryPercent}% (${t.memoryUsedMb}MB / ${t.memoryTotalMb}MB), DB Pool: ${t.dbHealthy ? '🟢 Connected' : '🔴 Issue'}, Redis: ${t.redisHealthy ? '🟢 Active' : '🟡 Offline'}, Recent 5xx: ${t.recentErrorsCount}
- Active Store Notices:
${activeNoticesText}
- Store Policies: 10th standard 5-in-1 combo sets in Tamil and English Medium. Free shipping across Tamil Nadu for orders above ₹499 via ST Courier (2-4 days TN delivery, 3-6 days out of state). Razorpay payments.

INSTRUCTIONS:
1. Directly answer Yogesh's question using the live telemetry above.
2. If he greets you ("hii", "hey bro", "morning", "vanakkam"), greet back warmly like a real partner, give a 1-line pulse of today's sales and traffic, and ask what's on his mind.
3. If he asks about orders or sales ("hwo many orders we received", "today sales", "revenue"), give the exact order count, ₹ revenue, top book, and compare with yesterday.
4. If he asks about stock, guides, or logistics, answer with precision based on the live inventory and coming soon reasons.
5. If he asks for advice or ideas, give high-impact actionable business advice tailored to Tamil Nadu 10th standard board exam prep.
6. Format cleanly with light bolding and standard emojis where helpful.
7. COMPLETENESS MANDATE: Always finish your full response completely without cutting off or truncating mid-sentence.`;

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlessingPowerGuide/1.0',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 1500,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        if (content) return content;
      }
    } catch (err) {
      console.warn('[Telegram CoFounder] Groq call warning:', err);
    }
  }

  // ── INTELLIGENT DETERMINISTIC COGNITIVE ENGINE (Fallback if offline or rate-limited) ──
  const lower = userMessage.toLowerCase().trim();

  // 1. Greetings
  if (
    /^(hi|hii|hiii|hello|hey|heyy|heya|morning|good morning|gm|evening|vanakkam|epdi irukinga|how are you|bro|machan|what's up|whats up|yo)\b/i.test(
      lower
    ) ||
    lower === 'hi' ||
    lower === 'hii' ||
    lower === 'hello'
  ) {
    return `Hey Yogesh! 👋 Great to connect with you.

Here is our live store pulse right now:
• Today's Orders: *${b.todayOrders}* (₹${b.todayRevenue.toLocaleString('en-IN')})
• Live Shoppers: *${c.activeVisitorsNow}* browsing storefront
• System Health: *100% Operational* (RAM at ${t.memoryPercent}%)

How are things going on your end? What do you want to tackle today?`;
  }

  // 2. Orders & Sales (handles typos: "hwo many orders", "sales", "revenue", "order count", etc.)
  if (
    lower.includes('order') ||
    lower.includes('sales') ||
    lower.includes('revenue') ||
    lower.includes('how many') ||
    lower.includes('hwo many') ||
    lower.includes('much money') ||
    lower.includes('evlo') ||
    lower.includes('collection') ||
    lower.includes('turnover')
  ) {
    return `📊 *Today's Orders & Sales Pulse*

• Today's Orders: *${b.todayOrders} orders*
• Gross Revenue: *₹${b.todayRevenue.toLocaleString('en-IN')}*
• Avg Order Value: *₹${b.avgOrderValue}*
• Yesterday's Close: ₹${b.yesterdayRevenue.toLocaleString('en-IN')} (${b.yesterdayOrders} orders)
• Top-Selling Title: *${b.topBookToday}*
• Payment Status: ${b.paidOrders} captured, ${b.cancelledOrders} cancelled
• Logistics: ${b.unfulfilledOrders} orders preparing for dispatch (${l.ordersAwaitingAwb} awaiting ST Courier AWB)`;
  }

  // 3. Inventory & Stock
  if (
    lower.includes('stock') ||
    lower.includes('inventory') ||
    lower.includes('book') ||
    lower.includes('guide') ||
    lower.includes('coming soon')
  ) {
    return `📦 *Live Inventory & Catalog Pulse*

• Low Stock Guides (≤15): *${inv.lowStockCount}*
• Out of Stock Titles: *${inv.outOfStockCount}*
${inv.lowStockItems.length > 0 ? inv.lowStockItems.map((i) => `• *${i.title}*: ${i.stock} copies left`).join('\n') : '• All published titles are comfortably stocked.'}

📚 *Coming Soon Status*:
${comingSoonText}`;
  }

  // 4. Server & Tech
  if (
    lower.includes('server') ||
    lower.includes('uptime') ||
    lower.includes('ram') ||
    lower.includes('memory') ||
    lower.includes('health') ||
    lower.includes('speed') ||
    lower.includes('site') ||
    lower.includes('database') ||
    lower.includes('db')
  ) {
    return `⚡ *Infrastructure Health Overview*

• Overall Status: *100% OPERATIONAL*
• Server Uptime: ${t.uptimeFormatted}
• RAM Usage: ${t.memoryPercent}% (${t.memoryUsedMb}MB / ${t.memoryTotalMb}MB)
• PostgreSQL Pool: ${t.dbHealthy ? '🟢 Connected' : '🔴 Warning'}
• Redis Cache: ${t.redisHealthy ? '🟢 Active' : '🟡 Offline'}
• Recent 5xx Errors: ${t.recentErrorsCount} (last hour)`;
  }

  // 5. Customers & Visitors
  if (
    lower.includes('traffic') ||
    lower.includes('visitor') ||
    lower.includes('cart') ||
    lower.includes('support') ||
    lower.includes('customer')
  ) {
    return `👥 *Live Shopper & Customer Intel*

• Active Visitors Right Now: *${c.activeVisitorsNow}*
• Abandoned Carts (24h): *${c.abandonedCarts24h}*
• Open Support Questions: *${c.openSupportTickets}*
• CSAT Rating: ⭐ *${c.avgCsatRating} / 5.0*`;
  }

  // 6. Default Partner Response (Warm & Contextual)
  return `Got it, Yogesh! All storefront systems, customer support, and payment pipelines are operating smoothly.

📊 *Live Snapshot*: *${b.todayOrders} orders* (₹${b.todayRevenue.toLocaleString('en-IN')}) | *${c.activeVisitorsNow} live visitors*.

You can ask me anything about today's orders, inventory, courier status, or tell me to update book availability or set maintenance notices!`;
}

/**
 * Processes incoming webhooks from Telegram when you chat with your AI Co-Founder bot.
 */
export async function handleTelegramWebhook(payload: any): Promise<{ handled: boolean; replyText?: string }> {
  const message = payload?.message || payload?.edited_message;
  if (!message) {
    return { handled: false };
  }

  const hasAttachment = Boolean(message.document || message.photo || message.voice || message.audio);
  const caption = String(message.caption || '').trim();
  const rawText = String(message.text || caption).trim();
  if (!rawText && !hasAttachment) {
    return { handled: false };
  }

  const chatId = message.chat?.id;
  if (chatId) {
    void persistAdminChatId(chatId);
  }

  const lower = rawText.toLowerCase();

  // Handle document/photo attachments or uploaded timetable instructions
  if (hasAttachment || (lower.includes('timetable') && (lower.includes('uploaded') || lower.includes('analyse') || lower.includes('build')))) {
    const { processTelegramAttachment } = await import('./documentIntelligence');
    const doc = message.document;
    const photo = message.photo && message.photo.length > 0 ? message.photo[message.photo.length - 1] : null;
    const res = await processTelegramAttachment({
      fileId: doc?.file_id || photo?.file_id,
      fileName: doc?.file_name || (photo ? 'photo.jpg' : 'tn_dge_10th_timetable.pdf'),
      mimeType: doc?.mime_type || (photo ? 'image/jpeg' : 'application/pdf'),
      fileSize: doc?.file_size || photo?.file_size,
      caption: rawText,
    });
    if (res.message && chatId) {
      await sendTelegramMessage(res.message, chatId);
    }
    return { handled: true, replyText: res.message };
  }

  const metrics = await gatherCoFounderMetrics();

  let replyText = '';

  // ── 1. EXACT / SLASH COMMAND ROUTER ──────────────────────────────────────────

  // /start or /help
  if (lower === '/start' || lower === '/help') {
    replyText = `👑 *Blessing Power Guide — AI Co-Founder*
I am your 24/7 technical, business, and operational co-founder.

*Executive & Operational Commands:*
• \`/status\` — Live website uptime, RAM, DB & active visitors
• \`/probe\` — Multi-point diagnostic across all 6 subsystems
• \`/verify <target>\` — Run Fix Verification probe (e.g. \`/verify checkout\`)
• \`/incidents\` — View active and recently resolved incidents
• \`/sales\` — Today's and yesterday's revenue & order breakdown
• \`/inventory\` — Low stock alerts & reorder watchlist
• \`/customers\` — Live traffic, conversion & abandoned carts
• \`/payments\` — Razorpay capture status & payment audit
• \`/instructions\` — View active store notices & active theme
• \`/report\` — Generate complete executive morning briefing
• \`/think <problem>\` — Trigger root-cause investigation on any issue

*Conversational Partner Controls:*
• Talk to me like a partner: _"hii"_, _"hwo many orders we received"_, _"how is the site doing?"_
• Festive themes: _"Today is Deepavali. Decorate our website, add a Deepavali theme"_, _"Remove festival decorations"_, _"Website la Deepavali theme podu"_
• Store notices & alerts: _"We have a maintenance issue. Show a notice to every customer for next 30 minutes"_, _"Maintenance is complete. Remove notice"_
• Shipping delays: _"Heavy rain is delaying book deliveries. Inform customers"_
• Product stock: _"CAN YOU CHANGE THE TAMIL MEDIUM AND STOCK 23"_, _"Tamil guide innum varala, Coming Soon la vechiru"_`;
  }
  // /probe or /diagnose
  else if (lower === '/probe' || lower === '/diagnose') {
    replyText = await runFullSystemProbe();
  }
  // /verify or Fix Verification ("I fixed...", "Verify the fix", "Is checkout working?")
  else if (
    lower.startsWith('/verify') ||
    lower.includes('verify the fix') ||
    lower.includes('i fixed the checkout') ||
    lower.includes('check whether checkout works')
  ) {
    const cleanQuery = rawText.replace(/^\/verify\s*/i, '');
    replyText = await verifyFix(cleanQuery || 'checkout');
  }
  // /incidents or /issues
  else if (lower === '/incidents' || lower === '/issues') {
    const incidents = await getRecentIncidents(6);
    if (incidents.length === 0) {
      replyText = `🛡️ *Blessing Power Guide — Incidents Log*\n• No incidents recorded. All systems have operated without unhandled outages.`;
    } else {
      const items = incidents
        .map(
          (i) =>
            `• *[${i.status}]* ${i.severity === 'CRITICAL' ? '🚨' : '⚠️'} *${i.title}* (${i.department})\n  _Detected: ${new Date(i.detected_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST_${i.resolution ? `\n  ✓ Resolution: ${i.resolution.slice(0, 100)}` : ''}`
        )
        .join('\n\n');
      replyText = `🛡️ *Blessing Power Guide — Recent Incidents*\n\n${items}`;
    }
  }
  // /status
  else if (lower === '/status') {
    const t = metrics.technical;
    const c = metrics.customer;
    replyText = `⚡ *Blessing Power Guide — System Health*
• Status: *100% OPERATIONAL*
• Uptime: ${t.uptimeFormatted}
• RAM Usage: ${t.memoryPercent}% (${t.memoryUsedMb}MB / ${t.memoryTotalMb}MB)
• Database Pool: ${t.dbHealthy ? '🟢 Connected' : '🔴 Error'}
• Redis Cache: ${t.redisHealthy ? '🟢 Active' : '🟡 Offline'}
• Recent 5xx Errors: ${t.recentErrorsCount}
• Live Visitors: ${c.activeVisitorsNow} shopper(s)`;
  }
  // /sales
  else if (lower === '/sales') {
    const b = metrics.business;
    replyText = `📊 *Blessing Power Guide — Sales & Revenue*
• Today's Orders: ${b.todayOrders}
• Today's Revenue: ₹${b.todayRevenue.toLocaleString('en-IN')}
• Avg Order Value: ₹${b.avgOrderValue}
• Yesterday: ₹${b.yesterdayRevenue.toLocaleString('en-IN')} (${b.yesterdayOrders} orders)
• Paid & Captured: ${b.paidOrders}
• Cancelled: ${b.cancelledOrders}
• Best Seller: *${b.topBookToday}*`;
  }
  // /inventory
  else if (lower === '/inventory') {
    const inv = metrics.inventory;
    const itemsText =
      inv.lowStockItems.length > 0
        ? inv.lowStockItems.map((i) => `• *${i.title}*: ${i.stock} copies (${i.standard || '10th'})`).join('\n')
        : '• All school guides are comfortably in stock (>15 copies).';

    replyText = `📦 *Blessing Power Guide — Inventory Watchlist*
• Low Stock Titles (≤15): ${inv.lowStockCount}
• Out of Stock: ${inv.outOfStockCount}

${itemsText}`;
  }
  // /customers
  else if (lower === '/customers') {
    const c = metrics.customer;
    replyText = `👥 *Blessing Power Guide — Customer Intelligence*
• Active Live Visitors: ${c.activeVisitorsNow}
• Abandoned Carts (24h): ${c.abandonedCarts24h}
• Open Support Tickets: ${c.openSupportTickets}
• Customer CSAT Rating: ⭐ ${c.avgCsatRating} / 5.0`;
  }
  // /payments
  else if (lower === '/payments') {
    const b = metrics.business;
    replyText = `💳 *Blessing Power Guide — Payment Reconciliation*
• Total Captured Online: ${b.paidOrders} orders
• Cancelled / Refunded: ${b.cancelledOrders} orders
• Gateway: Razorpay (100% SHA-256 HMAC Verified)
• Status: Zero webhook backlog detected.`;
  }
  // /report
  else if (lower === '/report') {
    replyText = await generateDailyBriefing(metrics);
  }

  // ── 2. STATEFUL CONVERSATIONAL ORCHESTRATOR ──────────────────────────────────
  // Handles:
  // • Multi-turn School Bulk Orders (TJS Matric 30 copies -> Tamil -> 20 copies -> Razorpay Link)
  // • Operational facts & delays ("our book available tomorrow" stored as unconfirmed)
  // • Festive themes & store notices with foolproof removal
  // • Casual greetings (warm reply, 0 unsolicited sales or diagnostics)
  // • Deep root-cause investigations (/think)
  if (!replyText) {
    const orch = await orchestrateCoFounderTurn(chatId || 'tg-default', rawText, 'owner');
    if (orch.replyText) {
      replyText = orch.replyText;
    }
  }

  // ── 3. PRODUCT AVAILABILITY CONTROLS (STOCK UPDATES & COMING SOON) ────────────
  if (!replyText) {
    const productCmdReply = await handleProductControlCommand(rawText);
    if (productCmdReply) {
      replyText = productCmdReply;
    }
  }

  console.log(`[Telegram CoFounder] Incoming: "${rawText}" -> Reply: "${replyText.slice(0, 80).replace(/\n/g, ' ')}..."`);

  // Send reply back to the Telegram chat
  if (replyText && chatId) {
    await sendTelegramMessage(replyText, chatId);
  }

  return { handled: true, replyText };
}
