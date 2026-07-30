import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { createSessionToken, hashPassword } from '@/lib/auth';
import { applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { isValidMobileNumber, normalizeMobileDigits } from '@/lib/authValidation';

/**
 * Guest checkout account — name + phone only (no Google / no SMS OTP).
 * Creates or reuses a customer by phone and returns a session token.
 */
export async function POST(request: NextRequest) {
  const rl = await applyRateLimitAsync(`guest:${clientIp(request)}`, 8, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait.' }, { status: 429 });
  }

  let client: any = null;
  try {
    const body = await request.json();
    const name = String(body.name || '').trim();
    const phone = normalizeMobileDigits(String(body.phone || ''));

    if (name.length < 2) {
      return NextResponse.json({ error: 'Enter your full name.' }, { status: 400 });
    }
    if (!isValidMobileNumber(phone)) {
      return NextResponse.json({ error: 'Enter a valid 10-digit mobile number.' }, { status: 400 });
    }

    client = await getDbClient();
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT FALSE`);

    const existing = await client.query(
      `SELECT id, name, email, phone, role, profile_completed, status
       FROM users
       WHERE RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $1
       LIMIT 1`,
      [phone]
    );

    let userId: string;
    let role = 'customer';

    if (existing.rows.length) {
      const u = existing.rows[0];
      if (String(u.status || '').toLowerCase() === 'banned') {
        return NextResponse.json({ error: 'This account cannot shop right now.' }, { status: 403 });
      }
      userId = u.id;
      role = u.role || 'customer';
      await client.query(
        `UPDATE users SET name = COALESCE(NULLIF($1, ''), name), phone = $2, profile_completed = TRUE, updated_at = NOW()
         WHERE id = $3`,
        [name, phone, userId]
      );
    } else {
      userId = `guest-${phone}-${Date.now().toString(36)}`;
      const email = `guest.${phone}@guest.blessingpowerguide.local`;
      await client.query(
        `INSERT INTO users (id, name, email, phone, password_hash, role, status, profile_completed, is_guest)
         VALUES ($1, $2, $3, $4, $5, 'customer', 'active', TRUE, TRUE)`,
        [userId, name, email, phone, hashPassword(`guest-${phone}-${Date.now()}`)]
      );
    }

    const token = createSessionToken(userId, role);
    const cookie = `bpg_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 3600}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`;

    const res = NextResponse.json({
      success: true,
      user: {
        id: userId,
        name,
        email: existing.rows[0]?.email || `guest.${phone}@guest.local`,
        phone,
        role,
        token,
        needsProfile: false,
        isGuest: true,
      },
      cart: [],
      wishlist: [],
    });
    res.headers.set('Set-Cookie', cookie);
    return res;
  } catch (err: any) {
    console.error('[guest auth]', err?.message || err);
    return NextResponse.json({ error: err.message || 'Guest sign-in failed' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
