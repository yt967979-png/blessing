import { queryDb } from '@/lib/db';
import { clientIp } from '@/lib/serverSecurity';

export interface AdminAuditEntry {
  id?: string;
  actorId: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string;
}

/**
 * Record an administrative or security-critical action into the immutable audit_logs table.
 * Includes IP address and User Agent for forensic traceability.
 */
export async function recordAdminAudit(
  entry: AdminAuditEntry,
  req?: Request
): Promise<void> {
  try {
    const id = `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const ip = entry.ipAddress || (req ? clientIp(req) : null);
    const ua = entry.userAgent || (req ? (req.headers.get('user-agent') || '').slice(0, 500) : null);
    const actor = entry.actorEmail ? `${entry.actorId} (${entry.actorEmail})` : entry.actorId;
    const detailsJson = JSON.stringify(entry.details || {});

    await queryDb(
      `INSERT INTO audit_logs (id, actor_id, action, target_type, target_id, details, ip_address, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [id, actor, entry.action, entry.targetType, entry.targetId, detailsJson, ip, ua]
    );
  } catch (err) {
    // Non-blocking for critical user transactions, logged for operational visibility
    console.error('[AdminAudit] Failed to insert audit log:', err);
  }
}

/**
 * Fetch audit logs with pagination and optional filtering by action or target type.
 */
export async function getAdminAuditLogs(options?: {
  limit?: number;
  offset?: number;
  action?: string;
  targetType?: string;
}) {
  const limit = Math.min(100, Math.max(1, options?.limit || 50));
  const offset = Math.max(0, options?.offset || 0);
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (options?.action) {
    conditions.push(`action = $${idx++}`);
    params.push(options.action);
  }
  if (options?.targetType) {
    conditions.push(`target_type = $${idx++}`);
    params.push(options.targetType);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);
  const limitIdx = idx++;
  params.push(offset);
  const offsetIdx = idx++;

  const res = await queryDb(
    `SELECT id, actor_id, action, target_type, target_id, details, ip_address, user_agent, created_at
     FROM audit_logs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  );

  const countRes = await queryDb(
    `SELECT COUNT(*)::int AS total FROM audit_logs ${whereClause}`,
    params.slice(0, conditions.length)
  );

  return {
    logs: res.rows,
    total: countRes.rows[0]?.total || 0,
    limit,
    offset,
  };
}
