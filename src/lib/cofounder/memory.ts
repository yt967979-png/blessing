import { queryDb } from '@/lib/db';
import {
  CofounderIncident,
  CofounderTask,
  CofounderDigest,
  IncidentSeverity,
  CofounderDepartment,
  TaskPermissionLevel,
} from './types';

/**
 * ─── 1. EPISODIC INCIDENT MEMORY ───────────────────────────────────────────
 */
export async function saveIncident(data: {
  severity: IncidentSeverity;
  department: CofounderDepartment;
  title: string;
  symptoms: string;
  root_cause?: string;
  resolution?: string;
  confidence_score?: number;
}): Promise<string> {
  const id = `inc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  await queryDb(
    `INSERT INTO cofounder_incidents (id, severity, department, title, symptoms, root_cause, resolution, confidence_score, status, detected_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', NOW())`,
    [
      id,
      data.severity,
      data.department,
      data.title,
      data.symptoms,
      data.root_cause || null,
      data.resolution || null,
      data.confidence_score ?? 0.85,
    ]
  );
  return id;
}

export async function getRecentIncidents(limit = 10): Promise<CofounderIncident[]> {
  const res = await queryDb(
    `SELECT id, severity, department, title, symptoms, root_cause, resolution, confidence_score, status, detected_at, resolved_at
     FROM cofounder_incidents
     ORDER BY detected_at DESC
     LIMIT $1`,
    [limit]
  );
  return (res.rows || []).map((r) => ({
    id: r.id,
    severity: r.severity,
    department: r.department,
    title: r.title,
    symptoms: r.symptoms,
    root_cause: r.root_cause || undefined,
    resolution: r.resolution || undefined,
    confidence_score: r.confidence_score ? Number(r.confidence_score) : undefined,
    status: r.status,
    detected_at: r.detected_at,
    resolved_at: r.resolved_at || undefined,
  }));
}

export async function resolveIncident(id: string, resolution: string): Promise<boolean> {
  const res = await queryDb(
    `UPDATE cofounder_incidents
     SET status = 'RESOLVED', resolution = $2, resolved_at = NOW()
     WHERE id = $1`,
    [id, resolution]
  );
  return (res.rowCount || 0) > 0;
}

/**
 * ─── 2. OPERATIONAL TASKS & APPROVAL QUEUE ──────────────────────────────────
 */
export async function createTask(data: {
  title: string;
  description: string;
  department: CofounderDepartment;
  permission_level?: TaskPermissionLevel;
  proposed_action?: any;
  status?: 'PENDING' | 'APPROVED' | 'COMPLETED' | 'EXECUTED';
}): Promise<string> {
  const id = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const status = data.status || (data.permission_level && data.permission_level <= 2 ? 'COMPLETED' : 'PENDING');
  await queryDb(
    `INSERT INTO cofounder_tasks (id, title, description, department, permission_level, status, proposed_action, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
    [
      id,
      data.title,
      data.description,
      data.department,
      data.permission_level ?? 1,
      status,
      data.proposed_action ? JSON.stringify(data.proposed_action) : null,
    ]
  );
  return id;
}

export async function getTasks(status?: string, limit = 20): Promise<CofounderTask[]> {
  const where = status ? `WHERE status = $1` : '';
  const params = status ? [status, limit] : [limit];
  const res = await queryDb(
    `SELECT id, title, description, department, permission_level, status, proposed_action, execution_result, created_at, updated_at
     FROM cofounder_tasks
     ${where}
     ORDER BY created_at DESC
     LIMIT $${status ? 2 : 1}`,
    params
  );
  return (res.rows || []).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    department: r.department,
    permission_level: r.permission_level,
    status: r.status,
    proposed_action: r.proposed_action,
    execution_result: r.execution_result,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function updateTaskStatus(id: string, status: 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'COMPLETED', result?: any): Promise<boolean> {
  const res = await queryDb(
    `UPDATE cofounder_tasks
     SET status = $2, execution_result = $3, updated_at = NOW()
     WHERE id = $1`,
    [id, status, result ? JSON.stringify(result) : null]
  );
  return (res.rowCount || 0) > 0;
}

export async function completeAllPendingTasks(): Promise<number> {
  const res = await queryDb(
    `UPDATE cofounder_tasks
     SET status = 'COMPLETED', updated_at = NOW()
     WHERE status = 'PENDING'`
  );
  return res.rowCount || 0;
}

export async function clearCompletedTasks(): Promise<number> {
  const res = await queryDb(
    `DELETE FROM cofounder_tasks WHERE status = 'COMPLETED' OR status = 'REJECTED'`
  );
  return res.rowCount || 0;
}

/**
 * ─── 3. DAILY DIGEST ARCHIVE ────────────────────────────────────────────────
 */
export async function saveDigest(data: {
  digest_type: 'DAILY' | 'WEEKLY';
  period_date: string;
  metrics_summary: any;
  ai_synthesis: string;
  delivered_telegram?: boolean;
}): Promise<string> {
  const id = `dig_${data.period_date}_${data.digest_type.toLowerCase()}`;
  await queryDb(
    `INSERT INTO cofounder_digests (id, digest_type, period_date, metrics_summary, ai_synthesis, delivered_telegram, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       metrics_summary = EXCLUDED.metrics_summary,
       ai_synthesis = EXCLUDED.ai_synthesis,
       delivered_telegram = EXCLUDED.delivered_telegram`,
    [
      id,
      data.digest_type,
      data.period_date,
      JSON.stringify(data.metrics_summary),
      data.ai_synthesis,
      data.delivered_telegram || false,
    ]
  );
  return id;
}

export async function getLatestDigest(type: 'DAILY' | 'WEEKLY' = 'DAILY'): Promise<CofounderDigest | null> {
  const res = await queryDb(
    `SELECT id, digest_type, period_date, metrics_summary, ai_synthesis, delivered_telegram, created_at
     FROM cofounder_digests
     WHERE digest_type = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [type]
  );
  const r = res.rows?.[0];
  if (!r) return null;
  return {
    id: r.id,
    digest_type: r.digest_type,
    period_date: r.period_date,
    metrics_summary: typeof r.metrics_summary === 'string' ? JSON.parse(r.metrics_summary) : r.metrics_summary,
    ai_synthesis: r.ai_synthesis,
    delivered_telegram: r.delivered_telegram,
    created_at: r.created_at,
  };
}

/**
 * ─── 4. SEMANTIC MEMORY & STORE POLICIES ─────────────────────────────────────
 */
export async function getKnowledge(key: string): Promise<any> {
  const res = await queryDb(`SELECT value FROM cofounder_knowledge WHERE key = $1 LIMIT 1`, [key]);
  return res.rows?.[0]?.value || null;
}

export async function setKnowledge(key: string, category: string, value: any): Promise<void> {
  await queryDb(
    `INSERT INTO cofounder_knowledge (key, category, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (key) DO UPDATE SET
       category = EXCLUDED.category,
       value = EXCLUDED.value,
       updated_at = NOW()`,
    [key, category, JSON.stringify(value)]
  );
}
