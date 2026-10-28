import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';
import { gatherCoFounderMetrics } from '@/lib/cofounder/observer';
import { getRecentIncidents, getTasks, getLatestDigest, updateTaskStatus, createTask } from '@/lib/cofounder/memory';
import { getRecentManagedTasks, rollbackManagedTask } from '@/lib/cofounder/taskEngine';
import { investigateProblem } from '@/lib/cofounder/reasoner';
import { orchestrateCoFounderTurn } from '@/lib/cofounder/conversationOrchestrator';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const admin = await verifyAdminRequest(req);
  if (!admin.isAdmin) {
    if (!admin.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required');
  }

  try {
    const [metrics, incidents, tasks, latestDigest, managedTasks] = await Promise.all([
      gatherCoFounderMetrics(),
      getRecentIncidents(10),
      getTasks(undefined, 20),
      getLatestDigest('DAILY'),
      getRecentManagedTasks(20).catch(() => []),
    ]);

    return NextResponse.json({
      metrics,
      incidents,
      tasks,
      managedTasks,
      latestDigest,
      telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && (process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_ADMIN_CHAT_ID)),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    });
  } catch (err: any) {
    console.error('[CoFounder Status API Error]:', err);
    return NextResponse.json({ error: 'Failed to retrieve co-founder status' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdminRequest(req);
  if (!admin.isAdmin) {
    if (!admin.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required');
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim();

    // 1. Investigate or Conversational Partner Chat
    if (action === 'investigate') {
      const query = String(body.query || '').trim();
      if (!query) {
        return NextResponse.json({ error: 'Query is required' }, { status: 400 });
      }

      const lower = query.toLowerCase();
      const isExplicitDiagnostic =
        query.startsWith('/think') ||
        lower.startsWith('investigate') ||
        lower.includes('why did sales') ||
        lower.includes('why are orders') ||
        lower.includes('why has checkout') ||
        (lower.includes('checkout') && (lower.includes('broken') || lower.includes('drop')));

      if (isExplicitDiagnostic) {
        const metrics = await gatherCoFounderMetrics();
        const pastIncidents = await getRecentIncidents(5);
        const answer = await investigateProblem(query.replace(/^\/think\s*/i, ''), metrics, pastIncidents);
        return NextResponse.json({ success: true, answer });
      }

      // Run through unified stateful conversational orchestrator
      const orchResult = await orchestrateCoFounderTurn('admin-panel', query, admin.user?.userId || 'admin');
      return NextResponse.json({ success: true, answer: orchResult.replyText });
    }

    // 2. Approve, Reject, or Complete Task
    if (action === 'update_task') {
      const taskId = String(body.taskId || '').trim();
      const status = body.status;
      if (!taskId || (status !== 'APPROVED' && status !== 'REJECTED' && status !== 'EXECUTED' && status !== 'COMPLETED')) {
        return NextResponse.json({ error: 'Valid taskId and status required' }, { status: 400 });
      }
      await updateTaskStatus(taskId, status, { by: admin.user?.userId || 'admin', at: new Date().toISOString() });
      return NextResponse.json({ success: true, taskId, status });
    }

    // 2b. Complete All Pending Tasks
    if (action === 'complete_all_tasks' || action === 'clear_all_tasks') {
      const { completeAllPendingTasks } = await import('@/lib/cofounder/memory');
      const updatedCount = await completeAllPendingTasks();
      return NextResponse.json({ success: true, updatedCount });
    }

    // 2c. Rollback Task
    if (action === 'rollback_task') {
      const taskId = String(body.taskId || '').trim();
      if (!taskId) {
        return NextResponse.json({ error: 'taskId is required for rollback' }, { status: 400 });
      }
      const rollbackRes = await rollbackManagedTask(taskId);
      return NextResponse.json(rollbackRes);
    }

    // 3. Create Task
    if (action === 'create_task') {
      const title = String(body.title || '').trim();
      const description = String(body.description || '').trim();
      const department = body.department || 'CTO';
      const permission_level = Number(body.permission_level) || 1;

      if (!title) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 });
      }

      const id = await createTask({
        title,
        description,
        department,
        permission_level: permission_level as any,
      });

      return NextResponse.json({ success: true, taskId: id });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
