import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { applyRateLimitAsync } from '@/lib/serverSecurity';
import { createSessionToken, hashPassword, applySessionCookies, createDeviceId } from '@/lib/auth';
import { isValidMobileNumber, normalizeMobileDigits } from '@/lib/authValidation';

export async function POST(request: Request) {
  try {
    const rateLimit = await applyRateLimitAsync(request, 'register-user', 10, 60_000);
    if (!rateLimit.success && rateLimit.response) return rateLimit.response;

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const rawPhone = String(body.phone || '').trim();
    const password = String(body.password || '').trim();
    const confirmPassword = String(body.confirmPassword || body.confirm_password || '').trim();

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Please enter your full name.' }, { status: 400 });
    }

    const cleanPhone = normalizeMobileDigits(rawPhone);
    if (!isValidMobileNumber(cleanPhone)) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number.' }, { status: 400 });
    }
    const phoneWithCc = `91${cleanPhone}`;

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    if (confirmPassword && password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match. Please verify your entry.' }, { status: 400 });
    }

    // Check if phone or email already registered (10-digit or legacy 91… form)
    const existing = await queryDb(
      `SELECT id FROM users WHERE phone = $1 OR phone = $2 OR (email = $3 AND email != '') LIMIT 1`,
      [cleanPhone, phoneWithCc, email]
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
      [userId, name, email, cleanPhone, passwordHash]
    );

    const deviceId = createDeviceId();
    const token = createSessionToken(userId, 'customer', deviceId);
    const userObj = {
      id: userId,
      name,
      email,
      phone: cleanPhone,
      role: 'customer',
      needsProfile: false,
    };

    const response = NextResponse.json({ success: true, user: userObj });
    applySessionCookies(response, { token, deviceId, role: 'customer' });

    return response;
  } catch (err: any) {
    console.error('[register] error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to create account. Please try again.' }, { status: 500 });
  }
}
