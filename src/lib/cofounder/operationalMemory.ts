import { queryDb } from '@/lib/db';

export interface OperationalFact {
  id: string;
  book_id?: string | null;
  product_name: string;
  current_status: 'COMING_SOON' | 'IN_STOCK' | 'OUT_OF_STOCK' | 'PRINTING';
  delay_reason?: string | null;
  expected_availability?: string | null;
  is_confirmed: boolean; // TRUE = confirmed date, FALSE = estimate / unconfirmed
  customer_guidance?: string | null;
  next_action?: string | null;
  source: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Records or updates an operational business fact (e.g., printing delay, expected arrival date).
 * Grounded in PostgreSQL `cofounder_instructions` table.
 */
export async function recordOperationalFact(fact: {
  book_id?: string | null;
  product_name: string;
  current_status: 'COMING_SOON' | 'IN_STOCK' | 'OUT_OF_STOCK' | 'PRINTING';
  delay_reason?: string | null;
  expected_availability?: string | null;
  is_confirmed: boolean;
  customer_guidance?: string | null;
  next_action?: string | null;
  source?: string;
}): Promise<OperationalFact> {
  const id = `opfact-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const content = fact.delay_reason
    ? `${fact.product_name}: ${fact.current_status} due to ${fact.delay_reason}. Expected: ${fact.expected_availability || 'Unconfirmed'}`
    : `${fact.product_name}: ${fact.current_status}. Expected: ${fact.expected_availability || 'Unconfirmed'}`;

  // Deactivate any prior operational fact for this product
  if (fact.book_id) {
    await queryDb(
      `UPDATE cofounder_instructions
       SET is_active = false, updated_at = NOW()
       WHERE related_book_id = $1 AND instruction_type IN ('DELAY', 'COMING_SOON', 'FACT')`,
      [fact.book_id]
    ).catch(() => {});
  }

  await queryDb(
    `INSERT INTO cofounder_instructions (
      id, instruction_type, scope, content, related_book_id, expected_end, is_confirmed, customer_guidance, next_action, is_active, created_at, updated_at
    ) VALUES ($1, 'FACT', 'all', $2, $3, $4, $5, $6, $7, true, NOW(), NOW())`,
    [
      id,
      content,
      fact.book_id || null,
      fact.expected_availability || null,
      fact.is_confirmed,
      fact.customer_guidance || null,
      fact.next_action || null,
    ]
  );

  return {
    id,
    book_id: fact.book_id,
    product_name: fact.product_name,
    current_status: fact.current_status,
    delay_reason: fact.delay_reason,
    expected_availability: fact.expected_availability,
    is_confirmed: fact.is_confirmed,
    customer_guidance: fact.customer_guidance,
    next_action: fact.next_action,
    source: fact.source || 'owner_instruction',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Retrieves all currently active operational facts for products.
 * Used by both Co-Founder reasoning and Blessing AI customer support.
 */
export async function getActiveOperationalFacts(): Promise<OperationalFact[]> {
  const res = await queryDb(
    `SELECT id, instruction_type, content, related_book_id, expected_end, is_confirmed, customer_guidance, next_action, created_at, updated_at
     FROM cofounder_instructions
     WHERE is_active = true AND instruction_type IN ('FACT', 'DELAY', 'COMING_SOON')
     ORDER BY created_at DESC`
  ).catch(() => ({ rows: [] }));

  return res.rows.map((r: any) => ({
    id: r.id,
    book_id: r.related_book_id,
    product_name: r.content.split(':')[0] || 'Guidebook',
    current_status: r.content.includes('COMING_SOON') ? 'COMING_SOON' : 'PRINTING',
    delay_reason: r.content,
    expected_availability: r.expected_end,
    is_confirmed: Boolean(r.is_confirmed),
    customer_guidance: r.customer_guidance,
    next_action: r.next_action,
    source: 'owner_instruction',
    is_active: true,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}
