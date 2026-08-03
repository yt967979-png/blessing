import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { applyRateLimitAsync } from '@/lib/serverSecurity';
import { sendViaWasender } from '@/lib/wasender';
import { sendViaMetaCloud } from '@/lib/metaCloud';

export async function POST(request: Request) {
  try {
    const rateLimit = await applyRateLimitAsync(request, 'send-otp', 5, 60_000);
    if (!rateLimit.success && rateLimit.response) return rateLimit.response;

    const body = await request.json();
    const rawPhone = String(body.phone || '').trim();

    const cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number.' }, { status: 400 });
    }

    const phoneWithCc = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await queryDb(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        phone VARCHAR(50) PRIMARY KEY,
        code VARCHAR(10) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryDb(
      `INSERT INTO otp_codes (phone, code, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET code = $2, expires_at = $3, created_at = NOW()`,
      [phoneWithCc, otpCode, expiresAt]
    );

    const text = `🔐 Your Blessing Power Guide Verification Code is *${otpCode}*.\n\nValid for 10 minutes. Do not share this OTP with anyone.`;
    
    // Priority 1: Meta Official Cloud API
    let sendResult = await sendViaMetaCloud(phoneWithCc, text);
    if (!sendResult.ok) {
      console.warn('[send-otp] Meta Cloud API failed, trying WasenderAPI fallback:', sendResult.error);
      // Priority 2: WasenderAPI Fallback
      sendResult = await sendViaWasender(phoneWithCc, text);
    }

    if (!sendResult.ok) {
      console.warn('[send-otp] Dispatch warning:', sendResult.error);
    }

    return NextResponse.json({
      success: true,
      message: 'OTP sent successfully to your WhatsApp number!',
      phone: phoneWithCc,
    });
  } catch (err: any) {
    console.error('[send-otp] error:', err?.message || err);
    return NextResponse.json({ error: 'Failed to send WhatsApp OTP. Please try again.' }, { status: 500 });
  }
}
