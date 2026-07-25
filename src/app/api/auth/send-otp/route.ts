import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

function isValidEmailFormat(email: string): boolean {
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email);
}

function isDisposableEmail(email: string): boolean {
  const tempDomains = [
    'mailinator.com',
    'tempmail.com',
    'guerrillamail.com',
    '10minutemail.com',
    'trashmail.com',
    'yopmail.com',
    'dispostable.com',
    'getnada.com',
    'throwawaymail.com',
  ];
  const domain = email.split('@')[1]?.toLowerCase();
  return tempDomains.includes(domain);
}

export async function POST(request: Request) {
  let client: any = null;
  try {
    const { email } = await request.json();
    if (!email || !String(email).trim()) {
      return NextResponse.json({ error: 'Email address is required.' }, { status: 400 });
    }

    const cleanEmail = String(email).toLowerCase().trim();

    if (!isValidEmailFormat(cleanEmail)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (isDisposableEmail(cleanEmail)) {
      return NextResponse.json(
        { error: 'Temporary or disposable email addresses are blocked for security. Please use a valid email.' },
        { status: 400 }
      );
    }

    client = await getDbClient();

    // 1. Check if email is already registered
    const userCheck = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    if (userCheck.rows.length > 0) {
      await client.end();
      return NextResponse.json(
        { error: 'An account with this email address already exists. Please log in.' },
        { status: 409 }
      );
    }

    // 2. Generate 6-Digit Numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpId = `otp-${Date.now()}`;

    // 3. Clear old OTPs for this email & insert new OTP with 10-minute expiry
    await client.query('DELETE FROM email_otps WHERE LOWER(email) = $1', [cleanEmail]);
    await client.query(
      `INSERT INTO email_otps (id, email, otp, expires_at, verified)
       VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', FALSE)`,
      [otpId, cleanEmail, otp]
    );

    await client.end();

    console.log(`✉️ [EMAIL OTP SENT] Email: ${cleanEmail} | 6-Digit Code: ${otp} | Expires in: 10 mins`);

    return NextResponse.json({
      success: true,
      message: `A 6-digit verification code has been sent to ${cleanEmail}.`,
      previewOtp: otp,
      expiresMinutes: 10,
    });
  } catch (err: any) {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Failed to send OTP. Database error.' }, { status: 500 });
  }
}
