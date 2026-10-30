import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import {
  createSessionToken,
  createDeviceId,
  verifyPassword,
  applySessionCookies,
} from '@/lib/auth';
import { verifyGoogleIdToken, getGoogleClientId } from '@/lib/googleAuth';
import { isConfiguredSuperAdminEmail } from '@/lib/superAdmins';
import { applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { getRedisClient } from '@/lib/redis';

export const dynamic = 'force-dynamic';

interface HandshakePayload {
  token: string;
  deviceId: string;
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
    role: string;
  };
  createdAt: number;
}

const memoryHandshakes = new Map<string, HandshakePayload>();

async function saveHandshake(state: string, payload: HandshakePayload) {
  memoryHandshakes.set(state, payload);
  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.setex(`bpg_mobile_auth:${state}`, 180, JSON.stringify(payload));
    }
  } catch (_) {}
}

async function consumeHandshake(state: string): Promise<HandshakePayload | null> {
  try {
    const redis = getRedisClient();
    if (redis) {
      const raw = await redis.get(`bpg_mobile_auth:${state}`);
      if (raw) {
        await redis.del(`bpg_mobile_auth:${state}`);
        memoryHandshakes.delete(state);
        return JSON.parse(raw) as HandshakePayload;
      }
    }
  } catch (_) {}

  const mem = memoryHandshakes.get(state);
  if (mem) {
    memoryHandshakes.delete(state);
    if (Date.now() - mem.createdAt < 180_000) {
      return mem;
    }
  }
  return null;
}

/**
 * GET /api/admin/mobile-auth?state=...
 * Used by the Android app to poll for completed Google OAuth handshake,
 * or to fetch the Google Client ID when no state is passed.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const state = (searchParams.get('state') || '').trim();

  if (!state) {
    return NextResponse.json({ clientId: getGoogleClientId() });
  }

  const payload = await consumeHandshake(state);
  if (!payload) {
    return NextResponse.json({ pending: true }, { status: 202 });
  }

  const res = NextResponse.json({
    success: true,
    pending: false,
    token: payload.token,
    deviceId: payload.deviceId,
    user: payload.user,
  });
  applySessionCookies(res, {
    token: payload.token,
    deviceId: payload.deviceId,
    role: payload.user.role,
  });
  return res;
}

/**
 * POST /api/admin/mobile-auth
 * Supports:
 * 1. Google OAuth credential verification ({ credential, state })
 * 2. Direct Admin Email + Registered Mobile / Password verification ({ email, password })
 */
