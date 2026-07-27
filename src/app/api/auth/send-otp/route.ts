import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import nodemailer from 'nodemailer';
import { applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';

function buildOtpHtml(otp: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #001B3A;">BLESSING POWER GUIDE</h2>
      <p>Your 6-digit verification code is:</p>
      <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0044AA;">${otp}</div>
      <p style="color: #64748b; font-size: 12px;">This code expires in 10 minutes.</p>
    </div>
  `;
}

async function sendEmailOtp(toEmail: string, otp: string): Promise<boolean> {
  if (!toEmail || !toEmail.includes('@')) return false;
  const gmailUser = process.env.GMAIL_USER || process.env.SMTP_USER;
  const gmailPass = (process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Blessing Power Guide <onboarding@resend.dev>',
          to: [toEmail],
          subject: `Your Blessing Power Guide verification code: ${otp}`,
          html: buildOtpHtml(otp),
        }),
      });
      if (res.ok) return true;
    } catch (e: any) {
      console.error('Resend OTP error:', e.message);
    }
  }

  if (!gmailUser || !gmailPass) return false;

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user: gmailUser, pass: gmailPass },
    });
    await transporter.sendMail({
      from: `"BLESSING POWER GUIDE" <${gmailUser}>`,
      to: toEmail,
      subject: `Your verification code: ${otp}`,
      html: buildOtpHtml(otp),
    });
    return true;
  } catch (e: any) {
    console.error('Gmail OTP error:', e.message);
    return false;
  }
}

async function sendWhatsAppOtp(phone: string, message: string): Promise<{ sent: boolean; provider?: string; error?: string }> {
  try {
    const { sendWhatsAppMessageInProcess } = await import('@/lib/whatsapp');
    await sendWhatsAppMessageInProcess(phone, message);
    return { sent: true, provider: 'baileys-inprocess' };
  } catch (e: any) {
    console.warn('In-process WhatsApp failed:', e.message);
  }

  const port = process.env.WHATSAPP_PORT || '4000';
  try {
    const res = await fetch(`http://127.0.0.1:${port}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message }),
    });
    if (res.ok) return { sent: true, provider: 'baileys-sidecar' };
    const data = await res.json().catch(() => ({}));
    return { sent: false, error: data.error || 'Sidecar WhatsApp not connected' };
  } catch (e: any) {
    return { sent: false, error: e.message };
  }
}

function normalizePhoneDigits(phone: string): string {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits.slice(-10);
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const { allowed } = await applyRateLimitAsync(`otp-${ip}`, 8, 60000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many OTP requests. Please wait a minute.' }, { status: 429 });
  }

  let client: any = null;
  try {
    const { email, phone, mode } = await request.json();
    const cleanEmail = String(email || '').toLowerCase().trim();
    const cleanPhone = normalizePhoneDigits(phone || email || '');
    const isResetMode = mode === 'reset' || mode === 'forgot';

    client = await getDbClient();
    if (!client) {
      return NextResponse.json({ error: 'Database unavailable. Try again shortly.' }, { status: 503 });
    }

    let accountEmail = cleanEmail.includes('@') ? cleanEmail : '';
    let finalPhone = cleanPhone;

    if (isResetMode) {
      // Look up by phone (preferred) or email
      const userCheck = await client.query(
        `SELECT id, email, phone FROM users
         WHERE ($1 <> '' AND LOWER(email) = $1)
            OR ($2 <> '' AND (
              phone = $2
              OR REPLACE(phone, '+', '') = $2
              OR RIGHT(REGEXP_REPLACE(COALESCE(phone,''), '\\D', '', 'g'), 10) = $2
            ))
         LIMIT 1`,
        [accountEmail, finalPhone]
      );
      if (userCheck.rows.length === 0) {
        releaseDbClient(client);
        return NextResponse.json(
          { error: 'No account found with this mobile number. Please check and try again.' },
          { status: 404 }
        );
      }
      accountEmail = String(userCheck.rows[0].email || '').toLowerCase();
      finalPhone = normalizePhoneDigits(userCheck.rows[0].phone || finalPhone);
    } else {
      // Register: email required; phone for WhatsApp
      if (!accountEmail || !accountEmail.includes('@')) {
        releaseDbClient(client);
        return NextResponse.json({ error: 'Email address is required for registration.' }, { status: 400 });
      }
      if (!finalPhone || finalPhone.length < 10) {
        releaseDbClient(client);
        return NextResponse.json({ error: 'Valid 10-digit mobile number is required for WhatsApp OTP.' }, { status: 400 });
      }
      const userCheck = await client.query('SELECT id FROM users WHERE LOWER(email) = $1', [accountEmail]);
      if (userCheck.rows.length > 0) {
        releaseDbClient(client);
        return NextResponse.json({ error: 'An account with this email already exists. Please log in.' }, { status: 409 });
      }
    }

    if (!finalPhone || finalPhone.length < 10) {
      releaseDbClient(client);
      return NextResponse.json({ error: 'Valid 10-digit mobile number is required for WhatsApp OTP.' }, { status: 400 });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpId = `otp-${Date.now()}`;

    await client.query('DELETE FROM whatsapp_otps WHERE LOWER(email) = $1 OR phone = $2', [
      accountEmail || finalPhone,
      finalPhone,
    ]);
    await client.query(
      `INSERT INTO whatsapp_otps (id, phone, email, otp, expires_at, verified)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '10 minutes', FALSE)`,
      [otpId, finalPhone, accountEmail || finalPhone, otp]
    );
    releaseDbClient(client);
    client = null;

    const purpose = isResetMode ? 'PASSWORD RESET' : 'VERIFICATION';
    const waMsg = `🔑 *BLESSING POWER GUIDE — ${purpose}*\n\nYour 6-digit OTP code is: *${otp}*\n\nThis code expires in 10 minutes. Do not share this code with anyone. 📚`;

    const waResult = await sendWhatsAppOtp(finalPhone, waMsg);
    let emailSent = false;
    if (!waResult.sent && accountEmail.includes('@')) {
      emailSent = await sendEmailOtp(accountEmail, otp);
    }

    if (!waResult.sent && !emailSent) {
      return NextResponse.json(
        {
          error:
            'Could not send OTP. WhatsApp is not connected — link WhatsApp in Admin panel, or configure email (GMAIL_USER + GMAIL_APP_PASSWORD).',
          waError: waResult.error,
        },
        { status: 503 }
      );
    }

    const maskedPhone = finalPhone.length >= 4 ? `******${finalPhone.slice(-4)}` : 'your mobile';
    const channel = waResult.sent ? 'WhatsApp' : 'email';

    return NextResponse.json({
      success: true,
      message: `A 6-digit ${isResetMode ? 'password reset' : 'verification'} code has been sent via ${channel} to ${maskedPhone}.`,
      channel,
      waSent: waResult.sent,
      emailSent,
      expiresMinutes: 10,
    });
  } catch (err: any) {
    releaseDbClient(client);
    return NextResponse.json({ error: 'Failed to send OTP. Database error.' }, { status: 500 });
  }
}
