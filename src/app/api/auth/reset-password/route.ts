import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'bpg_salt_2026').digest('hex');
}

export async function POST(request: Request) {
  let client: any = null;
  try {
    const { email, otp, newPassword } = await request.json();

    if (!email || !otp || !newPassword) {
      return NextResponse.json({ error: 'Email, OTP code, and new password are required.' }, { status: 400 });
    }

    if (String(newPassword).length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    client = await getDbClient();

    // 1. Verify OTP from Railway PostgreSQL DB (unlimited non-expiring OTP validation)
    const otpRes = await client.query(
      `SELECT * FROM email_otps
       WHERE LOWER(email) = $1 AND otp = $2
       ORDER BY created_at DESC LIMIT 1`,
      [cleanEmail, cleanOtp]
    );

    if (otpRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Invalid or expired OTP code. Please try again.' }, { status: 400 });
    }

    // 2. Hash new password & update user in DB
    const passHash = hashPassword(newPassword);
    const updateRes = await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE LOWER(email) = $2 RETURNING id, name, email`,
      [passHash, cleanEmail]
    );

    if (updateRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    // 3. Clean up OTP
    await client.query(`DELETE FROM email_otps WHERE LOWER(email) = $1`, [cleanEmail]);
    await client.end();

    return NextResponse.json({
      success: true,
      message: '✅ Password reset successfully! You can now log in with your new password.',
    });
  } catch (err: any) {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Failed to reset password. Database error.' }, { status: 500 });
  }
}