export async function POST(request: Request) {
  try {
    const rl = await applyRateLimitAsync(
      `mobile-admin-auth:${clientIp(request)}`,
      20,
      60_000
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please wait a minute.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const credential = String(body.credential || '').trim();
    const state = String(body.state || '').trim();

    // ── Flow 1: Real Google OAuth ID Token Verification
    if (credential) {
      const googleUser = await verifyGoogleIdToken(credential);
      if (!googleUser || !googleUser.email) {
        return NextResponse.json(
          { error: 'Google token verification failed.' },
          { status: 401 }
        );
      }

      const emailLower = googleUser.email.toLowerCase().trim();
      const byEmail = await queryDb(
        `SELECT id, name, email, phone, role, status FROM users WHERE LOWER(email) = $1 LIMIT 1`,
        [emailLower]
      );

      let dbUser = byEmail.rows[0];
      const isSuperOwner = isConfiguredSuperAdminEmail(emailLower);

      if (!dbUser) {
        if (!isSuperOwner) {
          return NextResponse.json(
            {
              error: `Access Denied: ${googleUser.email} is not registered as an Administrator.`,
            },
            { status: 403 }
          );
        }
        const userId = `usr-g-${Date.now()}`;
        const insertRes = await queryDb(
          `INSERT INTO users (id, name, email, phone, password_hash, google_id, role, status, profile_completed)
           VALUES ($1, $2, $3, '0000000000', 'google_oauth', $4, 'super_admin', 'active', TRUE)
           RETURNING id, name, email, phone, role, status`,
          [userId, googleUser.name || 'Super Admin', emailLower, googleUser.sub]
        );
        dbUser = insertRes.rows[0];
      }

      if (String(dbUser.status || '').toLowerCase() === 'banned') {
        return NextResponse.json(
          { error: 'This account is disabled.' },
          { status: 403 }
        );
      }

      let role = String(dbUser.role || 'customer');
      if (isSuperOwner && role !== 'super_admin') {
        role = 'super_admin';
        await queryDb(`UPDATE users SET role = 'super_admin' WHERE id = $1`, [
          dbUser.id,
        ]);
      }

      if (role !== 'admin' && role !== 'super_admin') {
        return NextResponse.json(
          {
            error: `Access Restricted: "${googleUser.email}" is a student/customer account. Only Administrators can sign in to Blessing Admin.`,
          },
          { status: 403 }
        );
      }

      const deviceId = createDeviceId();
      const token = createSessionToken(dbUser.id, role, deviceId);
      const userPayload = {
        id: String(dbUser.id),
        name: String(dbUser.name || googleUser.name || 'Admin'),
        email: String(dbUser.email || emailLower),
        phone: String(dbUser.phone || ''),
        role,
      };

      if (state && state.length >= 8) {
        await saveHandshake(state, {
          token,
          deviceId,
          user: userPayload,
          createdAt: Date.now(),
        });
      }

      const res = NextResponse.json({
        success: true,
        token,
        deviceId,
        user: userPayload,
      });
      applySessionCookies(res, { token, deviceId, role });
      return res;
    }

    // ── Flow 2: Direct Admin Email + Registered Mobile Number / Password
    const rawEmailOrPhone = String(body.email || body.phone || '').trim();
    const secretInput = String(body.password || '').trim();

    if (!rawEmailOrPhone || !secretInput) {
      return NextResponse.json(
        { error: 'Please enter your Admin Email and Registered Mobile Number (or Password).' },
        { status: 400 }
      );
    }

    const emailLower = rawEmailOrPhone.toLowerCase();
    const cleanInputPhone = rawEmailOrPhone.replace(/\D/g, '').slice(-10);

    const userRes = await queryDb(
      `SELECT id, name, email, phone, role, status, password_hash
       FROM users
       WHERE LOWER(email) = $1
          OR ($2 != '' AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $2)
       LIMIT 1`,
      [emailLower, cleanInputPhone]
    );

    if (userRes.rows.length === 0) {
      return NextResponse.json(
        { error: 'No account found with that email or mobile number.' },
        { status: 404 }
      );
    }

    const user = userRes.rows[0];
    if (String(user.status || '').toLowerCase() === 'banned') {
      return NextResponse.json(
        { error: 'This account is disabled.' },
        { status: 403 }
      );
    }

    let role = String(user.role || 'customer');
    if (isConfiguredSuperAdminEmail(String(user.email || '').toLowerCase()) && role !== 'super_admin') {
      role = 'super_admin';
    }

    if (role !== 'admin' && role !== 'super_admin') {
      return NextResponse.json(
        {
          error: `Access Restricted: "${user.email}" is a student/customer account, not an Administrator.`,
        },
        { status: 403 }
      );
    }

    // Verify either password OR matching registered 10-digit admin phone number when signing in with email
    const passwordMatches = verifyPassword(secretInput, user.password_hash);
    const dbPhoneClean = String(user.phone || '').replace(/\D/g, '').slice(-10);
    const secretPhoneClean = secretInput.replace(/\D/g, '').slice(-10);
    const emailAndPhonePairMatches =
      emailLower.includes('@') &&
      emailLower === String(user.email || '').toLowerCase().trim() &&
      dbPhoneClean.length === 10 &&
      secretPhoneClean === dbPhoneClean;

    if (!passwordMatches && !emailAndPhonePairMatches) {
      return NextResponse.json(
        {
          error: 'Invalid credentials. Enter your Admin Email and your registered 10-digit mobile number (or password).',
        },
        { status: 401 }
      );
    }

    const deviceId = createDeviceId();
    const token = createSessionToken(user.id, role, deviceId);
    const userPayload = {
      id: String(user.id),
      name: String(user.name || 'Admin'),
      email: String(user.email || ''),
      phone: String(user.phone || ''),
      role,
    };

    const res = NextResponse.json({
      success: true,
      token,
      deviceId,
      user: userPayload,
    });
    applySessionCookies(res, { token, deviceId, role });
    return res;
  } catch (err: any) {
    console.error('[admin/mobile-auth] error:', err?.message || err);
    return NextResponse.json(
      { error: 'Authentication error. Please try again.' },
      { status: 500 }
    );
  }
}

