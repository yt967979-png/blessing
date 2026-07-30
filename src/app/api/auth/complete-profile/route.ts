import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { createSessionToken, getTokenFromRequest, sessionCookieOptions } from '@/lib/auth';
import { getAuthenticatedUser, applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { isValidMobileNumber, normalizeMobileDigits } from '@/lib/authValidation';

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set('bpg_session', token, sessionCookieOptions());
  return response;
}

export async function POST(request: Request) {
  const rl = await applyRateLimitAsync(`complete-profile:${clientIp(request)}`, 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429 });
  }

  const session = await getAuthenticatedUser(request);
  if (!session) {
    return NextResponse.json({ error: 'Please sign in with Google first.' }, { status: 401 });
  }

  let client: any = null;
  try {
    const { name, phone } = await request.json();
    const cleanPhone = normalizeMobileDigits(String(phone || ''));
    const cleanName = String(name || '').trim();

    if (!cleanName || cleanName.length < 2) {
      return NextResponse.json({ error: 'Please enter your full name.' }, { status: 400 });
    }
    if (!isValidMobileNumber(cleanPhone)) {
      return NextResponse.json({ error: 'Please enter a valid 10-digit mobile number.' }, { status: 400 });
    }

    client = await getDbClient();

    const dup = await client.query(
      `SELECT id FROM users WHERE phone = $1 AND id <> $2 LIMIT 1`,
      [cleanPhone, session.userId]
    );
    if (dup.rows.length > 0) {
      await client.end();
      return NextResponse.json({ error: 'This mobile number is already used on another account.' }, { status: 409 });
    }

    const updated = await client.query(
      `UPDATE users SET name = $1, phone = $2, profile_completed = TRUE, updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, email, phone, role, profile_image`,
      [cleanName, cleanPhone, session.userId]
    );
    const user = updated.rows[0];
    const token = getTokenFromRequest(request) || createSessionToken(user.id, user.role || 'customer');

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
    await client.end();

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role || 'customer',
        token,
        profileImage: user.profile_image || undefined,
        needsProfile: false,
      },
      cart: cartItems,
      wishlist: wishRes.rows.map((r: any) => r.book_id),
    });
    return setSessionCookie(response, token);
  } catch (err: any) {
    console.error('[complete-profile]', err?.message || err);
    if (client) {
      try {
        await client.end();
      } catch (_) {}
    }
    return NextResponse.json({ error: 'Could not save your details.' }, { status: 500 });
  }
}
