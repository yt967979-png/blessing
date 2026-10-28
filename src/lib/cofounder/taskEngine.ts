/**
 * 👑 BLESSING POWER GUIDE — UNIVERSAL TASK EXECUTION & GOVERNANCE ENGINE
 * 
 * Formal Lifecycle State Machine:
 * REQUESTED ──► PLANNING ──► RUNNING ──► VERIFYING ──► COMPLETED
 *     │             │            │           │
 *     ▼             ▼            ▼           ▼
 *  BLOCKED     WAITING_FOR_   FAILED      FAILED
 *               APPROVAL
 * 
 * Features:
 * • Persistent PostgreSQL backing in `cofounder_tasks`
 * • Permission tiers (Tier 1: Read/Audit, Tier 2: Safe Autonomous, Tier 3: Founder Approval Required)
 * • Cryptographic / Evidence verification records for every completed action
 * • Reversibility and rollback hooks
 */

import { queryDb } from '@/lib/db';
import { CofounderDepartment, TaskPermissionLevel } from './types';

export type TaskLifecycleState =
  | 'REQUESTED'
  | 'PLANNING'
  | 'RUNNING'
  | 'VERIFYING'
  | 'WAITING_FOR_APPROVAL'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED'
  | 'ROLLED_BACK';

export interface TaskVerificationCheck {
  probe: string;
  passed: boolean;
  details: string;
  timestamp: string;
}

export interface ManagedTaskRecord {
  id: string;
  title: string;
  description: string;
  department: CofounderDepartment;
  permission_level: TaskPermissionLevel;
  status: TaskLifecycleState;
  proposed_action: any;
  execution_result: any;
  verification_checks: TaskVerificationCheck[];
  approval_notes?: string;
  rollback_action?: any;
  created_at: string;
  updated_at: string;
}

/**
 * 1. Create a newly managed task in REQUESTED or PLANNING state.
 */
