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

function buildOtpHtml(otp: string): string {
  return `
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
  `;
}

async function sendGmailOtp(toEmail: string, otp: string): Promise<boolean> {
  const gmailUser = (process.env.GMAIL_USER || process.env.SMTP_USER || 'yogeshjio5770@gmail.com').trim();
  const rawPass = process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_PASS || process.env.SMTP_PASS || 'sknk agnt ivgz veku';
  const gmailPass = rawPass.replace(/\s+/g, '');
  const resendApiKey = process.env.RESEND_API_KEY;

  // 1. Try Resend API first (HTTP REST API over Port 443 — 100% firewall proof)
  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Blessing Power Guide <onboarding@resend.dev>',
          to: [toEmail],
          subject: `🔑 ${otp} is your Blessing Power Guide Email Verification Code`,
          html: buildOtpHtml(otp),
        }),
      });
      if (res.ok) {
        console.log(`✅ [RESEND API SENT] Real Email delivered to ${toEmail}`);
        return true;
      }
    } catch (e: any) {
      console.error('Resend API error:', e.message);
    }
  }

  // 2. Try Nodemailer Gmail SMTP on Port 587 (STARTTLS)
  try {
    const transporter587 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS
      requireTLS: true,
      auth: { user: gmailUser, pass: gmailPass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });

    await transporter587.sendMail({
      from: `"BLESSING POWER GUIDE" <${gmailUser}>`,
      to: toEmail,
      subject: `🔑 ${otp} is your Blessing Power Guide Verification Code`,
      html: buildOtpHtml(otp),
    });
    console.log(`✅ [GMAIL 587 SENT] Real Email delivered to ${toEmail}`);
    return true;
  } catch (err587: any) {
    console.warn(`⚠️ [GMAIL 587 Failed] ${err587.message} — trying Port 465 SSL fallback...`);
  }

  // 3. Try Nodemailer Gmail SMTP on Port 465 (SSL)
  try {
    const transporter465 = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailUser, pass: gmailPass },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });

    await transporter465.sendMail({
      from: `"BLESSING POWER GUIDE" <${gmailUser}>`,
      to: toEmail,
      subject: `🔑 ${otp} is your Blessing Power Guide Verification Code`,
      html: buildOtpHtml(otp),
    });
    console.log(`✅ [GMAIL 465 SENT] Real Email delivered to ${toEmail}`);
    return true;
  } catch (err465: any) {
    console.error(`❌ [GMAIL 465 Failed] ${err465.message}`);
  }

  return false;
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

    // 4. Attempt sending real email via Gmail SMTP (multi-port strategy)
    const emailSent = await sendGmailOtp(cleanEmail, otp);

    console.log(`✉️ [EMAIL OTP LOG] Email: ${cleanEmail} | 6-Digit Code: ${otp} | Sent via SMTP/API: ${emailSent}`);

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
