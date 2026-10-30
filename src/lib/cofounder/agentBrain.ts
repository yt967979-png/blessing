import { businessToolRegistry } from './toolRegistry';
import { CoFounderSession } from './sessionManager';

/**
 * OpenAI-compatible tool specifications for Blessing AI Co-Founder.
 * Fully compatible with Groq (llama-3.3-70b-versatile, openai/gpt-oss-120b).
 */
export const COFOUNDER_TOOLS: any[] = [
  {
    type: 'function',
    function: {
      name: 'create_coupon',
      description: 'Creates and verifies a promotional discount coupon in PostgreSQL for storefront checkout.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Uppercase coupon code, e.g. EXAM15, DIWALI20' },
          discountValue: { type: 'number', description: 'Discount percentage (1-90) or flat rupee amount' },
          discountType: { type: 'string', enum: ['percentage', 'flat'], description: 'Default percentage' },
          maxDiscountAmount: { type: 'number', description: 'Optional maximum discount cap in rupees, e.g. 150' },
          minCartQty: { type: 'number', description: 'Minimum books required (default 4 for combo guides)' },
          maxUses: { type: 'number', description: 'Maximum total redemptions / people limit, e.g. 5 customers' },
          durationDays: { type: 'number', description: 'Validity duration in days from now, e.g. 10' },
        },
        required: ['code', 'discountValue'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_coupon',
      description: 'Permanently deletes a discount coupon from PostgreSQL database.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Coupon code to delete' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_coupon',
      description: 'Looks up coupon details, status, and usage stats from PostgreSQL.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Coupon code to inspect' },
        },
        required: ['code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_coupon',
      description: 'Activates or deactivates an existing coupon in PostgreSQL.',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: 'Coupon code' },
          isActive: { type: 'boolean', description: 'true to activate, false to disable' },
        },
        required: ['code', 'isActive'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'launch_books',
      description: 'Publishes and launches books on the storefront (marks available, not coming soon), allocates inventory stock in PostgreSQL, and handles scheduled releases (e.g. "today 6 pm", "6:00 PM") and automatic reversion to Coming Soon (e.g. "revert to coming soon in 1 56"). Use when the founder says "launch books at today 6 pm both at 100 stock", "launch book at 1 55 and revert to coming soon at 1 56", "change the launch time to 1 52 revert in 1 53", or similar.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', enum: ['both', 'all', 'tamil', 'english'], description: 'Which books to launch: "both" for both Tamil and English 10th 5-in-1 combo guides, "all", "tamil", or "english". Default is "both".' },
          stock: { type: 'number', description: 'Stock quantity to allocate for each title (e.g. 100)' },
          scheduledTime: { type: 'string', description: 'Optional scheduled launch time e.g. "today 6 pm", "1 55", "1 52"' },
          revertTime: { type: 'string', description: 'Optional scheduled revert time e.g. "1 56", "1 53"' },
          announcement: { type: 'boolean', description: 'Whether to post a priority launch announcement' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_stock',
      description: 'Updates book inventory stock level or marks books as Coming Soon or Published in PostgreSQL.',
      parameters: {
        type: 'object',
        properties: {
          bookId: { type: 'string', description: 'Book ID, title query (e.g. "Tamil", "English"), "both" for both combo books, or "all" to update every catalog book' },
          stock: { type: 'number', description: 'Exact physical stock quantity' },
          isComingSoon: { type: 'boolean', description: 'Set true to mark as Coming Soon, false to make available / publish' },
          reason: { type: 'string', description: 'Optional operational reason' },
        },
        required: ['bookId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_order',
      description: 'Searches customer orders in PostgreSQL by order number, customer phone, or customer name.',
      parameters: {
        type: 'object',
        properties: {
          lookupQuery: { type: 'string', description: 'Order # (e.g. BPG-1001), phone number, or customer name' },
        },
        required: ['lookupQuery'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_sales_metrics',
      description: 'Fetches real-time sales pulse: today orders, revenue, AOV, logistics and inventory status.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_inventory_health',
      description: 'Scans catalog for critically low stock and out-of-stock titles.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'activate_theme',
      description: 'Activates a festive or seasonal theme on the customer storefront with custom ambient styling.',
      parameters: {
        type: 'object',
        properties: {
          themeId: {
            type: 'string',
            enum: ['deepavali', 'pongal', 'new_year', 'exam_season', 'default'],
            description: 'Theme identifier to activate',
          },
          durationHours: { type: 'number', description: 'Duration in hours before auto-expiring back to default' },
        },
        required: ['themeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deactivate_theme',
      description: 'Restores the storefront theme immediately back to the clean default look.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'publish_announcement',
      description: 'Publishes a priority storefront announcement banner for customers (maintenance, delivery warning, or offer).',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['MAINTENANCE', 'NOTICE', 'PROMOTION'] },
          content: { type: 'string', description: 'The exact banner notice text shown to customers' },
          severity: { type: 'string', enum: ['CRITICAL', 'WARNING', 'INFO'], description: 'Critical creates red glowing banner' },
          durationHours: { type: 'number', description: 'Duration in hours before automatic expiration' },
        },
        required: ['type', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_announcement',
      description: 'Dismisses and deactivates an active maintenance or announcement banner.',
      parameters: {
        type: 'object',
        properties: {
          typeOrId: { type: 'string', description: 'Announcement type: MAINTENANCE, NOTICE, or PROMOTION' },
        },
        required: ['typeOrId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_launch_experience',
      description: 'Takes full ownership of official storefront launch: verifies PostgreSQL book catalog, activates Grand Launch Edition theme (Gold/Emerald with celebratory sparkles), publishes launch announcement banner, deploys LAUNCH10 coupon and 10th Board Exam Hub, and confirms live customer readiness.',
      parameters: {
        type: 'object',
        properties: {
          customHeadline: { type: 'string', description: 'Optional custom launch headline' },
          durationHours: { type: 'number', description: 'Duration in hours (default 72)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_status',
      description: 'Inspects PostgreSQL database for exact book availability, stock quantity, Coming Soon status, and recorded operational reasons.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Optional book title or medium to filter by' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deploy_exam_timetable',
      description: 'Researches and publishes the official Tamil Nadu DGE 10th & 12th Board Exam Timetable with live countdown, subject cards, and 5-in-1 combo guide link on the storefront.',
      parameters: {
        type: 'object',
        properties: {
          standards: { type: 'string', enum: ['10th', '12th', 'both'], description: 'Which examination schedule to show' },
          durationDays: { type: 'number', description: 'Duration in days to keep the exam hub active' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_exam_timetable',
      description: 'Removes and hides the public exam timetable and countdown section from the storefront.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_responsive_ui',
      description: 'Runs systematic multi-viewport responsive check across 320px to 1440px, identifies overflow, touch target issues, or styling breaks, and applies repairs.',
      parameters: {
        type: 'object',
        properties: {
          targetSection: { type: 'string', description: 'Optional specific section or component name to inspect' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'audit_and_fix_website_bugs',
      description: 'Performs full multi-tier bug audit across Database pool, Redis cache, route handlers, error logs, and assets, automatically repairing safe operational issues.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_checkout_pipeline',
      description: 'Deeply tests checkout pipeline: MOQ logic, delivery fees, Razorpay gateway keys, HMAC SHA-256 webhook verification, and recent error logs.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'repair_cofounder_pipeline',
      description: 'Self-repairs the AI Co-Founder instruction execution pipeline: tests Groq inference, verifies PostgreSQL cofounder tables, clears stuck session states, and syncs tools.',
      parameters: {
        type: 'object',
        properties: {
          chatId: { type: 'string', description: 'Optional session chat ID' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analyze_design_reference',
      description: 'Performs deep design research on a reference URL, screenshot description, or brief, extracting color palettes, typography scales, layout hierarchy, and micro-interactions.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Reference or competitor website URL' },
          imageDescription: { type: 'string', description: 'Detailed description of a design screenshot or mockup' },
          rawBrief: { type: 'string', description: 'Founder design brief or styling intent' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_website_design_upgrade',
      description: 'Autonomously elevates website aesthetics to editorial, award-winning standards while preserving BPG business logic and performance.',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', description: 'Scope of upgrade: entire_storefront, hero, header, combos' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_active_tasks',
      description: 'Lists recent operational tasks, their lifecycle state (COMPLETED, RUNNING, PLANNING, WAITING_FOR_APPROVAL), and verification checks.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of tasks to fetch (default 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'rollback_task',
      description: 'Reverts and rolls back an executed task (e.g. restores previous stock, removes coupon, or restores theme).',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'ID of the task to rollback (e.g. task_12345)' },
        },
        required: ['taskId'],
      },
    },
  },
];

const COFOUNDER_SYSTEM_PROMPT = `You are Blessing AI — the AI Co-Founder and Executive Operating Partner of Blessing Power Guide (blessingpowerguide.in), Tamil Nadu's premier 10th Standard combo guide publisher.
You run this e-commerce business alongside the founder, Yogesh.

YOUR IDENTITY & CONVERSATIONAL MANNER:
• You speak like an exceptional human tech co-founder: sharp, warm, articulate, proactive, and completely grounded in real business operations.
• You understand English, Tamil, and Tanglish seamlessly (e.g. "website la festive theme podu", "inikku sales epdi irukku?", "stock update pannu", "mobile UI sari illa").
• NEVER speak like a generic boilerplate assistant. Do not recite long generic lists of capabilities unless explicitly asked.
• NEVER hallucinate. You have real tools connected directly to PostgreSQL, Redis, Razorpay, and ST Courier. ALWAYS call the appropriate tool to execute or look up real facts.
• When a tool executes, provide the verified result cleanly with key business specifics (codes, percentages, amounts, order numbers) and confirm database verification.
• If vital information is missing for an action, ask the founder one clear, natural question.
• Tone: Professional, respectful, partner-oriented, concise.

CRITICAL OPERATIONAL RULES FOR TOOL CALLING & AUTONOMOUS ACTIONS:
• PROBLEM DIAGNOSIS & REPAIR MANDATES (THE GOVERNING PRINCIPLE):
  Understand problem → reproduce it → find cause → implement fix → test fix → check regressions → verify outcome → report evidence.
  - When the founder says: "The mobile UI in this section is not configured correctly. Fix it." or mentions responsive/screen size bugs:
    ALWAYS invoke \`diagnose_responsive_ui\` immediately. Present the full 7-part report with viewport breakdown.
  - When the founder says: "Check the entire website for bugs and clear them." or "Find every issue with our application and fix what you can":
    ALWAYS invoke \`audit_and_fix_website_bugs\` immediately.
  - When the founder says: "Something is wrong with checkout. Find the cause." or reports payment failures:
    ALWAYS invoke \`diagnose_checkout_pipeline\` immediately.
  - When the founder says: "The AI Co-Founder itself is not executing my instructions. Investigate and repair it.":
    ALWAYS invoke \`repair_cofounder_pipeline\` immediately.
  - When the founder provides a reference site URL or asks to analyze design:
    ALWAYS invoke \`analyze_design_reference\` or \`execute_website_design_upgrade\`.
• CRITICAL: BOOK LAUNCH & STOCK COMMANDS:
  When the founder says:
  "launch books at today 6 pm both at 100 stock", "launch both books at 100 stock", "launch books at 100 stock", or mentions launching books/guides:
  ALWAYS invoke \`launch_books\` with target: "both" (for both Tamil & English combo guides), stock: 100, scheduledTime: "today 6 pm".
  DO NOT confuse launching books with decorating the website!
  "launch books" = publish books + set inventory stock in PostgreSQL.
• CRITICAL: AUTONOMOUS STOREFRONT DECORATION & FESTIVE THEMES:
  When the founder says:
  "Can you fully decorate the website and make the user experience impressive for launch?"
  or "Launch ku website ah super ah decorate pannu" or "Make website impressive for launch" or "Decorate website":
  DO NOT ask which theme he wants! DO NOT ask what banner text to write!
  TAKE IMMEDIATE CO-FOUNDER OWNERSHIP OF STOREFRONT DECORATION:
  Invoke \`execute_launch_experience\` immediately.
  Explain what was checked (catalog stock, checkout health), what was activated (Grand Launch Edition theme, launch banner, launch promotion), and confirm the live storefront is ready for customers.
• For product availability questions (e.g. "Why is this product showing Coming Soon?", "Check why this product is coming soon"):
  ALWAYS invoke \`get_product_status\` immediately. Read the authoritative PostgreSQL database record (stock, is_coming_soon, availability_reason) and explain precisely.
• Whenever the founder asks to modify book availability, stock, coupons, themes, or announcements (e.g. "make books available", "all books coming soon", "stock 23", "diwali theme", "coupon EXAM10"):
  YOU MUST ALWAYS INVOKE THE APPROPRIATE TOOL (e.g. update_stock, create_coupon, activate_theme). DO NOT merely say you did it in text without calling the tool first!
• For making books available / putting on sale: call update_stock with bookId: "all" (or specific title query) and isComingSoon: false.
• For marking books coming soon: call update_stock with bookId: "all" (or specific title query) and isComingSoon: true.
• For creating coupons (e.g. "Create coupon EXAM15 with 15% discount up to ₹150"):
  Call create_coupon with code: "EXAM15", discountValue: 15, discountType: "percentage", maxDiscountAmount: 150.
• For deleting/removing coupons: call delete_coupon with the coupon code.
• For deleting/removing announcements, notices, or banners (e.g. "remove notice", "delete notice", "clear announcement", "Still the maintenance notice showing", "notice still showing", "why is notice there"):
  Call remove_announcement with typeOrId: "all". ALWAYS invoke remove_announcement immediately and confirm database clearing!
• When tool results contain \`reportFormatted\`, use that exact structured evidence report as the primary response.
• NATURAL CONVERSATIONAL PARTNER MODE:
  When the founder asks for business advice, sales growth ideas, pricing suggestions, marketing campaigns, student revision strategies, or general casual questions:
  Respond with intelligent, insightful, articulate co-founder wisdom tailored directly to Tamil Nadu 10th standard SSLC exams. Speak warmly and constructively.`;


/**
 * Executes a full ReAct / Function-Calling turn with Groq.
 * Returns null if LLM is unavailable or fails, allowing seamless deterministic fallback.
 */
export async function executeAgentBrainTurn(
  session: CoFounderSession,
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{ replyText: string; toolExecuted?: string } | null> {
  const rawKey = process.env.GROQ_API_KEY || '';
  const groqKey = rawKey.replace(/^["']|["']$/g, '').trim();
  if (!groqKey) return null;

  try {
    // Construct message thread
    const messages: any[] = [
      { role: 'system', content: COFOUNDER_SYSTEM_PROMPT },
      ...history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ];

    const rawModel = process.env.GROQ_MODEL || '';
    const configuredModel = rawModel.replace(/^["']|["']$/g, '').trim();

    const candidateModels = Array.from(
      new Set(
        [
          configuredModel,
          'llama-3.3-70b-versatile',
          'llama-3.1-8b-instant',
        ].filter(Boolean) as string[]
      )
    );

    let activeModel = candidateModels[0] || 'llama-3.3-70b-versatile';
    let assistantMsg: any = null;

    // 1. Initial LLM Call with Tool Definitions & Model Cascade
    for (const model of candidateModels) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${groqKey}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlessingPowerGuide/1.0',
          },
          body: JSON.stringify({
            model,
            messages,
            tools: COFOUNDER_TOOLS,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 1500,
          }),
        });

        if (res.status === 429 || res.status === 404 || res.status === 400) {
          const errDetail = await res.text().catch(() => '');
          console.warn(`[AgentBrain] Model ${model} returned ${res.status}: ${errDetail.slice(0, 120)}. Trying fallback model...`);
          continue;
        }

        if (!res.ok) {
          console.warn(`[AgentBrain] Groq error with ${model}: ${res.status}`);
          continue;
        }

        const data = await res.json();
        const choice = data.choices?.[0];
        if (choice?.message) {
          assistantMsg = choice.message;
          activeModel = model;
          break;
        }
      } catch (err: any) {
        console.warn(`[AgentBrain] Network error with ${model}:`, err.message);
      }
    }

    if (!assistantMsg) {
      console.warn('[AgentBrain] All candidate models exhausted or rate-limited.');
      return null;
    }

    // 2. If no tools were called, return the conversational response directly
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      if (assistantMsg.content && assistantMsg.content.trim()) {
        return { replyText: assistantMsg.content.trim() };
      }
      return null;
    }

    // 3. Execute Tool Calls
    const toolCall = assistantMsg.tool_calls[0];
    const fnName = toolCall.function.name;
    let fnArgs: any = {};
    try {
      fnArgs = JSON.parse(toolCall.function.arguments);
    } catch (_) {
      fnArgs = {};
    }

    console.log(`[AgentBrain] Executing Tool: ${fnName} with args:`, fnArgs);
    let toolResult: any = null;

    if (fnName === 'launch_books') {
      toolResult = await (businessToolRegistry as any).launch_books(fnArgs);
    } else if (fnName === 'create_coupon') {
      toolResult = await businessToolRegistry.create_coupon(fnArgs);
    } else if (fnName === 'delete_coupon') {
      toolResult = await businessToolRegistry.delete_coupon(fnArgs.code);
    } else if (fnName === 'get_coupon') {
      toolResult = await businessToolRegistry.get_coupon(fnArgs.code);
    } else if (fnName === 'toggle_coupon') {
      toolResult = await businessToolRegistry.toggle_coupon(fnArgs.code, fnArgs.isActive);
    } else if (fnName === 'update_stock') {
      toolResult = await businessToolRegistry.update_stock(fnArgs);
    } else if (fnName === 'query_order') {
      toolResult = await businessToolRegistry.query_order(fnArgs);
    } else if (fnName === 'get_sales_metrics') {
      toolResult = await businessToolRegistry.get_sales_metrics();
    } else if (fnName === 'get_inventory_health') {
      toolResult = await businessToolRegistry.get_inventory_health();
    } else if (fnName === 'activate_theme') {
      const act = await businessToolRegistry.activate_theme(fnArgs.themeId, fnArgs.durationHours);
      toolResult = {
        success: act.success,
        theme: act.theme.name,
        accentColor: act.theme.accentColor,
        expiresAt: act.expiresAt,
        message: `🎨 ${act.theme.name} is now live on the storefront! Ambient accent: ${act.theme.accentColor}, auto-revert: ${act.expiresAt.toISOString()}.`,
      };
    } else if (fnName === 'deactivate_theme') {
      const deactivated = await businessToolRegistry.deactivate_theme();
      toolResult = {
        success: true,
        message: deactivated
          ? `🎨 Festive theme cleared and storefront restored to standard appearance.`
          : `Standard theme is already active.`,
      };
    } else if (fnName === 'publish_announcement') {
      const instId = await businessToolRegistry.publish_announcement(fnArgs);
      toolResult = {
        success: true,
        instructionId: instId,
        type: fnArgs.type,
        severity: fnArgs.severity || 'INFO',
        message: `📢 Storefront notice published live: "${fnArgs.content}" [Severity: ${fnArgs.severity || 'INFO'}]. Visible across storefront.`,
      };
    } else if (fnName === 'remove_announcement') {
      const removed = await businessToolRegistry.remove_announcement(fnArgs.typeOrId || 'ALL');
      toolResult = {
        success: removed,
        message: removed
          ? `✅ Successfully deactivated storefront announcement (${fnArgs.typeOrId || 'ALL'}). Live website is now restored to normal operations.`
          : `Notice already expired or not active in database.`,
      };
    } else if (fnName === 'execute_launch_experience') {
      toolResult = await (businessToolRegistry as any).execute_launch_experience(fnArgs);
    } else if (fnName === 'get_product_status') {
      toolResult = await (businessToolRegistry as any).get_product_status(fnArgs);
    } else if (fnName === 'deploy_exam_timetable') {
      toolResult = await (businessToolRegistry as any).deploy_exam_timetable(fnArgs);
    } else if (fnName === 'remove_exam_timetable') {
      toolResult = await (businessToolRegistry as any).remove_exam_timetable();
    } else if (fnName === 'diagnose_responsive_ui') {
      toolResult = await (businessToolRegistry as any).diagnose_responsive_ui(fnArgs);
    } else if (fnName === 'audit_and_fix_website_bugs') {
      toolResult = await (businessToolRegistry as any).audit_and_fix_website_bugs();
    } else if (fnName === 'diagnose_checkout_pipeline') {
      toolResult = await (businessToolRegistry as any).diagnose_checkout_pipeline();
    } else if (fnName === 'repair_cofounder_pipeline') {
      toolResult = await (businessToolRegistry as any).repair_cofounder_pipeline(fnArgs);
    } else if (fnName === 'analyze_design_reference') {
      toolResult = await (businessToolRegistry as any).analyze_design_reference(fnArgs);
    } else if (fnName === 'execute_website_design_upgrade') {
      toolResult = await (businessToolRegistry as any).execute_website_design_upgrade(fnArgs);
    } else if (fnName === 'list_active_tasks') {
      toolResult = await (businessToolRegistry as any).list_active_tasks(fnArgs);
    } else if (fnName === 'rollback_task') {
      toolResult = await (businessToolRegistry as any).rollback_task(fnArgs);
    } else {
      toolResult = { error: `Tool ${fnName} is not recognized.` };
    }

    // Direct return for structured diagnostic completion reports
    if (toolResult && toolResult.reportFormatted) {
      return {
        replyText: toolResult.reportFormatted,
        toolExecuted: fnName,
      };
    }

    // 4. Feed Tool Result back to LLM for final synthesis
    const followUpMessages = [
      ...messages,
      assistantMsg,
      {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      },
    ];

    const followUpRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${groqKey.trim()}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BlessingPowerGuide/1.0',
      },
      body: JSON.stringify({
        model: activeModel,
        messages: followUpMessages,
        temperature: 0.2,
        max_tokens: 1500,
      }),
    });

    if (followUpRes.ok) {
      const followUpJson = await followUpRes.json();
      const finalContent = followUpJson.choices?.[0]?.message?.content;
      if (finalContent && finalContent.trim()) {
        return {
          replyText: finalContent.trim(),
          toolExecuted: fnName,
        };
      }
    }

    // Fallback if follow-up failed: Format based on tool result
    if (toolResult && toolResult.message) {
      return { replyText: toolResult.message, toolExecuted: fnName };
    }

    return null;
  } catch (err) {
    console.warn('[AgentBrain] Unexpected error in agent loop:', err);
    return null;
  }
}
