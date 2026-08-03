import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { applyRateLimitAsync } from '@/lib/serverSecurity';
import { createSessionToken, hashPassword } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const rateLimit = await applyRateLimitAsync(request, 'register-user', 10, 60_000);
    if (!rateLimit.success && rateLimit.response) return rateLimit.response;

    const body = await request.json();
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const rawPhone = String(body.phone || '').trim();
    const password = String(body.password || '').trim();
    const confirmPassword = String(body.confirmPassword || body.confirm_password || '').trim();

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Please enter your full name.' }, { status: 400 });
    }

    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number.' }, { status: 400 });
    }
    const phoneWithCc = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    if (!password || password.length < 4) {
      return NextResponse.json({ error: 'Password must be at least 4 characters long.' }, { status: 400 });
    }

    if (confirmPassword && password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match. Please verify your entry.' }, { status: 400 });
    }

    // Check if phone or email already registered
    const existing = await queryDb(
      `SELECT id FROM users WHERE phone = $1 OR phone = $2 OR (email = $3 AND email != '') LIMIT 1`,
      [phoneWithCc, cleanPhone, email]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'An account with this phone number or email already exists. Please sign in.' },
        { status: 400 }
      );
    }

    const passwordHash = hashPassword(password);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await queryDb(
      `INSERT INTO users (id, name, email, phone, role, password_hash, profile_completed, created_at)
       VALUES ($1, $2, $3, $4, 'customer', $5, true, NOW())`,
      [userId, name, email, phoneWithCc, passwordHash]
    );

    const token = createSessionToken(userId, 'customer');
    const userObj = {
      id: userId,
      name,
      email,
      phone: phoneWithCc,
      role: 'customer',
      needsProfile: false,
      token,
    };

    const response = NextResponse.json({ success: true, user: userObj });

    response.cookies.set('bpg_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return response;
  } catch (err: any) {
    console.error('[register] error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
  }
}
