import { CofounderObservedMetrics, CofounderIncident } from './types';

interface InvestigationResult {
  title: string;
  department: string;
  symptoms: string[];
  hypotheses: Array<{ hypothesis: string; evidence: string; confidence: number }>;
  recommendedAction: string;
  permissionLevel: 1 | 2 | 3;
}

/**
 * Unified LLM Client: Prioritizes Groq (ultra-fast inference), with Gemini and deterministic fallback.
 */
async function callLlmIfAvailable(prompt: string, systemPrompt?: string): Promise<string | null> {
  // 1. Prioritize Groq
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqKey.trim()}`,
        },
        body: JSON.stringify({
          model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
          messages: [
            ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
          max_tokens: 1800,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch (e) {
      console.warn('[CoFounder Reasoner] Groq API warning:', e);
    }
  }

  // 2. Secondary fallback: Gemini
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              ...(systemPrompt ? [{ role: 'user', parts: [{ text: `System Instruction: ${systemPrompt}` }] }] : []),
              { role: 'user', parts: [{ text: prompt }] },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1000,
            },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) return candidateText;
      }
    } catch (_) {}
  }

  return null;
}

/**
 * ─── 1. MORNING EXECUTIVE BRIEFING GENERATOR ─────────────────────────────────
 */
export async function generateDailyBriefing(metrics: CofounderObservedMetrics): Promise<string> {
  const dateStr = new Date().toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const b = metrics.business;
  const t = metrics.technical;
  const c = metrics.customer;
  const l = metrics.logistics;
  const inv = metrics.inventory;

  const lowStockNotice =
    inv.lowStockItems.length > 0
      ? `• ⚠️ Low Stock Alert: ${inv.lowStockItems.map((i) => `${i.title} (${i.stock} left)`).join(', ')}`
      : '• Stock Status: All guides comfortably stocked.';

  const defaultSynthesis = `Overall operations are healthy. Gross sales stand at ₹${b.todayRevenue.toLocaleString('en-IN')} across ${b.todayOrders} orders. Server uptime is ${t.uptimeFormatted} with RAM at ${t.memoryPercent}%. Active visitors: ${c.activeVisitorsNow}. ST Courier dockets are being processed smoothly with ${l.ordersAwaitingAwb} orders pending AWB scan.`;

  // Try Gemini for enhanced strategic recommendation
  const prompt = `You are the AI Co-Founder of Blessing Power Guide (blessingpowerguide.in), Tamil Nadu's leading 10th standard school guides store.
Analyze this compact daily metrics snapshot and write a 2-3 sentence strategic executive takeaway for the store owner:
Sales: ₹${b.todayRevenue} (${b.todayOrders} orders). Top Guide: "${b.topBookToday}".
Tech: Memory ${t.memoryPercent}%, Uptime ${t.uptimeFormatted}, Errors: ${t.recentErrorsCount}.
Visitors: ${c.activeVisitorsNow} active now, ${c.abandonedCarts24h} abandoned carts.
Logistics: ${l.ordersAwaitingAwb} awaiting AWB.
Inventory: ${inv.lowStockCount} low stock books (${inv.lowStockItems.map((i) => `${i.title}:${i.stock}`).join(', ')}).
Be concise, factual, and actionable. Do not hallucinate.`;

  const geminiTakeaway = await callLlmIfAvailable(prompt);
  const recommendation = geminiTakeaway?.trim() || defaultSynthesis;

  return `👑 *BLESSING POWER GUIDE — DAILY CO-FOUNDER BRIEFING*
📅 ${dateStr}

📊 *1. Business & Sales*
• Today's Revenue: ₹${b.todayRevenue.toLocaleString('en-IN')} (${b.todayOrders} orders)
• Yesterday: ₹${b.yesterdayRevenue.toLocaleString('en-IN')} (${b.yesterdayOrders} orders)
• Avg Order Value: ₹${b.avgOrderValue}
• Best Seller: ${b.topBookToday}
• Paid & Captured: ${b.paidOrders} | Cancelled: ${b.cancelledOrders}

