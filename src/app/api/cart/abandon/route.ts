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

/** Internal drain used by background worker (no HTTP auth). */
export async function drainAbandonedCarts(): Promise<{ sent: number }> {
  let client: any = null;
  let sent = 0;
  try {
    client = await getDbClient();
    await ensureAbandonTable(client);
    const hours = Number(process.env.ABANDON_CART_HOURS || 2);
    const res = await client.query(
      `SELECT id, phone, name, cart_json FROM abandoned_carts
       WHERE reminded = FALSE
         AND updated_at < NOW() - ($1 || ' hours')::interval
         AND updated_at > NOW() - INTERVAL '48 hours'
       LIMIT 40`,
      [String(Math.max(1, hours))]
    );

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.in').replace(/\/$/, '');
    const { sendWhatsAppMessageInProcess } = await import('@/lib/whatsapp');

    for (const row of res.rows) {
      let items: any[] = [];
      try {
        items = JSON.parse(row.cart_json || '[]');
      } catch {
        items = [];
      }
      const titles = items
        .slice(0, 3)
        .map((i: any) => i.title || 'Guide')
        .join(', ');
      const msg = `*BLESSING POWER GUIDE*\n*🛒 Cart waiting for you*\n\nDear *${row.name || 'Student'}*,\nYou left items in your cart:\n${titles || 'Study guides'}\n\nComplete your order with secure Razorpay checkout:\n${siteUrl}/cart\n\nReply STOP to opt out.`;
      try {
        await sendWhatsAppMessageInProcess(row.phone, msg);
        await client.query(`UPDATE abandoned_carts SET reminded = TRUE WHERE id = $1`, [row.id]);
        sent++;
      } catch {
        /* skip */
      }
    }
    return { sent };
  } finally {
    releaseDbClient(client);
  }
}

/** Ping: save cart for possible WhatsApp reminder (free, no SMS). */
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

/** Drain reminders — called from background worker or admin. */
export async function PUT(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret') || '';
  const expected = process.env.CRON_SECRET || '';
  const { verifyAdminRequest } = await import('@/lib/serverSecurity');
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin && !(expected && secret === expected)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { sent } = await drainAbandonedCarts();
    return NextResponse.json({ success: true, sent });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
