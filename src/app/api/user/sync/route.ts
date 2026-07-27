import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/serverSecurity';

export async function POST(request: Request) {
  try {
    const session = await getAuthenticatedUser(request);
    if (!session) {
      return unauthorizedResponse('Please login to sync cart.');
    }

    const body = await request.json();
    const { cart, wishlist, addresses } = body;
    const userId = session.userId;

    let client: any = null;
    try {
      client = await getDbClient();
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'Database unavailable' }, { status: 503 });
    }

    try {
      const userCheck = await client.query('SELECT id FROM users WHERE id = $1', [String(userId)]);
      if (userCheck.rows.length === 0) {
        return NextResponse.json(
          { error: 'USER_NOT_FOUND', message: 'User account not found in database.' },
          { status: 404 }
        );
      }

      if (Array.isArray(cart)) {
        const cartId = `cart-${userId}`;
        await client.query(`INSERT INTO cart (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`, [
          cartId,
          userId,
        ]);
        await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
        for (const item of cart) {
          const itemId = `ci-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          try {
            await client.query(
              `INSERT INTO cart_items (id, cart_id, book_id, quantity, price) VALUES ($1, $2, $3, $4, $5)`,
              [itemId, cartId, String(item.id), Number(item.qty || 1), Number(item.price)]
            );
          } catch {
            /* skip items referencing deleted books */
          }
        }
      }

      if (Array.isArray(wishlist)) {
        await client.query(`DELETE FROM wishlist WHERE user_id = $1`, [userId]);
        for (const bookId of wishlist) {
          const wishId = `w-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          await client.query(`INSERT INTO wishlist (id, user_id, book_id) VALUES ($1, $2, $3)`, [
            wishId,
            userId,
            String(bookId),
          ]).catch(() => {});
        }
      }

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
            [
              addrId,
              userId,
              addr.name || 'User',
              addr.phone || '',
              addr.address || '',
              addr.city || 'Chennai',
              addr.pincode || '600012',
              addr.type || 'HOME',
            ]
          );
        }
      }

      return NextResponse.json({ success: true, message: 'Synced.' });
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'Sync failed' }, { status: 500 });
    } finally {
      releaseDbClient(client);
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Request failed' }, { status: 500 });
  }
}
