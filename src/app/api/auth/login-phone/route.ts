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
    const rateLimit = await applyRateLimitAsync(request, 'login-phone', 10, 60_000);
    if (!rateLimit.success && rateLimit.response) return rateLimit.response;

    const body = await request.json();
    const rawPhone = String(body.phone || '').trim();
    const passwordInput = String(body.password || '').trim();

    const cleanPhone = rawPhone.replace(/\D/g, '');
    const phoneWithCc = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    if (!cleanPhone || !passwordInput) {
      return NextResponse.json({ error: 'Please enter your phone number and password.' }, { status: 400 });
    }

    const res = await queryDb(
      `SELECT id, name, email, phone, role, status, password_hash FROM users WHERE phone = $1 OR phone = $2 LIMIT 1`,
      [phoneWithCc, cleanPhone]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'No account found with this phone number. Please register using WhatsApp OTP.' }, { status: 404 });
    }

    const user = res.rows[0];

    if (String(user.status || '').toLowerCase() === 'banned') {
      return NextResponse.json({ error: 'Account disabled. Please contact support.' }, { status: 403 });
    }

    const inputHash = hashPassword(passwordInput);
    if (user.password_hash && user.password_hash !== inputHash) {
      return NextResponse.json({ error: 'Incorrect password. Please try again.' }, { status: 401 });
    }

    const token = createSessionToken(user.id, user.role || 'customer');
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role || 'customer',
        token,
      },
    });

    response.cookies.set('bpg_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[login-phone] error:', err?.message || err);
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}
