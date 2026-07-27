import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDbClient } from '@/lib/db';
import { createSessionToken, hashPassword, verifyPassword } from '@/lib/auth';

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

function buildUserResponse(user: { id: string; name: string; email: string; phone: string; role: string }, token: string) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role || 'customer', token };
}

// GET /api/auth?userId=xxx — Verify if user account exists
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
      res = await client.query('SELECT id, name, email, phone, role FROM users WHERE id = $1', [String(userId)]);
    } else {
      res = await client.query('SELECT id, name, email, phone, role FROM users WHERE LOWER(email) = $1', [String(email).toLowerCase().trim()]);
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
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Database connection failed' }, { status: 503 });
  }
}

// POST /api/auth — Register or Login
export async function POST(request: Request) {
  let client: any = null;
  try {
    const body = await request.json();
    const { action, email, phone, password, name } = body;
    const loginIdentifier = String(phone || email || '').trim();

    if (!loginIdentifier || !password) {
      return NextResponse.json({ error: 'Phone number/email and password are required.' }, { status: 400 });
    }
    if (!action || (action !== 'register' && action !== 'login')) {
      return NextResponse.json({ error: 'action must be register or login.' }, { status: 400 });
    }

    const cleanIdentifier = loginIdentifier.toLowerCase();
    const cleanPhoneDigits = loginIdentifier.replace(/\D/g, '');

    client = await getDbClient();

    if (action === 'register') {
      const cleanEmail = String(email || '').toLowerCase().trim();
      const cleanPhone = String(phone || '').trim();

      const existing = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = $1 OR phone = $2',
        [cleanEmail, cleanPhone]
      );
      if (existing.rows.length > 0) {
        await client.end();
        return NextResponse.json(
          { error: 'An account with this email or phone number already exists. Please sign in instead.' },
          { status: 409 }
        );
      }

      const userId = `usr-${Date.now()}`;
      const userName = String(name).trim();
      const passHash = hashPassword(password);

      await client.query(
        `INSERT INTO users (id, name, email, phone, password_hash, role, email_verified, status)
         VALUES ($1, $2, $3, $4, $5, 'customer', TRUE, 'active')`,
        [userId, userName, cleanEmail, cleanPhone, passHash]
      );

      await client.query(
        `INSERT INTO cart (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
        [`cart-${userId}`, userId]
      );

      const user = { id: userId, name: userName, email: cleanEmail, phone: cleanPhone, role: 'customer' };
      const token = createSessionToken(userId, 'customer');
      await client.end();

      const response = NextResponse.json({
        user: buildUserResponse(user, token),
        cart: [],
        wishlist: [],
        addresses: [],
      });
      return setSessionCookie(response, token);
    }

    const userRes = await client.query(
      `SELECT * FROM users 
       WHERE LOWER(email) = $1 
          OR phone = $1 
          OR phone = $2 
          OR REPLACE(phone, '+', '') = $2`,
      [cleanIdentifier, cleanPhoneDigits || cleanIdentifier]
    );

    if (userRes.rows.length === 0) {
      await client.end();
      return NextResponse.json(
        { error: 'No account found with this mobile number. Please register first.' },
        { status: 404 }
      );
    }

    const dbUser = userRes.rows[0];

    if (!verifyPassword(password, dbUser.password_hash)) {
      await client.end();
      return NextResponse.json({ error: 'Incorrect password. Please check and try again.' }, { status: 401 });
    }

    const cartRes = await client.query(
      `SELECT ci.book_id as id, ci.quantity as qty, ci.price,
              b.title, b.cover_image as image, b.price as mrp,
              b.subject, b.slug, b.discount_price, b.status, b.stock
       FROM cart c
       JOIN cart_items ci ON c.id = ci.cart_id
       LEFT JOIN books b ON ci.book_id = b.id
       WHERE c.user_id = $1`,
      [dbUser.id]
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

    const wishRes = await client.query('SELECT book_id FROM wishlist WHERE user_id = $1', [dbUser.id]);
    const wishlistIds = wishRes.rows.map((row: any) => row.book_id);

    const addrRes = await client.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
      [dbUser.id]
    );
    const addresses = addrRes.rows.map((row: any) => ({
      id: row.id,
      type: row.landmark || 'HOME',
      name: row.full_name,
      phone: row.phone,
      address: row.address_line1,
      city: row.city,
      pincode: row.pincode,
    }));

    const role = dbUser.role || 'customer';
    const token = createSessionToken(dbUser.id, role);
    await client.end();

    const response = NextResponse.json({
      user: buildUserResponse(
        { id: dbUser.id, name: dbUser.name, email: dbUser.email, phone: dbUser.phone, role },
        token
      ),
      cart: cartItems,
      wishlist: wishlistIds,
      addresses,
    });
    return setSessionCookie(response, token);
  } catch {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Database connection failed. Please try again.' }, { status: 503 });
  }
}

// PATCH /api/auth — Update user profile
export async function PATCH(request: Request) {
  let client: any = null;
  try {
    const { userId, name, phone } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    client = await getDbClient();
    await client.query(
      'UPDATE users SET name = $1, phone = $2, updated_at = NOW() WHERE id = $3',
      [String(name).trim(), String(phone).trim(), String(userId)]
    );
    await client.end();

    return NextResponse.json({ success: true, message: 'Profile updated' });
  } catch {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

// DELETE /api/auth — Logout (clear session cookie)
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete('bpg_session');
  return NextResponse.json({ success: true });
}
