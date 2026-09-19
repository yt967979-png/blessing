import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { getAuthenticatedUser, applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { normalizeMobileDigits } from '@/lib/authValidation';

/** Ping: save abandoned cart snapshot (no messaging). */
export async function POST(request: NextRequest) {
  const rl = await applyRateLimitAsync(`abandon:${clientIp(request)}`, 20, 60000);
  if (!rl.allowed) return NextResponse.json({ ok: true });

  let client: any = null;
  try {
    const session = await getAuthenticatedUser(request).catch(() => null);
    const body = await request.json().catch(() => ({}));
    const phone = normalizeMobileDigits(String(body.phone || ''));
    const name = String(body.name || 'Student').trim().slice(0, 80);
    const cart = Array.isArray(body.cart) ? body.cart.slice(0, 20) : [];
    const userId = session?.userId || null;

    // If cart is emptied or cleared, immediately delete from abandoned_carts
    if (phone.length === 10 && (cart.length === 0 || body.cleared === true)) {
      client = await getDbClient();
      const id = `ac-${phone}`;
      await client.query(
        `DELETE FROM abandoned_carts WHERE id = $1 OR phone = $2 OR (user_id IS NOT NULL AND user_id = $3)`,
        [id, phone, userId]
      );
      return NextResponse.json({ ok: true, cleared: true });
    }

    if (phone.length !== 10 || cart.length === 0) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    client = await getDbClient();
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
      [id, userId, phone, name, JSON.stringify(cart)]
    );
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  } finally {
    releaseDbClient(client);
  }
}
