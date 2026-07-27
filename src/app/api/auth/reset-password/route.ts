import { NextResponse } from 'next/server';
import { tryGetDbClient, releaseDbClient } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { isStrongPassword } from '@/lib/authValidation';

function normalizePhoneDigits(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.slice(-10);
}

export async function POST(request: Request) {
  let client: any = null;
  try {
    const { email, phone, otp, newPassword } = await request.json();

    if (!otp || !newPassword) {
      return NextResponse.json({ error: 'OTP code and new password are required.' }, { status: 400 });
    }

    if (!isStrongPassword(String(newPassword))) {
      return NextResponse.json({
        error: 'Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character.',
      }, { status: 400 });
    }

    const cleanEmail = String(email || '').toLowerCase().trim();
    const cleanPhone = normalizePhoneDigits(phone || email || '');
    const cleanOtp = String(otp).trim();

    if (!cleanPhone && !cleanEmail.includes('@')) {
      return NextResponse.json({ error: 'Mobile number is required.' }, { status: 400 });
    }

    client = await tryGetDbClient();
    if (!client) {
      return NextResponse.json({ error: 'Database unavailable. Try again.' }, { status: 503 });
    }

    const otpRes = await client.query(
      `SELECT * FROM whatsapp_otps
       WHERE otp = $1
         AND expires_at > NOW()
         AND (
           ($2 <> '' AND phone = $2)
           OR ($2 <> '' AND RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '\\D', '', 'g'), 10) = $2)
           OR ($3 <> '' AND LOWER(email) = $3)
         )
       ORDER BY created_at DESC LIMIT 1`,
      [cleanOtp, cleanPhone, cleanEmail.includes('@') ? cleanEmail : '']
    );

    if (otpRes.rows.length === 0) {
      releaseDbClient(client);
      return NextResponse.json(
        { error: 'Invalid or expired WhatsApp OTP code. Please check WhatsApp.' },
        { status: 400 }
      );
    }

    const otpRow = otpRes.rows[0];
    const otpPhone = normalizePhoneDigits(otpRow.phone || cleanPhone);
    const otpEmail = String(otpRow.email || '').toLowerCase();

    const passHash = hashPassword(newPassword);
    const updateRes = await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE ($2 <> '' AND (
               phone = $2
               OR REPLACE(phone, '+', '') = $2
               OR RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '\\D', '', 'g'), 10) = $2
             ))
          OR ($3 <> '' AND LOWER(email) = $3)
       RETURNING id, name, email, phone`,
      [passHash, otpPhone || cleanPhone, otpEmail.includes('@') ? otpEmail : cleanEmail]
    );

    if (updateRes.rows.length === 0) {
      releaseDbClient(client);
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    }

    await client.query(`DELETE FROM whatsapp_otps WHERE phone = $1 OR LOWER(email) = $2`, [
      otpPhone || cleanPhone,
      otpEmail || cleanEmail,
    ]);
    releaseDbClient(client);

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully! Sign in with your mobile number and new password.',
    });
  } catch {
    releaseDbClient(client);
    return NextResponse.json({ error: 'Failed to reset password. Database error.' }, { status: 500 });
  }
}
