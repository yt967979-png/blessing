import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { queryDb } from '@/lib/db';
import { applyRateLimitAsync } from '@/lib/serverSecurity';
import { createSessionToken } from '@/lib/auth';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(`blessing_salt_${password}`).digest('hex');
}

export async function POST(request: Request) {
  try {
    const rateLimit = await applyRateLimitAsync(request, 'verify-otp', 10, 60_000);
    if (!rateLimit.success && rateLimit.response) return rateLimit.response;

    const body = await request.json();
    const rawPhone = String(body.phone || '').trim();
    const otpInput = String(body.otp || '').trim();
    const nameInput = String(body.name || '').trim() || 'Verified Student';
    const emailInput = String(body.email || '').trim().toLowerCase();
    const passwordInput = String(body.password || '').trim();

    const cleanPhone = rawPhone.replace(/\D/g, '');
    const phoneWithCc = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    if (!otpInput || otpInput.length !== 6) {
      return NextResponse.json({ error: 'Please enter the valid 6-digit WhatsApp OTP.' }, { status: 400 });
    }

    // Verify OTP in DB
    const res = await queryDb(
      `SELECT code, expires_at FROM otp_codes WHERE phone = $1 LIMIT 1`,
      [phoneWithCc]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'No OTP requested for this phone number.' }, { status: 400 });
    }

    const row = res.rows[0];
    if (String(row.code).trim() !== otpInput) {
      return NextResponse.json({ error: 'Incorrect OTP code. Please check your WhatsApp.' }, { status: 400 });
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'OTP has expired. Please request a new code.' }, { status: 400 });
    }

    // Delete used OTP
    await queryDb(`DELETE FROM otp_codes WHERE phone = $1`, [phoneWithCc]);

    // Check existing user
    const existingUserRes = await queryDb(
      `SELECT id, role, status, email FROM users WHERE phone = $1 LIMIT 1`,
      [phoneWithCc]
    );

    let userId = '';
    let userRole = 'customer';
    const finalEmail = emailInput || `${phoneWithCc}@blessingpowerguide.internal`;

    if (existingUserRes.rows.length > 0) {
      const u = existingUserRes.rows[0];
      userId = u.id;
      userRole = u.role || 'customer';

      const passHash = passwordInput ? hashPassword(passwordInput) : null;
      if (passHash) {
        await queryDb(
          `UPDATE users SET name = COALESCE($1, name), email = COALESCE(NULLIF($2, ''), email), password_hash = $3, updated_at = NOW() WHERE id = $4`,
          [nameInput, emailInput, passHash, userId]
        );
      } else {
        await queryDb(
          `UPDATE users SET name = COALESCE($1, name), email = COALESCE(NULLIF($2, ''), email), updated_at = NOW() WHERE id = $3`,
          [nameInput, emailInput, userId]
        );
      }
    } else {
      userId = `user_wa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const passHash = passwordInput ? hashPassword(passwordInput) : hashPassword('default123');

      // If first registered user in DB, assign super_admin!
      const totalUsersRes = await queryDb(`SELECT COUNT(*)::int AS total FROM users`);
      if (Number(totalUsersRes.rows[0]?.total || 0) === 0) {
        userRole = 'super_admin';
      }

      await queryDb(
        `INSERT INTO users (id, name, email, phone, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [userId, nameInput, finalEmail, phoneWithCc, passHash, userRole]
      );
    }

    const token = createSessionToken(userId, userRole);
    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        name: nameInput,
        email: finalEmail,
        phone: phoneWithCc,
        role: userRole,
        token,
      },
    });

    response.cookies.set('bpg_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[verify-otp error]', err);
    return NextResponse.json({ error: err.message || 'OTP verification failed.' }, { status: 500 });
  }
}
