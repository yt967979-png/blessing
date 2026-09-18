import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getOpsPin(): string {
  return (process.env.OPS_PIN || '789234').trim();
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || 'bpg-ops-secret-fallback-key-2026';
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

export function verifyOpsToken(token: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    const payloadStr = decoded.p as string;
    const sig = decoded.s as string;
    const expected = crypto.createHmac('sha256', getSessionSecret()).update(payloadStr).digest('hex');
    if (sig !== expected) return false;
    const payload = JSON.parse(payloadStr);
    if (Date.now() > payload.exp) return false;
    return payload.ops === true;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const enteredPin = String(body.pin || '').trim();
    const correctPin = getOpsPin();

    if (!enteredPin || enteredPin !== correctPin) {
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
    return NextResponse.json({ error: err.message || 'Auth failed' }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, message: 'Logged out' });
  response.cookies.delete('bpg_ops_session');
  return response;
}
