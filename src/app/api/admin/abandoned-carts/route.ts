import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';
import { syncCartItemsWithBooks, syncAllAbandonedCartsInDb, CatalogBookRow } from '@/lib/abandonedCartSync';

export async function GET(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required');
  }

  let client: any = null;
  try {
    client = await getDbClient();
    if (!client) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    // Parallel fetch: top 100 recent abandoned carts + entire active catalog books
    const [res, booksRes] = await Promise.all([
      client.query(`
        SELECT 
          ac.id,
          ac.user_id,
          ac.phone,
          ac.name,
          ac.cart_json,
          ac.reminded,
          ac.created_at,
          ac.updated_at,
          (
            ac.reminded = TRUE AND EXISTS (
              SELECT 1 FROM orders o 
              LEFT JOIN users u ON o.user_id = u.id
              WHERE (
                (ac.user_id IS NOT NULL AND ac.user_id <> '' AND o.user_id = ac.user_id)
                OR (u.phone IS NOT NULL AND u.phone = ac.phone)
                OR (o.shipping_address ILIKE '%' || ac.phone || '%')
              )
              AND o.created_at >= ac.created_at
            )
          ) as converted
        FROM abandoned_carts ac
        ORDER BY ac.updated_at DESC
        LIMIT 100
      `),
      client.query(`SELECT id, title, subject, price, discount_price, stock, status, language, is_coming_soon FROM books`),
    ]);

    const catalogBooks: CatalogBookRow[] = booksRes.rows || [];
    const updatesToPersist: Promise<any>[] = [];

    const carts: any[] = [];
    for (const row of res.rows) {
      let rawItems: any[] = [];
      try {
        rawItems = JSON.parse(row.cart_json || '[]');
      } catch {
        rawItems = [];
      }

      // Synchronize and reconcile all items with the live catalog (removes out-of-stock and coming-soon)
      const syncResult = syncCartItemsWithBooks(rawItems, catalogBooks);

      // If all items in this cart became out of stock or coming soon, delete the abandoned cart from DB
      if (syncResult.items.length === 0) {
        updatesToPersist.push(
          client.query(`DELETE FROM abandoned_carts WHERE id = $1`, [row.id])
            .catch((e: any) => console.warn('[abandoned-carts] Failed to purge out-of-stock cart:', e?.message || e))
        );
        continue;
      }

      // If price, title, book ID, or out-of-stock items changed compared to stored JSON, auto-update the DB row
      if (syncResult.changed) {
        updatesToPersist.push(
          client.query(
            `UPDATE abandoned_carts SET cart_json = $1, updated_at = NOW() WHERE id = $2`,
            [JSON.stringify(syncResult.items), row.id]
          ).catch((e: any) => console.warn('[abandoned-carts] Failed auto-sync persist:', e?.message || e))
        );
      }

      carts.push({
        id: row.id,
        userId: row.user_id,
        phone: row.phone,
        name: row.name || 'Student',
        items: syncResult.items,
        totalQty: syncResult.totalQty,
        subtotal: syncResult.subtotal,
        shippingFee: syncResult.shippingFee,
        totalAmount: syncResult.totalAmount,
        reminded: Boolean(row.reminded),
        converted: Boolean(row.converted),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }

    if (updatesToPersist.length > 0) {
      await Promise.all(updatesToPersist);
    }

    return NextResponse.json({ ok: true, carts });
  } catch (err: any) {
    console.error('Failed to fetch abandoned carts:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required');
  }

  try {
    const result = await syncAllAbandonedCartsInDb();
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    console.error('Failed to manually sync abandoned carts:', err);
    return NextResponse.json({ error: err?.message || 'Sync failed' }, { status: 500 });
  }
}


export async function PATCH(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required');
  }

  let client: any = null;
  try {
    const body = await request.json().catch(() => ({}));
    const { id, reminded } = body;
    if (!id) {
      return NextResponse.json({ error: 'Missing cart ID' }, { status: 400 });
    }

    client = await getDbClient();
    if (!client) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    await client.query(
      `UPDATE abandoned_carts SET reminded = $1, updated_at = NOW() WHERE id = $2`,
      [Boolean(reminded), id]
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Failed to update abandoned cart:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    if (!auth.user) return unauthorizedResponse('Admin login required');
    return forbiddenResponse('Admin privileges required');
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing cart ID' }, { status: 400 });
  }

  let client: any = null;
  try {
    client = await getDbClient();
    if (!client) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const cleanPhone = id.replace(/\D/g, '').slice(-10);
    await client.query(
      `DELETE FROM abandoned_carts WHERE id = $1 OR phone = $1 OR ($2 != '' AND (phone = $2 OR id = ('ac-' || $2)))`,
      [id, cleanPhone]
    );
    return NextResponse.json({ ok: true, deleted: id });
  } catch (err: any) {
    console.error('Failed to delete abandoned cart:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

