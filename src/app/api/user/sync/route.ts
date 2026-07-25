import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

// Cross-device sync handler for Cart, Wishlist, and Addresses in Railway PostgreSQL
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, cart, wishlist, addresses } = body;

    if (!userId) {
      return NextResponse.json({ message: 'Guest user, local state kept.' });
    }

    const client = await getDbClient();
    if (!client) {
      return NextResponse.json({ message: 'DB offline, local state kept.' });
    }

    try {
      // 1. Sync Cart
      if (Array.isArray(cart)) {
        const cartId = `cart-${userId}`;
        await client.query(
          `INSERT INTO cart (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
          [cartId, userId]
        );

        // Clear previous cart items
        await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);

        // Insert updated cart items
        for (const item of cart) {
          const itemId = `ci-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          await client.query(
            `INSERT INTO cart_items (id, cart_id, book_id, quantity, price) VALUES ($1, $2, $3, $4, $5)`,
            [itemId, cartId, String(item.id), Number(item.qty || 1), Number(item.price)]
          );
        }
      }

      // 2. Sync Wishlist
      if (Array.isArray(wishlist)) {
        await client.query(`DELETE FROM wishlist WHERE user_id = $1`, [userId]);
        for (const bookId of wishlist) {
          const wishId = `w-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          await client.query(
            `INSERT INTO wishlist (id, user_id, book_id) VALUES ($1, $2, $3)`,
            [wishId, userId, String(bookId)]
          );
        }
      }

      // 3. Sync Addresses
      if (Array.isArray(addresses)) {
        for (const addr of addresses) {
          const addrId = String(addr.id || `addr-${Date.now()}`);
          await client.query(
            `INSERT INTO addresses (id, user_id, full_name, phone, address_line1, city, pincode, landmark)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
               full_name = EXCLUDED.full_name,
               phone = EXCLUDED.phone,
               address_line1 = EXCLUDED.address_line1,
               city = EXCLUDED.city,
               pincode = EXCLUDED.pincode`,
            [addrId, userId, addr.name || 'User', addr.phone || '', addr.address || '', addr.city || 'Chennai', addr.pincode || '600012', addr.type || 'HOME']
          );
        }
      }

      await client.end();
      return NextResponse.json({ success: true, message: 'Cross-device state synchronized to Railway PostgreSQL.' });
    } catch (err: any) {
      if (client) await client.end();
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
