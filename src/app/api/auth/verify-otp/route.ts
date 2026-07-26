import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function POST(request: Request) {
  let client: any = null;
  try {
    const { email, otp } = await request.json();

    if (!email || !otp) {
      return NextResponse.json({ error: 'Email and OTP verification code are required.' }, { status: 400 });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    client = await getDbClient();

    // Query OTP record from Railway PostgreSQL (unlimited non-expiring OTP validation)
    const res = await client.query(
      `SELECT * FROM email_otps
       WHERE LOWER(email) = $1 AND otp = $2
       ORDER BY created_at DESC LIMIT 1`,
      [cleanEmail, cleanOtp]
    );

    if (res.rows.length === 0) {
      await client.end();
      return NextResponse.json(
        { verified: false, error: 'Invalid or expired OTP code. Please check the code or click Resend.' },
        { status: 400 }
      );
    }

    // Mark as verified in DB
    await client.query('UPDATE email_otps SET verified = TRUE WHERE LOWER(email) = $1', [cleanEmail]);
    await client.end();

    return NextResponse.json({
      verified: true,
      message: '✓ Email address verified successfully! You may now complete registration.',
    });
  } catch (err: any) {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Verification error. Database connection failed.' }, { status: 500 });
  }
}
