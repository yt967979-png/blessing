import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/serverSecurity';
import { deliveryFeeForCart, cartHasCombo } from '@/lib/deliveryRules';
import { calculateBookPrices } from '@/lib/stock';

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

    // Fetch top 100 recent abandoned carts
    // ONLY marked as converted / recovered IF reminded = TRUE (we contacted them) and order was placed
    const res = await client.query(`
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
    `);

    // Collect all unique book IDs from all abandoned carts so we can
    // batch-fetch their CURRENT prices from the catalog in one query.
    const allItemsParsed = res.rows.map((row: any) => {
      try { return JSON.parse(row.cart_json || '[]'); } catch { return []; }
    });
    const allBookIds = new Set<string>();
    for (const items of allItemsParsed) {
      for (const item of items) {
        if (item.id) allBookIds.add(String(item.id));
      }
    }

    // Batch query live prices — single round-trip for ALL book IDs
    const livePriceMap = new Map<string, number>();
    if (allBookIds.size > 0) {
      try {
        const idsArray = Array.from(allBookIds);
        const placeholders = idsArray.map((_, i) => `$${i + 1}`).join(', ');
        const priceRes = await client.query(
          `SELECT id, price, discount_price FROM books WHERE id IN (${placeholders})`,
          idsArray
        );
        for (const row of priceRes.rows) {
          const { price } = calculateBookPrices(row);
          livePriceMap.set(String(row.id), price);
        }
      } catch (e: any) {
        // If live price fetch fails, fall back to stale snapshot prices
        console.warn('[abandoned-carts] Could not fetch live prices:', e?.message || e);
      }
    }

    const carts = res.rows.map((row: any, idx: number) => {
      const items: any[] = allItemsParsed[idx] || [];
      // Enrich each item with the current live price from the catalog
      const enrichedItems = items.map((item: any) => {
        const livePrice = livePriceMap.get(String(item.id));
        return {
          ...item,
          price: livePrice !== undefined ? livePrice : Number(item.price || 0),
          snapshotPrice: Number(item.price || 0),
        };
      });

      const subtotal = enrichedItems.reduce(
        (sum: number, item: any) => sum + (Number(item.price || 0) * Number(item.qty || 1)),
        0
      );
      const totalQty = enrichedItems.reduce(
        (sum: number, item: any) => sum + Number(item.qty || 1),
        0
      );
      const hasCombo = cartHasCombo(enrichedItems);
      const shippingFee = deliveryFeeForCart(enrichedItems);
      const totalAmount = subtotal + shippingFee;

      return {
        id: row.id,
        userId: row.user_id,
        phone: row.phone,
        name: row.name || 'Student',
        items: enrichedItems,
        totalQty,
        subtotal,
        shippingFee,
        totalAmount,
        reminded: Boolean(row.reminded),
        converted: Boolean(row.converted),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return NextResponse.json({ ok: true, carts });
  } catch (err: any) {
    console.error('Failed to fetch abandoned carts:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  } finally {
    releaseDbClient(client);
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

