import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

export async function POST(request: Request) {
  let client: any = null;
  try {
    const { email, otp, newPassword } = await request.json();

    if (!email || !otp || !newPassword) {
      return NextResponse.json({ error: 'Email, OTP code, and new password are required.' }, { status: 400 });
    }

    if (String(newPassword).length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    client = await getDbClient();

    const otpRes = await client.query(
      `SELECT * FROM whatsapp_otps
       WHERE (LOWER(email) = $1 OR phone = $1) AND otp = $2 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [cleanEmail, cleanOtp]
    );

    if (otpRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Invalid or expired WhatsApp OTP code. Please check WhatsApp.' }, { status: 400 });
    }

    const passHash = hashPassword(newPassword);
    const updateRes = await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE LOWER(email) = $2 RETURNING id, name, email`,
      [passHash, cleanEmail]
    );

    if (updateRes.rows.length === 0) {
      await client.end();
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    await client.query(`DELETE FROM whatsapp_otps WHERE LOWER(email) = $1 OR phone = $1`, [cleanEmail]);
    await client.end();

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully! You can now log in with your new password.',
    });
  } catch {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Failed to reset password. Database error.' }, { status: 500 });
  }
}
