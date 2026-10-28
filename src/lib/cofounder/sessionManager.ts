import { queryDb } from '@/lib/db';

export interface CoFounderSessionEntities {
  school_name?: string;
  product_id?: string;
  product_title?: string;
  medium?: 'Tamil' | 'English' | string;
  quantity?: number;
  unit_price?: number;
  total_amount?: number;
  shipping_carrier?: string;
  shipping_fee?: number;
  contact_name?: string;
  contact_phone?: string;
  delivery_address?: string;
  notes?: string;
  last_topic?: string;
  payment_link_url?: string;
  payment_link_id?: string;
}

export interface TurnHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface CoFounderSession {
  id: string;
  chat_id: string;
  speaker: string;
  active_intent:
    | 'IDLE'
    | 'SCHOOL_BULK_ORDER'
    | 'PRODUCT_AVAILABILITY'
    | 'OPERATIONAL_UPDATE'
    | 'MAINTENANCE_NOTICE'
    | 'FESTIVE_THEME'
    | 'SALES_QUERY'
    | 'COUPON_MANAGEMENT'
    | 'TECHNICAL_INVESTIGATION'
    | 'CASUAL_CHAT';
  workflow_state:
    | 'IDLE'
    | 'REQUEST_RECEIVED'
    | 'PRODUCT_IDENTIFIED'
    | 'AVAILABILITY_CHECKED'
    | 'PRICE_VERIFIED'
    | 'DETAILS_REQUIRED'
    | 'AWAITING_APPROVAL'
    | 'PAYMENT_LINK_CREATING'
    | 'PAYMENT_LINK_CREATED'
    | 'AWAITING_PAYMENT'
    | 'PAYMENT_CONFIRMED'
    | 'COMPLETED'
    | 'CANCELLED';
  entities: CoFounderSessionEntities;
  history: TurnHistoryItem[];
  created_at: string;
  updated_at: string;
}

/**
 * Retrieves or creates a stateful conversation session for a Telegram chat or admin user.
 */
export async function getOrCreateSession(chatId: string | number, speaker: string = 'owner'): Promise<CoFounderSession> {
  const cId = String(chatId || 'admin-default');
  const existing = await queryDb(
    `SELECT id, chat_id, speaker, active_intent, workflow_state, entities, history, created_at, updated_at
     FROM cofounder_sessions
     WHERE chat_id = $1
     LIMIT 1`,
    [cId]
  ).catch(() => ({ rows: [] }));

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    return {
      id: row.id,
      chat_id: row.chat_id,
      speaker: row.speaker || 'owner',
      active_intent: row.active_intent || 'IDLE',
      workflow_state: row.workflow_state || 'IDLE',
      entities: typeof row.entities === 'string' ? JSON.parse(row.entities) : (row.entities || {}),
      history: typeof row.history === 'string' ? JSON.parse(row.history) : (row.history || []),
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  const newId = `cfs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  await queryDb(
    `INSERT INTO cofounder_sessions (id, chat_id, speaker, active_intent, workflow_state, entities, history, created_at, updated_at)
     VALUES ($1, $2, $3, 'IDLE', 'IDLE', '{}'::jsonb, '[]'::jsonb, NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`,
    [newId, cId, speaker]
  ).catch(() => {});

  return {
    id: newId,
    chat_id: cId,
    speaker,
    active_intent: 'IDLE',
    workflow_state: 'IDLE',
    entities: {},
    history: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Updates the session with merged entities, updated state machine, and turn history.
 * Retains existing entities unless explicitly overridden.
 */
export async function updateSession(
  sessionId: string,
  updates: {
    active_intent?: CoFounderSession['active_intent'];
    workflow_state?: CoFounderSession['workflow_state'];
    entities?: Partial<CoFounderSessionEntities>;
    userMessage?: string;
    assistantMessage?: string;
  }
): Promise<void> {
  const current = await queryDb(
    `SELECT entities, history FROM cofounder_sessions WHERE id = $1 LIMIT 1`,
    [sessionId]
  ).catch(() => ({ rows: [] }));

  if (current.rows.length === 0) return;

  const prevEntities: CoFounderSessionEntities =
    typeof current.rows[0].entities === 'string'
      ? JSON.parse(current.rows[0].entities)
      : (current.rows[0].entities || {});

  let prevHistory: TurnHistoryItem[] =
    typeof current.rows[0].history === 'string'
      ? JSON.parse(current.rows[0].history)
      : (current.rows[0].history || []);

  const mergedEntities: CoFounderSessionEntities = {
    ...prevEntities,
    ...(updates.entities || {}),
  };

  const nowIso = new Date().toISOString();
  if (updates.userMessage) {
    prevHistory.push({ role: 'user', content: updates.userMessage, timestamp: nowIso });
  }
  if (updates.assistantMessage) {
    prevHistory.push({ role: 'assistant', content: updates.assistantMessage, timestamp: nowIso });
  }

  // Keep last 12 turns for token economy while ensuring continuous context
  if (prevHistory.length > 12) {
    prevHistory = prevHistory.slice(-12);
  }

  const fields: string[] = ['updated_at = NOW()'];
  const values: any[] = [sessionId];
  let idx = 2;

  if (updates.active_intent) {
    fields.push(`active_intent = $${idx++}`);
    values.push(updates.active_intent);
  }
  if (updates.workflow_state) {
    fields.push(`workflow_state = $${idx++}`);
    values.push(updates.workflow_state);
  }

  fields.push(`entities = $${idx++}`);
  values.push(JSON.stringify(mergedEntities));

  fields.push(`history = $${idx++}`);
  values.push(JSON.stringify(prevHistory));

  await queryDb(
    `UPDATE cofounder_sessions SET ${fields.join(', ')} WHERE id = $1`,
    values
  ).catch(() => {});
}

/**
 * Resets a completed or cancelled workflow session back to IDLE.
 */
export async function resetSessionWorkflow(sessionId: string): Promise<void> {
  await queryDb(
    `UPDATE cofounder_sessions
     SET active_intent = 'IDLE', workflow_state = 'IDLE', entities = '{}'::jsonb, updated_at = NOW()
     WHERE id = $1`,
    [sessionId]
  ).catch(() => {});
}