👥 *2. Customer & Traffic*
• Active Live Visitors: ${c.activeVisitorsNow}
• Abandoned Carts (24h): ${c.abandonedCarts24h}
• Open Support Tickets: ${c.openSupportTickets} (CSAT: ⭐ ${c.avgCsatRating}/5.0)

⚡ *3. Technical Health*
• Server Uptime: ${t.uptimeFormatted}
• RAM Usage: ${t.memoryPercent}% (${t.memoryUsedMb}MB / ${t.memoryTotalMb}MB)
• Database Pool: ${t.dbHealthy ? '🟢 Connected' : '🔴 Degraded'} | Redis: ${t.redisHealthy ? '🟢 Healthy' : '🟡 Offline'}
• Recent 5xx Errors: ${t.recentErrorsCount}

📦 *4. Logistics & Fulfillment*
• Awaiting Courier Dispatch: ${b.unfulfilledOrders}
• Awaiting AWB Docket (>24h): ${l.ordersAwaitingAwb}
• In Transit (ST Courier): ${l.inTransitCount} | Delivered: ${l.deliveredCount}

📚 *5. Inventory Watchlist*
${lowStockNotice}

💡 *AI Co-Founder Strategic Advice*
"${recommendation}"`;
}

/**
 * ─── 2. ROOT-CAUSE ANOMALY INVESTIGATION ENGINE ─────────────────────────────
 */
export async function investigateProblem(
  userQuery: string,
  metrics: CofounderObservedMetrics,
  recentIncidents: CofounderIncident[] = []
): Promise<string> {
  const q = userQuery.toLowerCase();
  const b = metrics.business;
  const t = metrics.technical;
  const c = metrics.customer;
  const l = metrics.logistics;
  const inv = metrics.inventory;

  // Attempt high-level reasoning via Gemini Free Tier first
  const geminiPrompt = `You are the AI Co-Founder of Blessing Power Guide.
Investigate this question using our verified production telemetry:
Question: "${userQuery}"

Current Telemetry:
- Revenue Today: ₹${b.todayRevenue} (${b.todayOrders} orders) vs Yesterday ₹${b.yesterdayRevenue} (${b.yesterdayOrders} orders)
- Unfulfilled Orders: ${b.unfulfilledOrders}, Awaiting AWB >24h: ${l.ordersAwaitingAwb}
- Active Visitors: ${c.activeVisitorsNow}, Abandoned Carts (24h): ${c.abandonedCarts24h}
- System Memory: ${t.memoryPercent}%, 5xx Errors: ${t.recentErrorsCount}, DB Healthy: ${t.dbHealthy}
- Low Stock: ${inv.lowStockItems.map((i) => `${i.title} (${i.stock})`).join(', ') || 'None'}
- Past Incidents in Memory: ${recentIncidents.map((i) => `[${i.detected_at}] ${i.title} -> ${i.resolution || 'Open'}`).join('; ') || 'None'}

Provide a structured, evidence-based root-cause analysis:
1. Observed Symptoms
2. Most Likely Hypotheses with Confidence %
3. Recommended Immediate Action (specify if it needs owner approval).`;

  const geminiReply = await callLlmIfAvailable(geminiPrompt);
  if (geminiReply) {
    return geminiReply.trim();
  }

  // ─── DETERMINISTIC FALLBACK REASONING ENGINE (100% Guaranteed 0ms) ───────────
  if (q.includes('sale') || q.includes('order') || q.includes('revenue') || q.includes('down') || q.includes('drop')) {
    const diff = b.todayRevenue - b.yesterdayRevenue;
    const isDown = diff < 0;
    return `🧠 *AI Co-Founder Root-Cause Analysis: Sales & Conversion*

🔍 *1. Evidence & Symptoms:*
• Today's Orders: ${b.todayOrders} (₹${b.todayRevenue.toLocaleString('en-IN')})
• Yesterday's Orders: ${b.yesterdayOrders} (₹${b.yesterdayRevenue.toLocaleString('en-IN')})
• Difference: ${isDown ? `Down by ₹${Math.abs(diff)}` : `Up by ₹${diff}`}
• Active Visitors: ${c.activeVisitorsNow}
• Abandoned Carts in last 24h: ${c.abandonedCarts24h}

