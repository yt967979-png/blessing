import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { createSessionToken, hashPassword, sessionCookieOptions } from '@/lib/auth';
import { applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { verifyGoogleIdToken } from '@/lib/googleAuth';
import { userNeedsProfile } from '@/lib/userProfile';

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set('bpg_session', token, sessionCookieOptions());
  return response;
}

async function loadUserSessionData(queryFn: any, userId: string) {
  try {
    const [cartRes, wishRes, addrRes] = await Promise.all([
      queryFn(
        `SELECT ci.book_id as id, ci.quantity as qty, ci.price,
                b.title, b.cover_image as image, b.price as mrp,
                b.subject, b.slug, b.discount_price, b.status, b.stock
         FROM cart c
         JOIN cart_items ci ON c.id = ci.cart_id
         LEFT JOIN books b ON ci.book_id = b.id
         WHERE c.user_id = $1`,
        [userId]
      ).catch(() => ({ rows: [] })),
      queryFn('SELECT book_id FROM wishlist WHERE user_id = $1', [userId]).catch(() => ({ rows: [] })),
      queryFn('SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC', [userId]).catch(() => ({ rows: [] })),
    ]);

    const cartItems = cartRes.rows.map((row: any) => ({
      id: row.id,
      title: row.title || `Book #${row.id}`,
      price: Number(row.discount_price || row.price),
      mrp: Number(row.mrp || row.price),
      qty: Number(row.qty),
      image: row.image || '',
      subject: row.subject || 'Guide',
      slug: row.slug || row.id,
      cls: '10th',
      category: 'guide' as const,
      discount: 20,
      rating: 5.0,
      reviews: 0,
      badge: 'BESTSELLER',
      badgeColor: 'bg-blue-600',
      description: 'Official guide book.',
      features: ['Solved Papers'],
      inStock: row.status !== 'out_of_stock' && Number(row.stock || 1) > 0,
    }));

    const addresses = addrRes.rows.map((row: any) => ({
      id: row.id,
      type: row.landmark || 'HOME',
      name: row.full_name,
      phone: row.phone,
      address: row.address_line1,
      city: row.city,
      pincode: row.pincode,
    }));

    return {
      cart: cartItems,
      wishlist: wishRes.rows.map((row: any) => row.book_id),
      addresses,
    };
  } catch (_) {
    return { cart: [], wishlist: [], addresses: [] };
  }
}

function buildUserResponse(
  user: { id: string; name: string; email: string; phone: string; role: string; profile_image?: string | null },
  token: string,
  needsProfile: boolean
) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role || 'customer',
    token,
    profileImage: user.profile_image || undefined,
    needsProfile,
  };
}

export async function POST(request: Request) {
  let client: any = null;
  try {
    const rl = await applyRateLimitAsync(`google-auth:${clientIp(request)}`, 30, 60000);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many sign-in attempts. Please wait a minute.' }, { status: 429 });
    }

    const { credential } = await request.json();
    if (!credential) {
      return NextResponse.json({ error: 'Google sign-in failed. Please try again.' }, { status: 400 });
    }

    const googleUser = await verifyGoogleIdToken(String(credential));
    if (!googleUser) {
      return NextResponse.json({ error: 'Google sign-in could not be verified.' }, { status: 401 });
    }

    let dbUser: any = null;

    const { queryDb } = await import('@/lib/db');
    const byGoogle = await queryDb(`SELECT * FROM users WHERE google_id = $1 LIMIT 1`, [googleUser.sub]);
    if (byGoogle.rows.length > 0) {
      dbUser = byGoogle.rows[0];
    } else {
      const byEmail = await queryDb(`SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1`, [googleUser.email]);
      if (byEmail.rows.length > 0) {
        dbUser = byEmail.rows[0];
        await queryDb(
          `UPDATE users SET google_id = $1, profile_image = COALESCE($2, profile_image), updated_at = NOW() WHERE id = $3`,
          [googleUser.sub, googleUser.picture || null, dbUser.id]
        );
        dbUser.google_id = googleUser.sub;
      }
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    const shouldBeAdmin = adminEmail && googleUser.email.toLowerCase().trim() === adminEmail;

    if (!dbUser) {
      const userId = `usr-g-${Date.now()}`;
      const passHash = hashPassword(crypto.randomBytes(32).toString('hex'));
      const role = shouldBeAdmin ? 'admin' : 'customer';

      await queryDb(
        `INSERT INTO users (id, name, email, phone, password_hash, google_id, profile_image, profile_completed, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8, 'active')`,
        [
          userId,
          googleUser.name,
          googleUser.email,
          '0000000000',
          passHash,
          googleUser.sub,
          googleUser.picture || null,
          role,
        ]
      );
      await queryDb(
        `INSERT INTO cart (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
        [`cart-${userId}`, userId]
      );
      dbUser = {
        id: userId,
        name: googleUser.name,
        email: googleUser.email,
        phone: '0000000000',
        role,
        profile_image: googleUser.picture,
        profile_completed: false,
      };
    } else if (dbUser.status === 'banned') {
      return NextResponse.json({ error: 'This account is disabled. Contact support.' }, { status: 403 });
    } else {
      let activeRole = dbUser.role || 'customer';
      if (shouldBeAdmin && activeRole !== 'admin') {
        activeRole = 'admin';
        await queryDb(`UPDATE users SET role = 'admin' WHERE id = $1`, [dbUser.id]);
      }
      await queryDb(
        `UPDATE users SET name = COALESCE(NULLIF($1, ''), name),
         profile_image = COALESCE($2, profile_image), updated_at = NOW() WHERE id = $3`,
        [googleUser.name, googleUser.picture || null, dbUser.id]
      );
      dbUser.name = googleUser.name || dbUser.name;
      dbUser.role = activeRole;
    }

    const needsProfile =
      userNeedsProfile(dbUser.phone) ||
      dbUser.profile_completed !== true ||
      String(dbUser.name || '').trim().length < 2;
    const role = dbUser.role || 'customer';
    const token = createSessionToken(dbUser.id, role);
    const sessionData = needsProfile
      ? { cart: [], wishlist: [], addresses: [] }
      : await loadUserSessionData(queryDb, dbUser.id);

    const response = NextResponse.json({
      user: buildUserResponse(dbUser, token, needsProfile),
      ...sessionData,
    });
    return setSessionCookie(response, token);
  } catch (err: any) {
    console.error('[auth/google]', err?.message || err);
    const msg = String(err?.message || err);
    const dbBusy =
      msg.includes('timeout') || msg.includes('Could not acquire') || msg.includes('unreachable');
    return NextResponse.json(
      {
        error: dbBusy
          ? 'Server is busy connecting to the database. Please try again in a few seconds.'
          : 'Google sign-in failed. Please try again.',
      },
      { status: dbBusy ? 503 : 500 }
    );
  }
}
