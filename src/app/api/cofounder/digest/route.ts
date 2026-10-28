import { NextRequest, NextResponse } from 'next/server';
import { gatherCoFounderMetrics } from '@/lib/cofounder/observer';
import { generateDailyBriefing } from '@/lib/cofounder/reasoner';
import { saveDigest } from '@/lib/cofounder/memory';
import { sendTelegramMessage } from '@/lib/cofounder/telegram';

export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/cofounder/digest
 * Generates the executive morning briefing, saves it to persistent memory,
 * and pushes directly to the store owner's Telegram.
 */
export async function GET(req: NextRequest) {
  try {
    const metrics = await gatherCoFounderMetrics();
    const briefingText = await generateDailyBriefing(metrics);

    const todayDate = new Date().toISOString().split('T')[0];
    const deliveredTelegram = await sendTelegramMessage(briefingText);

    await saveDigest({
      digest_type: 'DAILY',
      period_date: todayDate,
      metrics_summary: metrics,
      ai_synthesis: briefingText,
      delivered_telegram: deliveredTelegram,
    });

    return NextResponse.json({
      success: true,
      periodDate: todayDate,
      deliveredTelegram,
      briefing: briefingText,
    });
  } catch (err: any) {
    console.error('[CoFounder Digest Error]:', err);
    return NextResponse.json({ error: err?.message || 'Failed to generate digest' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