export async function createManagedTask(params: {
  title: string;
  description: string;
  department: CofounderDepartment;
  permissionLevel?: TaskPermissionLevel;
  proposedAction?: any;
  initialState?: TaskLifecycleState;
  rollbackAction?: any;
}): Promise<ManagedTaskRecord> {
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const permLevel = params.permissionLevel ?? 1;
  const state: TaskLifecycleState =
    params.initialState || (permLevel >= 3 ? 'WAITING_FOR_APPROVAL' : 'PLANNING');

  const record: ManagedTaskRecord = {
    id,
    title: params.title,
    description: params.description,
    department: params.department,
    permission_level: permLevel,
    status: state,
    proposed_action: params.proposedAction || {},
    execution_result: {},
    verification_checks: [],
    rollback_action: params.rollbackAction || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await queryDb(
    `INSERT INTO cofounder_tasks (
      id, title, description, department, permission_level, status, proposed_action, execution_result, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
    [
      id,
      params.title,
      params.description,
      params.department,
      permLevel,
      state,
      JSON.stringify(params.proposedAction || {}),
      JSON.stringify({ verification_checks: [], rollback_action: params.rollbackAction || null }),
    ]
  );

  return record;
}

/**
 * 2. Advance task through the formal lifecycle state machine.
 */
export async function transitionTaskState(
  taskId: string,
  targetState: TaskLifecycleState,
  details?: {
    executionResult?: any;
    verificationChecks?: TaskVerificationCheck[];
    failureReason?: string;
    approvalNotes?: string;
  }
): Promise<boolean> {
  // Fetch current task state
  const existing = await getTaskById(taskId);
  if (!existing) return false;

  const currentResult = existing.execution_result || {};
  const updatedResult = {
    ...currentResult,
    ...(details?.executionResult || {}),
    verification_checks: [
      ...(currentResult.verification_checks || []),
      ...(details?.verificationChecks || []),
    ],
    last_transition: {
      from: existing.status,
      to: targetState,
      timestamp: new Date().toISOString(),
      notes: details?.failureReason || details?.approvalNotes || null,
    },
  };

  const res = await queryDb(
    `UPDATE cofounder_tasks
     SET status = $2, execution_result = $3, updated_at = NOW()
     WHERE id = $1`,
    [taskId, targetState, JSON.stringify(updatedResult)]
  );

  return (res.rowCount || 0) > 0;
}

/**
 * 3. Add verification evidence to a task before marking as completed.
 */
export async function verifyAndCompleteTask(
  taskId: string,
  checks: Array<{ probe: string; passed: boolean; details: string }>,
  summaryOutcome: string
): Promise<{ success: boolean; allPassed: boolean }> {
  const timestamp = new Date().toISOString();
  const formattedChecks: TaskVerificationCheck[] = checks.map((c) => ({
    ...c,
    timestamp,
  }));

  const allPassed = formattedChecks.every((c) => c.passed);
  const targetState: TaskLifecycleState = allPassed ? 'COMPLETED' : 'FAILED';

  const ok = await transitionTaskState(taskId, targetState, {
    verificationChecks: formattedChecks,
    executionResult: { outcome: summaryOutcome, all_checks_passed: allPassed },
    failureReason: allPassed ? undefined : 'One or more verification checks failed.',
  });

  return { success: ok, allPassed };
}

/**
 * 4. Retrieve a managed task by ID.
 */
export async function getTaskById(taskId: string): Promise<ManagedTaskRecord | null> {
  const res = await queryDb(
    `SELECT id, title, description, department, permission_level, status, proposed_action, execution_result, created_at, updated_at
     FROM cofounder_tasks
     WHERE id = $1`,
    [taskId]
  );

  if (!res.rows || res.rows.length === 0) return null;
  const r = res.rows[0];

  const execResult = r.execution_result || {};
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    department: r.department,
    permission_level: r.permission_level,
    status: r.status as TaskLifecycleState,
    proposed_action: r.proposed_action,
    execution_result: execResult,
    verification_checks: execResult.verification_checks || [],
    rollback_action: execResult.rollback_action,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

/**
 * 5. List all active or recent managed tasks for the dashboard & memory.
 */
export async function getRecentManagedTasks(limit = 20): Promise<ManagedTaskRecord[]> {
  const res = await queryDb(
    `SELECT id, title, description, department, permission_level, status, proposed_action, execution_result, created_at, updated_at
     FROM cofounder_tasks
     ORDER BY updated_at DESC
     LIMIT $1`,
    [limit]
  );

  return (res.rows || []).map((r: any) => {
    const execResult = r.execution_result || {};
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      department: r.department,
      permission_level: r.permission_level,
      status: r.status as TaskLifecycleState,
      proposed_action: r.proposed_action,
      execution_result: execResult,
      verification_checks: execResult.verification_checks || [],
      rollback_action: execResult.rollback_action,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

/**
 * 6. Rollback a previously executed task if a rollback action exists.
 */
export async function rollbackManagedTask(taskId: string): Promise<{ success: boolean; message: string }> {
  const task = await getTaskById(taskId);
  if (!task) {
    return { success: false, message: 'Task not found.' };
  }

  const rollback = task.rollback_action;
  if (!rollback || !rollback.type) {
    return { success: false, message: 'No registered rollback action for this task.' };
  }

  try {
    if (rollback.type === 'RESTORE_STOCK') {
      const { updateProductAvailability } = await import('./businessControls');
      await updateProductAvailability(rollback.bookId, {
        stock: rollback.previousStock,
        isComingSoon: rollback.previousComingSoon,
        availabilityReason: 'Reverted via AI Co-Founder task rollback',
      });
    } else if (rollback.type === 'DEACTIVATE_THEME') {
      const { deactivateTheme } = await import('./themeEngine');
      await deactivateTheme();
    } else if (rollback.type === 'DEACTIVATE_INSTRUCTION') {
      const { deactivateInstruction } = await import('./businessControls');
      await deactivateInstruction(rollback.instructionId);
    } else if (rollback.type === 'DELETE_COUPON') {
      const { executeDeleteCoupon } = await import('./tools/couponTool');
      await executeDeleteCoupon(rollback.couponCode);
    }

    await transitionTaskState(taskId, 'ROLLED_BACK', {
      executionResult: { rolled_back_at: new Date().toISOString() },
    });

    return { success: true, message: `Task ${taskId} rolled back successfully.` };
  } catch (err: any) {
    return { success: false, message: `Rollback failed: ${err.message}` };
  }
}
