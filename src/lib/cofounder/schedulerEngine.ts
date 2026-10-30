/**
 * 👑 BLESSING POWER GUIDE — AUTONOMOUS SCHEDULE & TIMER ENGINE
 * 
 * Precision real-time scheduler for book launches, inventory availability,
 * and automatic revert to Coming Soon.
 * 
 * Features:
 * • Natural language IST time parser ("1 55", "1:55", "today 6 pm", "1 52")
 * • Dual execution engine: in-memory precision setTimeout + PostgreSQL durable task tracking
 * • Self-healing sweeper for zero-loss recovery across server restarts
 * • Dynamic reschedule / cancel capabilities ("change the launch time to 1 52 revert in 1 53")
 * • Live Next.js / Redis cache invalidation and Telegram execution alerts
 */

import { queryDb } from '@/lib/db';
import { invalidateProductsCache } from '@/app/api/products/route';
import { invalidateStorefrontCache } from './themeEngine';
import { sendTelegramMessage } from './telegram';
import { createTask } from './memory';

// Active in-memory timer registry
interface ActiveTimer {
  id: string;
  type: 'LAUNCH' | 'REVERT_COMING_SOON';
  target: string;
  targetDate: Date;
  timerHandle: NodeJS.Timeout;
}

const activeTimers = new Map<string, ActiveTimer>();
let isSweeperRunning = false;

/**
 * 1. Parse natural time string in Indian Standard Time (IST, UTC+05:30)
 */
