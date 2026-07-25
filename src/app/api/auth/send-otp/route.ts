import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import nodemailer from 'nodemailer';

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

async function sendGmailOtp(toEmail: string, otp: string): Promise<boolean> {
  const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER || 'yogeshjio5770@gmail.com';
  const gmailPass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.SMTP_PASS || 'sknkagntivgzveku';

  if (!gmailUser || !gmailPass) {
    console.log(`ℹ️ [SMTP NOTICE] GMAIL credentials not configured.`);
    return false;
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const mailOptions = {
      from: `"BLESSING POWER GUIDE" <${gmailUser}>`,
      to: toEmail,
      subject: `🔑 ${otp} is your Blessing Power Guide Email Verification Code`,
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; width: 44px; height: 44px; background: linear-gradient(135deg, #fbbf24, #f59e0b); border-radius: 12px; font-weight: 900; font-size: 24px; color: #001B3A; line-height: 44px; text-align: center; margin-bottom: 8px;">B</div>
            <h2 style="color: #001B3A; margin: 0; font-size: 22px; font-weight: 900; letter-spacing: -0.5px;">BLESSING POWER GUIDE</h2>
            <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; font-weight: 600;">State Board Educational Guides & Solutions</p>
          </div>
          <div style="border-top: 2px solid #f1f5f9; margin: 20px 0;"></div>
          <p style="color: #334155; font-size: 14px; font-weight: 700; margin-bottom: 8px;">Hello Student,</p>
          <p style="color: #475569; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0;">
            Thank you for creating an account with Blessing Power Guide. Use the following 6-digit verification code (OTP) to verify your email address:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <div style="display: inline-block; font-family: monospace; font-size: 34px; font-weight: 900; letter-spacing: 10px; color: #0044AA; background: linear-gradient(180deg, #eff6ff, #dbeafe); padding: 16px 32px; border-radius: 16px; border: 2px dashed #93c5fd; box-shadow: inset 0 2px 4px rgba(0,0,0,0.03);">
              ${otp}
            </div>
          </div>
          <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0 0 24px 0;">
            ⚠️ This code expires in <strong>10 minutes</strong>. Do not share this code with anyone.
          </p>
          <div style="border-top: 1px solid #f1f5f9; margin: 20px 0;"></div>
          <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
            © 2026 Blessing Pathway Education (OPC) Pvt Ltd • Tamil Nadu, India
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ [GMAIL SENT] Real OTP Email delivered to ${toEmail}`);
    return true;
  } catch (error: any) {
    console.error(`❌ [GMAIL SMTP ERROR] Failed to send email to ${toEmail}:`, error.message);
    return false;
  }
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

    // 4. Send Real Email via Gmail SMTP (if env vars set)
    const emailSent = await sendGmailOtp(cleanEmail, otp);

    console.log(`✉️ [EMAIL OTP LOG] Email: ${cleanEmail} | 6-Digit Code: ${otp} | Sent via SMTP: ${emailSent}`);

    return NextResponse.json({
      success: true,
      message: emailSent
        ? `A 6-digit verification code has been sent to your Gmail inbox (${cleanEmail}).`
        : `A 6-digit verification code has been generated for ${cleanEmail}.`,
      previewOtp: otp,
      emailSent,
      expiresMinutes: 10,
    });
  } catch (err: any) {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Failed to send OTP. Database error.' }, { status: 500 });
  }
}
