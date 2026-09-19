import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSessionSecret } from '@/lib/auth';
import { applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';

export const dynamic = 'force-dynamic';

function isProductionRuntime(): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  const phase = process.env.NEXT_PHASE || '';
  if (phase === 'phase-production-build') return false;
  return true;
}

function getOpsPin(): string {
  const pin = (process.env.OPS_PIN || '').trim();
  if (!pin || pin.length < 6) {
    throw new Error('OPS_PIN is not configured or does not meet minimum length requirement (min 6 characters)');
  }
  return pin;
}

export function createOpsToken(): string {
  const payload = {
    ops: true,
    iat: Date.now(),
    exp: Date.now() + 30 * 86400 * 1000, // 30 days
  };
  const payloadStr = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(payloadStr).digest('hex');
  return Buffer.from(JSON.stringify({ p: payloadStr, s: sig })).toString('base64url');
}

/** Timing-safe ops token verification — prevents character-by-character brute-force. */
export function verifyOpsToken(token: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const payloadStr = decoded.p as string;
    const sig = decoded.s as string;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(payloadStr).digest('hex');
    // SECURITY FIX: Use timing-safe comparison instead of ===
    const bufSig = Buffer.from(String(sig || ''), 'hex');
    const bufExp = Buffer.from(expected, 'hex');
    if (bufSig.length !== bufExp.length || !crypto.timingSafeEqual(bufSig, bufExp)) return false;
    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.exp) return false;
    return payload.ops === true;
  } catch {
    return false;
  }
}

/** Timing-safe PIN comparison — prevents character-by-character brute-force. */
export function verifyOpsPin(enteredPin: string, correctPin: string): boolean {
  try {
    const a = Buffer.from(String(enteredPin || ''));
    const b = Buffer.from(String(correctPin || ''));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  // Rate limit: 5 attempts per 10 minutes per IP
  const rl = await applyRateLimitAsync(`ops-auth:${clientIp(request)}`, 5, 600_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many login attempts. Please wait 10 minutes.' }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const enteredPin = String(body.pin || '').trim();
    let correctPin: string;
    try {
      correctPin = getOpsPin();
    } catch (configErr) {
      console.error('[ops-auth configuration error]', configErr);
      return NextResponse.json({ error: 'Ops authentication is temporarily unavailable' }, { status: 503 });
    }

    if (!enteredPin || !verifyOpsPin(enteredPin, correctPin)) {
      return NextResponse.json({ error: 'Invalid Developer PIN' }, { status: 401 });
    }

    const token = createOpsToken();
    const response = NextResponse.json({ ok: true, token });

    response.cookies.set('bpg_ops_session', token, {
      path: '/',
      maxAge: 30 * 86400,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });

    return response;
  } catch (err: any) {
    console.error('[ops-auth error]', err);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, message: 'Logged out' });
  response.cookies.delete('bpg_ops_session');
  return response;
}
