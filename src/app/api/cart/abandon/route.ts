import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { getAuthenticatedUser, applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { normalizeMobileDigits } from '@/lib/authValidation';

async function ensureAbandonTable(client: any) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS abandoned_carts (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(255),
      phone VARCHAR(20) NOT NULL,
      name VARCHAR(255),
      cart_json TEXT NOT NULL,
      reminded BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

/** Ping: save abandoned cart snapshot (no messaging). */
export async function POST(request: NextRequest) {
  const rl = await applyRateLimitAsync(`abandon:${clientIp(request)}`, 20, 60000);
  if (!rl.allowed) return NextResponse.json({ ok: true });

  let client: any = null;
  try {
    const session = await getAuthenticatedUser(request);
    const body = await request.json();
    const phone = normalizeMobileDigits(String(body.phone || ''));
    const name = String(body.name || 'Student').trim();
    const cart = Array.isArray(body.cart) ? body.cart : [];
    if (phone.length !== 10 || cart.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    client = await getDbClient();
    await ensureAbandonTable(client);
    const id = `ac-${phone}`;
    await client.query(
      `INSERT INTO abandoned_carts (id, user_id, phone, name, cart_json, reminded, updated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
       ON CONFLICT (id) DO UPDATE SET
         cart_json = EXCLUDED.cart_json,
         name = EXCLUDED.name,
         user_id = COALESCE(EXCLUDED.user_id, abandoned_carts.user_id),
         reminded = FALSE,
         updated_at = NOW()`,
      [id, session?.userId || null, phone, name, JSON.stringify(cart.slice(0, 20))]
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  } finally {
    releaseDbClient(client);
  }
}
