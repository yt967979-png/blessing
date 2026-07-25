import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password + 'bpg_salt_2026').digest('hex');
}

// GET /api/auth?userId=xxx — Verify if user account exists in Railway PostgreSQL DB
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
    await client.end();

    if (res.rows.length === 0) {
      return NextResponse.json({ exists: false, error: 'USER_NOT_FOUND' }, { status: 404 });
    }

    return NextResponse.json({ exists: true, user: res.rows[0] });
  } catch (err: any) {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Database connection failed' }, { status: 503 });
  }
}

// POST /api/auth — Register or Login via Railway PostgreSQL ONLY
export async function POST(request: Request) {
  let client: any = null;
  try {
    const body = await request.json();
    const { action, email, password, name, phone } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }
    if (!action || (action !== 'register' && action !== 'login')) {
      return NextResponse.json({ error: 'action must be register or login.' }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const passHash = hashPassword(password);

    client = await getDbClient();

    // ─────────────────────────────────────────────
    // REGISTER
    // ─────────────────────────────────────────────
    if (action === 'register') {
      const existing = await client.query(
        'SELECT id FROM users WHERE LOWER(email) = $1',
        [cleanEmail]
      );
      if (existing.rows.length > 0) {
        await client.end();
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in instead.' },
          { status: 409 }
        );
      }



      const userId = `usr-${Date.now()}`;
      const userName = String(name).trim();
      const userPhone = String(phone || '').trim();

      await client.query(
        `INSERT INTO users (id, name, email, phone, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, 'customer', 'active')`,
        [userId, userName, cleanEmail, userPhone, passHash]
      );

      // Create empty cart row for this user
      await client.query(
        `INSERT INTO cart (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
        [`cart-${userId}`, userId]
      );

      await client.end();
      return NextResponse.json({
        user: { id: userId, name: userName, email: cleanEmail, phone: userPhone, role: 'customer' },
        cart: [],
        wishlist: [],
        addresses: [],
      });
    }

    // ─────────────────────────────────────────────
    // LOGIN
    // ─────────────────────────────────────────────
    const userRes = await client.query(
      'SELECT * FROM users WHERE LOWER(email) = $1',
      [cleanEmail]
    );

    if (userRes.rows.length === 0) {
      await client.end();
      return NextResponse.json(
        { error: 'No account found with this email. Please register first.' },
        { status: 404 }
      );
    }

    const dbUser = userRes.rows[0];

    // Verify password
    if (dbUser.password_hash !== passHash) {
      await client.end();
      return NextResponse.json(
        { error: 'Incorrect password. Please check and try again.' },
        { status: 401 }
      );
    }

    // Fetch saved cart
    const cartRes = await client.query(
      `SELECT ci.book_id as id, ci.quantity as qty, ci.price,
              b.title, b.cover_image as image, b.price as mrp,
              b.subject, b.slug, b.discount_price
       FROM cart c
       JOIN cart_items ci ON c.id = ci.cart_id
       LEFT JOIN books b ON ci.book_id = b.id
       WHERE c.user_id = $1`,
      [dbUser.id]
    );

    const cartItems = cartRes.rows.map((row: any) => ({
      id: row.id,
      title: row.title || `Book #${row.id}`,
      price: Number(row.price),
      mrp: Number(row.mrp || row.price + 40),
      qty: Number(row.qty),
      image: row.image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      subject: row.subject || 'Guide',
      slug: row.slug || row.id,
      cls: '10th',
      category: 'guide',
      discount: 20,
      rating: 5.0,
      reviews: 120,
      badge: 'BESTSELLER',
      badgeColor: 'bg-blue-600',
      description: 'Official guide book.',
      features: ['Solved Papers'],
      inStock: true,
    }));

    // Fetch wishlist
    const wishRes = await client.query(
      'SELECT book_id FROM wishlist WHERE user_id = $1',
      [dbUser.id]
    );
    const wishlistIds = wishRes.rows.map((row: any) => row.book_id);

    // Fetch saved addresses
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

    await client.end();

    return NextResponse.json({
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone,
        role: dbUser.role || 'customer',
      },
      cart: cartItems,
      wishlist: wishlistIds,
      addresses,
    });
  } catch (err: any) {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Database connection failed. Please try again.' }, { status: 503 });
  }
}

// PATCH /api/auth — Update user profile (name, phone) in Railway PostgreSQL
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

    return NextResponse.json({ success: true, message: 'Profile updated in Railway PostgreSQL DB' });
  } catch (err: any) {
    if (client) { try { await client.end(); } catch (_) {} }
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