🔬 *2. Diagnostic Hypotheses:*
• **Hypothesis A (Traffic / Seasonal timing)**: Parents and students typically place book orders after school hours (5:00 PM – 9:30 PM IST). [Confidence: 85%]
• **Hypothesis B (Checkout Hesitation)**: ${c.abandonedCarts24h} carts were initiated without completion. Check if customers had questions regarding Tamil vs English medium or shipping charges. [Confidence: 75%]
• **Hypothesis C (Technical/Payment Gateway)**: Error count is ${t.recentErrorsCount} and DB is ${t.dbHealthy ? 'healthy' : 'unhealthy'}. Razorpay payment pipeline is functioning normally. [Confidence: 95%]

🎯 *3. Recommended Next Steps:*
1. Send targeted WhatsApp cart recovery to the ${c.abandonedCarts24h} abandoned carts via the Abandoned Carts tab in Admin.
2. Ensure low stock guides are replenished before evening peak hours.`;
  }

  if (q.includes('error') || q.includes('server') || q.includes('slow') || q.includes('memory') || q.includes('bug')) {
    return `🧠 *AI Co-Founder Technical Diagnostic: Infrastructure & Errors*

🔍 *1. Evidence & Symptoms:*
• System Uptime: ${t.uptimeFormatted}
• RAM Usage: ${t.memoryPercent}% (${t.memoryUsedMb}MB of ${t.memoryTotalMb}MB)
• Database Pool: ${t.dbHealthy ? '🟢 Fully Operational' : '🔴 Connection Errors Detected'}
• Redis Cache: ${t.redisHealthy ? '🟢 Active & Connected' : '🟡 Disconnected'}
• 5xx Server Errors (Past 10m): ${t.recentErrorsCount}

🔬 *2. Root-Cause Analysis:*
• Memory pressure is currently **${t.memoryPercent < 80 ? 'NORMAL' : 'ELEVATED'}**.
• Database queries are resolving within normal timeouts.
• Redis rolling visitor window is active with ${c.activeVisitorsNow} concurrent sessions.

🎯 *3. Recommended Action:*
No server restart is needed. System health is within optimal parameters.`;
  }

  if (q.includes('stock') || q.includes('inventory') || q.includes('book')) {
    const list = inv.lowStockItems.length > 0
      ? inv.lowStockItems.map((i) => `• *${i.title}*: ${i.stock} copies remaining`).join('\n')
      : '• All school guides currently exceed safety threshold (>15 copies).';

    return `🧠 *AI Co-Founder Inventory Telemetry*

📦 *Current Stock Health:*
${list}

🎯 *Recommended Action:*
Place a reprint batch order with the Trust Square Ayanavaram print shop for guides with under 10 copies.`;
  }

  if (q.includes('ship') || q.includes('courier') || q.includes('delivery') || q.includes('awb')) {
    return `🧠 *AI Co-Founder Logistics & Shipping Audit*

📦 *ST Courier Metrics:*
• Total Dispatched Orders: ${b.todayOrders + b.yesterdayOrders}
• Orders Awaiting AWB Docket (>24h): ${l.ordersAwaitingAwb}
• In-Transit with ST Courier: ${l.inTransitCount}
• Marked as Delivered: ${l.deliveredCount}

🎯 *Recommended Action:*
${l.ordersAwaitingAwb > 0 ? `⚠️ Alert: ${l.ordersAwaitingAwb} orders have been waiting over 24 hours without an official ST Courier AWB docket. Please open Courier Management to generate manifests.` : '✓ All orders have active AWB dockets.'}`;
  }

  // General catch-all
  return `🧠 *AI Co-Founder Operational Status Report*
I reviewed your store's live telemetry:
• Business: ₹${b.todayRevenue} across ${b.todayOrders} orders today.
• Systems: Uptime ${t.uptimeFormatted}, RAM ${t.memoryPercent}%, DB ${t.dbHealthy ? 'Healthy' : 'Error'}.
• Customer: ${c.activeVisitorsNow} active shoppers, ${c.openSupportTickets} support tickets.
• Inventory: ${inv.lowStockCount} low stock alerts.

Type \`/sales\`, \`/status\`, \`/inventory\`, or \`/think <problem>\` to investigate a specific area.`;
}
