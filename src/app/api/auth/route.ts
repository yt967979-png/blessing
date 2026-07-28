import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDbClient } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';
import { applyRateLimitAsync, clientIp, getAuthenticatedUser, unauthorizedResponse } from '@/lib/serverSecurity';
import { isValidMobileNumber, normalizeMobileDigits } from '@/lib/authValidation';
import { userNeedsProfile } from '@/lib/userProfile';

const LEGACY_AUTH_DISABLED =
  'Email/password login is disabled. Please sign in with Google.';

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set('bpg_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });
  return response;
}

function buildUserResponse(
  user: { id: string; name: string; email: string; phone: string; role: string; profile_completed?: boolean | null },
  token: string
) {
  const needsProfile = userNeedsProfile(user.phone) || user.profile_completed === false;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role || 'customer',
    token,
    needsProfile,
  };
}

// GET /api/auth?userId=xxx — Restore session + cart/wishlist
export async function GET(request: Request) {
  let client: any = null;
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');

    if (!userId && !email) {
      return NextResponse.json({ error: 'userId or email is required' }, { status: 400 });
    }

    client = await getDbClient();
    let res;
    if (userId) {
      res = await client.query(
        'SELECT id, name, email, phone, role, profile_completed FROM users WHERE id = $1',
        [String(userId)]
      );
    } else {
      res = await client.query(
        'SELECT id, name, email, phone, role, profile_completed FROM users WHERE LOWER(email) = $1',
        [String(email).toLowerCase().trim()]
      );
    }

    if (res.rows.length === 0) {
      await client.end();
      return NextResponse.json({ exists: false, error: 'USER_NOT_FOUND' }, { status: 404 });
    }

    const user = res.rows[0];

    const cartRes = await client.query(
      `SELECT ci.book_id as id, ci.quantity as qty, ci.price,
              b.title, b.cover_image as image, b.price as mrp,
              b.subject, b.slug, b.discount_price, b.status, b.stock
       FROM cart c
       JOIN cart_items ci ON c.id = ci.cart_id
       LEFT JOIN books b ON ci.book_id = b.id
       WHERE c.user_id = $1`,
      [user.id]
    );
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

    const wishRes = await client.query('SELECT book_id FROM wishlist WHERE user_id = $1', [user.id]);
    const wishlistIds = wishRes.rows.map((row: any) => row.book_id);
    await client.end();

    const token = createSessionToken(user.id, user.role || 'customer');
    const response = NextResponse.json({
      exists: true,
      user: buildUserResponse(user, token),
      cart: cartItems,
      wishlist: wishlistIds,
    });
    return setSessionCookie(response, token);
  } catch {
    if (client) {
      try {
        await client.end();
      } catch (_) {}
    }
    return NextResponse.json({ error: 'Database connection failed' }, { status: 503 });
  }
}

// POST — legacy email/password login disabled (Google Sign-In only)
export async function POST(request: Request) {
  await applyRateLimitAsync(`auth-legacy:${clientIp(request)}`, 10, 60000);
  return NextResponse.json({ error: LEGACY_AUTH_DISABLED }, { status: 410 });
}

// PATCH /api/auth — Update own profile (authenticated)
export async function PATCH(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Please sign in with Google first.');

  let client: any = null;
  try {
    const { name, phone } = await request.json();
    const cleanName = String(name || '').trim();
    const cleanPhone = normalizeMobileDigits(String(phone || ''));

    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json({ error: 'Please enter your full name.' }, { status: 400 });
    }
    if (!isValidMobileNumber(cleanPhone)) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number.' }, { status: 400 });
    }

    client = await getDbClient();

    const dup = await client.query(`SELECT id FROM users WHERE phone = $1 AND id <> $2 LIMIT 1`, [
      cleanPhone,
      session.userId,
    ]);
    if (dup.rows.length > 0) {
      await client.end();
      return NextResponse.json({ error: 'This mobile number is already used on another account.' }, { status: 409 });
    }

    const updated = await client.query(
      `UPDATE users SET name = $1, phone = $2, profile_completed = TRUE, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, email, phone, role`,
      [cleanName, cleanPhone, session.userId]
    );
    await client.end();

    if (updated.rows.length === 0) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const user = updated.rows[0];
    return NextResponse.json({
      success: true,
      name: user.name,
      phone: user.phone,
      message: 'Profile updated',
    });
  } catch {
    if (client) {
      try {
        await client.end();
      } catch (_) {}
    }
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

// DELETE /api/auth — Logout (clear session cookie)
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('bpg_session');
  return NextResponse.json({ success: true });
}