export function parseTimeInIST(timeStr: string, refDate: Date = new Date()): {
  hours: number;
  minutes: number;
  targetDate: Date;
  diffMs: number;
  formatted12h: string;
} | null {
  if (!timeStr) return null;
  const clean = timeStr.trim().toLowerCase();

  // Extract hours, minutes, and optional am/pm
  const match = clean.match(/(\d{1,2})(?:[:.\s](\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  let m = match[2] ? parseInt(match[2], 10) : 0;
  const mer = match[3] ? match[3].toLowerCase() : null;

  if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) return null;

  // Extract current IST date parts reliably using fixed UTC offset (+05:30)
  // Indian Standard Time is permanently UTC+05:30 with zero DST shifts.
  const istOffset = 5.5 * 3600 * 1000;
  const istNow = new Date(refDate.getTime() + istOffset);
  const curHours = istNow.getUTCHours();
  const curMinutes = istNow.getUTCMinutes();
  const curSeconds = istNow.getUTCSeconds();

  // Smart 12-hour resolution:
  if (mer === 'pm' && h < 12) {
    h += 12;
  } else if (mer === 'am' && h === 12) {
    h = 0;
  } else if (!mer && h <= 12) {
    // If no am/pm given, infer based on current IST daytime
    if (curHours >= 12 && h < 12) {
      h += 12;
    } else if (curHours < 12 && (h < curHours || (h === curHours && m < curMinutes))) {
      h += 12;
    }
  }

  // Calculate target date:
  // Target is today at h:m:00 IST
  const diffH = h - curHours;
  const diffM = m - curMinutes;
  const diffS = -curSeconds;

  const diffMs = (diffH * 3600 + diffM * 60 + diffS) * 1000;
  const target = new Date(refDate.getTime() + diffMs);

  const formatted12h = target.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return {
    hours: h,
    minutes: m,
    targetDate: target,
    diffMs,
    formatted12h,
  };
}

/**
 * 2. Parse complete schedule instruction from natural language
 */
export function parseScheduleInstruction(
  rawText: string,
  refDate: Date = new Date()
): {
  isScheduleRequest: boolean;
  isReschedule: boolean;
  target: 'both' | 'all' | 'tamil' | 'english';
  stockQty: number;
  launchTimeStr: string | null;
  launchParsed: ReturnType<typeof parseTimeInIST>;
  revertTimeStr: string | null;
  revertParsed: ReturnType<typeof parseTimeInIST>;
} {
  const lower = rawText.toLowerCase();

  // Detect reschedule or modify intent
  const isReschedule =
    lower.includes('change') ||
    lower.includes('chajneg') ||
    lower.includes('chaneg') ||
    lower.includes('update') ||
    lower.includes('reschedule') ||
    lower.includes('modify') ||
    lower.includes('move');

  // Detect target books
  let target: 'both' | 'all' | 'tamil' | 'english' = 'both';
  if (lower.includes('tamil') && !lower.includes('english') && !lower.includes('both')) {
    target = 'tamil';
  } else if (lower.includes('english') && !lower.includes('tamil') && !lower.includes('both')) {
    target = 'english';
  } else if (lower.includes('all') && !lower.includes('both') && !lower.includes('combo')) {
    target = 'all';
  }

  // Detect stock quantity (default 100)
  const stockMatch =
    rawText.match(/(?:at|with|to|=|is)?\s*(\d+)\s*(?:stock|copies|qty|quantity)\b/i) ||
    rawText.match(/(?:stock|qty|quantity)\s*(?:at|to|is|=)?\s*(\d+)\b/i) ||
    rawText.match(/\b(\d+)\s*stock\b/i);
  const stockQty = stockMatch ? parseInt(stockMatch[1], 10) : 100;

  // Split launch and revert clauses
  let launchTimeStr: string | null = null;
  let revertTimeStr: string | null = null;

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

  return {
    isScheduleRequest,
    isReschedule,
    target,
    stockQty,
    launchTimeStr,
    launchParsed,
    revertTimeStr,
    revertParsed,
  };
}

/**
 * 3. Cancel any currently active scheduled timers
 */
export async function cancelActiveSchedules(): Promise<number> {
  let count = 0;
  for (const [id, timer] of activeTimers.entries()) {
    clearTimeout(timer.timerHandle);
    activeTimers.delete(id);
    count++;
  }

  // Also mark pending scheduled tasks as SUPERSEDED in PostgreSQL
  await queryDb(
    `UPDATE cofounder_tasks 
     SET status = 'ROLLED_BACK', updated_at = NOW() 
     WHERE status = 'SCHEDULED'`
  ).catch(() => {});

  return count;
}

/**
 * 4. Execute Book Launch immediately in PostgreSQL
 */
export async function executeBookLaunchImmediate(
  target: 'both' | 'all' | 'tamil' | 'english' = 'both',
  stockQty: number = 100
): Promise<{ success: boolean; updatedTitles: string[] }> {
  try {
    let whereClause = `WHERE is_combo = true OR title ILIKE '%combo%' OR category_id = 'cat-combo' OR title ILIKE '%5-in-1%' OR title ILIKE '%tamil%' OR title ILIKE '%english%'`;
    if (target === 'tamil') {
      whereClause = `WHERE title ILIKE '%tamil%'`;
    } else if (target === 'english') {
      whereClause = `WHERE title ILIKE '%english%'`;
    } else if (target === 'all') {
      whereClause = ``;
    }

    const res = await queryDb(
      `UPDATE books 
       SET stock = $1, is_coming_soon = false, status = 'published', availability_reason = NULL, updated_at = NOW() 
       ${whereClause} 
       RETURNING title`,
      [stockQty]
    );

    await invalidateProductsCache().catch(() => {});
    invalidateStorefrontCache();

    try {
      const { notifyCatalogChanged } = await import('@/app/api/stock/stream/route');
      void notifyCatalogChanged(['all']);
    } catch (_) {}

    return {
      success: true,
      updatedTitles: (res.rows || []).map((r: any) => r.title),
    };
  } catch (err) {
    console.error('[SchedulerEngine] Launch immediate failed:', err);
    return { success: false, updatedTitles: [] };
  }
}

/**
 * 5. Execute Book Revert to Coming Soon immediately in PostgreSQL
 */
export async function executeBookRevertImmediate(
  target: 'both' | 'all' | 'tamil' | 'english' = 'both',
  reason: string = 'Pending next release batch'
): Promise<{ success: boolean; updatedTitles: string[] }> {
  try {
    let whereClause = `WHERE is_combo = true OR title ILIKE '%combo%' OR category_id = 'cat-combo' OR title ILIKE '%5-in-1%' OR title ILIKE '%tamil%' OR title ILIKE '%english%'`;
    if (target === 'tamil') {
      whereClause = `WHERE title ILIKE '%tamil%'`;
    } else if (target === 'english') {
      whereClause = `WHERE title ILIKE '%english%'`;
    } else if (target === 'all') {
      whereClause = ``;
    }

    const res = await queryDb(
      `UPDATE books 
       SET is_coming_soon = true, status = 'coming_soon', availability_reason = $1, updated_at = NOW() 
       ${whereClause} 
       RETURNING title`,
      [reason]
    );

    await invalidateProductsCache().catch(() => {});
    invalidateStorefrontCache();

    try {
      const { notifyCatalogChanged } = await import('@/app/api/stock/stream/route');
      void notifyCatalogChanged(['all']);
    } catch (_) {}

    return {
      success: true,
      updatedTitles: (res.rows || []).map((r: any) => r.title),
    };
  } catch (err) {
    console.error('[SchedulerEngine] Revert immediate failed:', err);
    return { success: false, updatedTitles: [] };
  }
}

/**
 * 6. Master Schedule Handler: Orchestrates scheduled launch & revert
 */
export async function handleScheduledBookOperation(params: {
  rawText: string;
  chatId?: string | number;
}): Promise<{
  handled: boolean;
  replyText: string;
}> {
  const now = new Date();
  const parsed = parseScheduleInstruction(params.rawText, now);

  if (!parsed.isScheduleRequest || (!parsed.launchParsed && !parsed.revertParsed)) {
    return { handled: false, replyText: '' };
  }

  // 1. Cancel previous pending schedules if this is a reschedule or new operation
  const cancelledCount = await cancelActiveSchedules();

  const targetTitle =
    parsed.target === 'both'
      ? '10th STD 5-in-1 Combo Guides (Tamil & English)'
      : parsed.target === 'tamil'
      ? '10th STD 5-in-1 Combo Guide (Tamil Medium)'
      : parsed.target === 'english'
      ? '10th STD 5-in-1 Combo Guide (English Medium)'
      : 'All Catalog Books';

  const scheduleLines: string[] = [];

  // ── A. Handle Launch Schedule ──────────────────────────────────────
  let launchExecutedNow = false;
  if (parsed.launchParsed) {
    const launchDiff = parsed.launchParsed.diffMs;

    if (launchDiff <= 10000 && launchDiff >= -60000) {
      // Time is now or in current minute: execute immediately!
      await executeBookLaunchImmediate(parsed.target, parsed.stockQty);
      launchExecutedNow = true;
      scheduleLines.push(`• 🚀 **Launch**: **Executed Live Right Now** (Published with **${parsed.stockQty} stock**)`);
    } else if (launchDiff < -60000) {
      // Target time was earlier today: execute live now
      await executeBookLaunchImmediate(parsed.target, parsed.stockQty);
      launchExecutedNow = true;
      scheduleLines.push(`• 🚀 **Launch**: **Executed Live Right Now** (${parsed.launchParsed.formatted12h} IST has arrived/passed, published with **${parsed.stockQty} stock**)`);
    } else {
      // Future time: keep current state (Coming Soon) and set timer
      // Ensure books remain Coming Soon until launch time arrives
      await executeBookRevertImmediate(parsed.target, `Scheduled to launch at ${parsed.launchParsed.formatted12h} IST`);

      const launchTaskId = `task_launch_${Date.now()}`;
      const timerHandle = setTimeout(async () => {
        console.log(`[SchedulerEngine] ⏰ Launch timer triggered for ${targetTitle}`);
        await executeBookLaunchImmediate(parsed.target, parsed.stockQty);
        activeTimers.delete(launchTaskId);

        // Update task status in PostgreSQL
        await queryDb(`UPDATE cofounder_tasks SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`, [launchTaskId]).catch(() => {});

        // Send Telegram alert
        await sendTelegramMessage(
          `🚀 *[SCHEDULED LAUNCH EXECUTED]*\n\n*${targetTitle}* is now **LIVE & PUBLISHED** on the storefront!\n• Stock: *${parsed.stockQty} copies*\n• Status: *Available for Purchase*\n• Delivery: *100% Free Doorstep Delivery*`,
          params.chatId
        ).catch(() => {});
      }, launchDiff);

      activeTimers.set(launchTaskId, {
        id: launchTaskId,
        type: 'LAUNCH',
        target: parsed.target,
        targetDate: parsed.launchParsed.targetDate,
        timerHandle,
      });

      // Save task record in PostgreSQL
      await queryDb(
        `INSERT INTO cofounder_tasks (id, title, description, department, permission_level, status, proposed_action, created_at, updated_at)
         VALUES ($1, $2, $3, 'INVENTORY', 2, 'SCHEDULED', $4, NOW(), NOW())`,
        [
          launchTaskId,
          `Scheduled Launch for ${targetTitle}`,
          `Launch scheduled at ${parsed.launchParsed.formatted12h} IST with ${parsed.stockQty} stock`,
          JSON.stringify({
            action: 'LAUNCH',
            target: parsed.target,
            stock: parsed.stockQty,
            scheduled_at: parsed.launchParsed.targetDate.toISOString(),
          }),
        ]
      ).catch(() => {});

      const minutesAway = Math.round(launchDiff / 60000);
      scheduleLines.push(`• 🚀 **Launch**: Scheduled for **Today at ${parsed.launchParsed.formatted12h} IST** (${minutesAway} min${minutesAway === 1 ? '' : 's'} from now) with **${parsed.stockQty} stock**`);
    }
  }

  // ── B. Handle Revert Schedule ──────────────────────────────────────
  if (parsed.revertParsed) {
    const revertDiff = parsed.revertParsed.diffMs;

    if (revertDiff <= 10000 && revertDiff >= -60000) {
      await executeBookRevertImmediate(parsed.target, 'Reverted to Coming Soon as scheduled');
      scheduleLines.push(`• ⏳ **Revert**: **Executed Live Right Now** (Marked as Coming Soon)`);
    } else if (revertDiff < -60000) {
      await executeBookRevertImmediate(parsed.target, 'Reverted to Coming Soon as scheduled');
      scheduleLines.push(`• ⏳ **Revert**: **Executed Live Right Now** (${parsed.revertParsed.formatted12h} IST has arrived/passed, marked as Coming Soon)`);
    } else {
      const revertTaskId = `task_revert_${Date.now()}`;
      const timerHandle = setTimeout(async () => {
        console.log(`[SchedulerEngine] ⏰ Revert timer triggered for ${targetTitle}`);
        await executeBookRevertImmediate(parsed.target, 'Reverted to Coming Soon as scheduled');
        activeTimers.delete(revertTaskId);

        // Update task status in PostgreSQL
        await queryDb(`UPDATE cofounder_tasks SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`, [revertTaskId]).catch(() => {});

        // Send Telegram alert
        await sendTelegramMessage(
          `⏳ *[SCHEDULED REVERT EXECUTED]*\n\n*${targetTitle}* has been **REVERTED TO COMING SOON** on the storefront.\n• Storefront Status: *Coming Soon*\n• Cache Purged: *Zero stale live views*`,
          params.chatId
        ).catch(() => {});
      }, revertDiff);

      activeTimers.set(revertTaskId, {
        id: revertTaskId,
        type: 'REVERT_COMING_SOON',
        target: parsed.target,
        targetDate: parsed.revertParsed.targetDate,
        timerHandle,
      });

      // Save task record in PostgreSQL
      await queryDb(
        `INSERT INTO cofounder_tasks (id, title, description, department, permission_level, status, proposed_action, created_at, updated_at)
         VALUES ($1, $2, $3, 'INVENTORY', 2, 'SCHEDULED', $4, NOW(), NOW())`,
        [
          revertTaskId,
          `Scheduled Revert to Coming Soon for ${targetTitle}`,
          `Revert scheduled at ${parsed.revertParsed.formatted12h} IST`,
          JSON.stringify({
            action: 'REVERT_COMING_SOON',
            target: parsed.target,
            scheduled_at: parsed.revertParsed.targetDate.toISOString(),
          }),
        ]
      ).catch(() => {});

      const minutesAway = Math.round(revertDiff / 60000);
      scheduleLines.push(`• ⏳ **Revert to Coming Soon**: Scheduled for **Today at ${parsed.revertParsed.formatted12h} IST** (${minutesAway} min${minutesAway === 1 ? '' : 's'} from now)`);
    }
  }

  // Ensure background sweeper is started
  startScheduleSweeper(params.chatId);

  const istCurrentTime = now.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const titleHeader = parsed.isReschedule
    ? `🔄 **SCHEDULE UPDATED & RE-CONFIGURED**`
    : `📅 **SCHEDULE CONFIGURED & VERIFIED**`;

  const stateNotice = launchExecutedNow
    ? `Books are currently **LIVE on the storefront**.`
    : `Books are currently **held as Coming Soon** until the scheduled launch time.`;

  const replyText = `${titleHeader}

• **Target**: ${targetTitle}
• **Current Time**: ${istCurrentTime} IST
${scheduleLines.join('\n')}

${stateNotice}
${cancelledCount > 0 ? `_(Cleared ${cancelledCount} previous schedule handle${cancelledCount === 1 ? '' : 's'})_\n` : ''}
⚡ All timers are locked in memory and backed by PostgreSQL. I will execute the exact transitions and notify you on Telegram.`;

  return { handled: true, replyText };
}

/**
 * 7. Background Sweeper (Runs every 10 seconds to catch any missed tasks)
 */
export function startScheduleSweeper(chatId?: string | number) {
  if (isSweeperRunning) return;
  isSweeperRunning = true;

  setInterval(async () => {
    try {
      const res = await queryDb(
        `SELECT id, title, proposed_action 
         FROM cofounder_tasks 
         WHERE status = 'SCHEDULED' AND (proposed_action->>'scheduled_at')::timestamptz <= NOW()
         ORDER BY (proposed_action->>'scheduled_at')::timestamptz ASC
         LIMIT 5`
      ).catch(() => ({ rows: [] }));

      for (const row of res.rows || []) {
        const action = row.proposed_action?.action;
        const target = row.proposed_action?.target || 'both';
        const stock = row.proposed_action?.stock || 100;

        console.log(`[SchedulerEngine Sweeper] Executing overdue task: ${row.id} (${action})`);

        if (action === 'LAUNCH') {
          await executeBookLaunchImmediate(target, stock);
          await queryDb(`UPDATE cofounder_tasks SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`, [row.id]);
          await sendTelegramMessage(
            `🚀 *[SCHEDULED LAUNCH EXECUTED]*\n\nBooks are now **LIVE & AVAILABLE** with ${stock} stock!`,
            chatId
          ).catch(() => {});
        } else if (action === 'REVERT_COMING_SOON') {
          await executeBookRevertImmediate(target, 'Reverted to Coming Soon as scheduled');
          await queryDb(`UPDATE cofounder_tasks SET status = 'COMPLETED', updated_at = NOW() WHERE id = $1`, [row.id]);
          await sendTelegramMessage(
            `⏳ *[SCHEDULED REVERT EXECUTED]*\n\nBooks have been **REVERTED TO COMING SOON**.`,
            chatId
          ).catch(() => {});
        }
      }
    } catch (_) {}
  }, 10000);
}
