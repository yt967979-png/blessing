import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { applyRateLimitAsync } from '@/lib/serverSecurity';
import { createSessionToken, verifyPassword, SESSION_COOKIE_MAX_AGE_SEC } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const rateLimit = await applyRateLimitAsync(request, 'login-phone', 10, 60_000);
    if (!rateLimit.success && rateLimit.response) return rateLimit.response;

    const body = await request.json();
    const rawInput = String(body.phone || body.email || '').trim();
    const passwordInput = String(body.password || '').trim();

    if (!rawInput || !passwordInput) {
      return NextResponse.json({ error: 'Please enter your email/phone and password.' }, { status: 400 });
    }

    const cleanPhone = rawInput.replace(/\D/g, '');
    const phoneWithCc = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const emailInput = rawInput.toLowerCase();

    const res = await queryDb(
      `SELECT id, name, email, phone, role, status, password_hash 
       FROM users 
       WHERE (phone = $1 OR phone = $2 OR (email = $3 AND email != '')) LIMIT 1`,
      [phoneWithCc, cleanPhone, emailInput]
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: 'No account found matching these credentials. Please check or register.' }, { status: 404 });
    }

    const user = res.rows[0];

    if (String(user.status || '').toLowerCase() === 'banned') {
      return NextResponse.json({ error: 'Account disabled. Please contact support.' }, { status: 403 });
    }

    const isValidPassword = verifyPassword(passwordInput, user.password_hash);
    if (!isValidPassword) {
      return NextResponse.json({ error: 'Incorrect password. Please try again.' }, { status: 401 });
    }

    const userRole = user.role || 'customer';
    const token = createSessionToken(user.id, userRole);
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: userRole,
        needsProfile: false,
        token,
      },
    });

    response.cookies.set('bpg_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_COOKIE_MAX_AGE_SEC, // 10 years (stay signed in)
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[login-phone] error:', err?.message || err);
    return NextResponse.json({ error: 'Login failed. Please try again.' }, { status: 500 });
  }
}
