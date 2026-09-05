import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { clearSessionCookies } from '@/lib/auth';
import {
  applyRateLimitAsync,
  clientIp,
  getAuthenticatedUser,
  unauthorizedResponse,
} from '@/lib/serverSecurity';
import { isValidMobileNumber, normalizeMobileDigits } from '@/lib/authValidation';
import { userNeedsProfile } from '@/lib/userProfile';
import { isBookInStock } from '@/lib/stock';

const LEGACY_AUTH_DISABLED =
  'Email/password login is disabled. Please sign in with Google.';

function buildUserResponse(user: {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  profile_completed?: boolean | null;
}) {
  const needsProfile =
    userNeedsProfile(user.phone) ||
    user.profile_completed !== true ||
    String(user.name || '').trim().length < 2;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role || 'customer',
    needsProfile,
  };
}

/**
 * GET /api/auth — restore cart/wishlist for the *current* session only.
 * Never mints a session from userId/email query params (account takeover vector).
 */
export async function GET(request: Request) {
  const rl = await applyRateLimitAsync(`auth-restore:${clientIp(request)}`, 60, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait.' }, { status: 429 });
  }

  const session = await getAuthenticatedUser(request);
  if (!session) {
    return NextResponse.json({ exists: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  let client: any = null;
  try {
    const { searchParams } = new URL(request.url);
    const requestedId = searchParams.get('userId');
    // Ignore spoofed userId — only the signed session may restore data.
    if (requestedId && requestedId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    client = await getDbClient();
    const res = await client.query(
      `SELECT id, name, email, phone, role, profile_completed, status
       FROM users WHERE id = $1 LIMIT 1`,
      [session.userId]
    );

    if (res.rows.length === 0) {
      releaseDbClient(client);
      client = null;
      return NextResponse.json({ exists: false, error: 'USER_NOT_FOUND' }, { status: 404 });
    }

    const user = res.rows[0];
    if (String(user.status || '').toLowerCase() === 'banned') {
      releaseDbClient(client);
      client = null;
      return NextResponse.json({ error: 'This account is disabled.' }, { status: 403 });
    }

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
      inStock: isBookInStock(row),
      stock: Number(row.stock ?? 0),
    }));

    const wishRes = await client.query('SELECT book_id FROM wishlist WHERE user_id = $1', [user.id]);
    const wishlistIds = wishRes.rows.map((row: any) => row.book_id);
    releaseDbClient(client);
    client = null;

    // Do not mint a new token here — keep existing cookie/Bearer; return user without elevating privileges.
    return NextResponse.json({
      exists: true,
      user: buildUserResponse(user),
      cart: cartItems,
      wishlist: wishlistIds,
    });
  } catch {
    if (client) {
      try {
        releaseDbClient(client);
      } catch (_) {}
    }
    return NextResponse.json({ error: 'Database connection failed' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  await applyRateLimitAsync(`auth-legacy:${clientIp(request)}`, 10, 60000);
  return NextResponse.json({ error: LEGACY_AUTH_DISABLED }, { status: 410 });
}

export async function PATCH(request: Request) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Please sign in with Google first.');

  let client: any = null;
  try {
    const body = await request.json().catch(() => ({}));
    const { name, phone } = body;
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
      releaseDbClient(client);
      client = null;
      return NextResponse.json(
        { error: 'This mobile number is already used on another account.' },
        { status: 409 }
      );
    }

    const updated = await client.query(
      `UPDATE users SET name = $1, phone = $2, profile_completed = TRUE, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, email, phone, role`,
      [cleanName, cleanPhone, session.userId]
    );
    releaseDbClient(client);
    client = null;

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
        releaseDbClient(client);
      } catch (_) {}
    }
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  clearSessionCookies(cookieStore);
  return NextResponse.json({ success: true });
}
