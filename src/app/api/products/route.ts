import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient, ensureDefaultCategories, queryDb } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';
import { getCatalogCacheTtlMs, getCatalogCdnHeaders } from '@/lib/launchScale';
import { isBookInStock } from '@/lib/stock';

// Shared catalog cache: same search/class/slug reused without hitting DB again
const queryCache = new Map<string, { data: any[]; timestamp: number }>();
const MAX_CACHE_KEYS = 120;

const PLACEHOLDER_COVER =
  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80';

/** Catalog must never ship multi‑MB data: URLs — they OOM / 500 under load. */
function safeCatalogImage(raw: unknown): string {
  const img = String(raw || '').trim();
  if (!img) return PLACEHOLDER_COVER;
  if (img.startsWith('data:')) return PLACEHOLDER_COVER;
  if (img.length > 2048) return PLACEHOLDER_COVER;
  if (img.includes('localhost') || img.includes('127.0.0.1')) return PLACEHOLDER_COVER;
  return img;
}

export function invalidateProductsCache() {
  queryCache.clear();
}

function cacheKey(cls: string | null, search: string | null, slug: string | null) {
  return `c=${cls || ''}|s=${(search || '').trim().toLowerCase()}|g=${slug || ''}`;
}

function readCache(key: string, allowStale = false) {
  const hit = queryCache.get(key);
  if (!hit) return null;
  const age = Date.now() - hit.timestamp;
  if (age > getCatalogCacheTtlMs()) {
    if (!allowStale) {
      queryCache.delete(key);
      return null;
    }
  }
  return hit.data;
}

function writeCache(key: string, data: any[]) {
  if (queryCache.size >= MAX_CACHE_KEYS) {
    const first = queryCache.keys().next().value;
    if (first) queryCache.delete(first);
  }
  queryCache.set(key, { data, timestamp: Date.now() });
}

function catalogHeaders(extra: Record<string, string> = {}) {
  return { ...getCatalogCdnHeaders(), ...extra };
}

/** Selling price: use discount_price only when it is a real sale (< MRP). */
function mapBookPrices(d: { price?: unknown; discount_price?: unknown }) {
  const mrp = Number(d.price) || 0;
  const rawSale = d.discount_price == null || d.discount_price === '' ? NaN : Number(d.discount_price);
  const hasSale = Number.isFinite(rawSale) && rawSale > 0 && rawSale < mrp;
  const price = hasSale ? rawSale : mrp;
  const discount = hasSale && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
  return { price, mrp, discount };
}

function mapBookInStock(d: { status?: unknown; stock?: unknown }) {
  return isBookInStock(d);
}

async function ensureCategory(client: any, categoryId: string, cls: string, category: string) {
  const name = category === 'combo' ? 'Combo Packs' : `${cls || '10th'} Standard Guides`;
  const slug = categoryId.replace(/^cat-/, '') || 'guides';
  await client.query(
    `INSERT INTO categories (id, name, slug, status)
     VALUES ($1, $2, $3, 'active')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = 'active'`,
    [categoryId, name, slug]
  );
}

function slugFromTitle(title: string, id: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return base ? `${base}-${id.slice(-6)}` : id;
}

const CATALOG_GET_BUDGET_MS = Number(process.env.CATALOG_GET_TIMEOUT_MS || 8_000);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cls = searchParams.get('cls');
  const search = searchParams.get('search');
  const slug = searchParams.get('slug');
  const key = cacheKey(cls, search, slug);

  const cached = readCache(key);
  // Bypass memory cache when client asks for a fresh catalog (admin edits / stock toggle)
  const forceFresh = searchParams.get('fresh') === '1';
  if (cached && !forceFresh) {
    return NextResponse.json(cached, {
      headers: catalogHeaders({ 'X-Cache-Status': 'HIT_MEMORY' }),
    });
  }

  const staleFallback = () => {
    const stale = readCache(key, true);
    if (stale) {
      return NextResponse.json(stale, {
        headers: catalogHeaders({ 'X-Cache-Status': 'STALE_MEMORY' }),
      });
    }
    // Empty Neon or DB down — never hang; shop UI soft-fails to empty catalog.
    return NextResponse.json([], {
      status: 200,
      headers: catalogHeaders({ 'X-Cache-Status': 'EMPTY_OR_TIMEOUT' }),
    });
  };

  try {
    const load = (async () => {
      // Prefer pool.query for catalog reads (cheaper than holding a checkout client)
      let sql = `
        SELECT b.*, 
               COALESCE(COUNT(r.id), 0)::int as review_count,
               COALESCE(AVG(r.rating), 0)::numeric(3,1) as avg_rating
        FROM books b
        LEFT JOIN reviews r ON b.id = r.book_id
        WHERE 1=1
      `;
      const params: any[] = [];
      let count = 1;

      if (slug) {
        sql += ` AND (b.slug = $${count} OR b.id = $${count})`;
        params.push(slug);
        count++;
      }

      if (cls && cls !== 'all' && cls !== 'ALL') {
        sql += ` AND b.title ILIKE $${count++}`;
        params.push(`%${cls}%`);
      }

      if (search && search.trim()) {
        sql += ` AND (b.title ILIKE $${count} OR b.subject ILIKE $${count} OR b.description ILIKE $${count})`;
        params.push(`%${search.trim()}%`);
        count++;
      }

      sql += ' GROUP BY b.id ORDER BY b.created_at DESC';

      const res = await queryDb(sql, params);

      if (res.rows) {
        const mapped = res.rows.map((d: any) => {
          const { price, mrp, discount } = mapBookPrices(d);

          const safeTitle = String(d.title || '');
          const isCombo = d.category_id === 'cat-combos' || safeTitle.toLowerCase().includes('combo');
          const classMatch = safeTitle.match(/(6th|7th|8th|9th|10th|11th|12th)/i);
          const extractedClass = classMatch ? classMatch[0] : '10th';

          const rawImg = String(d.cover_image || '').trim();
          const safeImg = safeCatalogImage(rawImg);

          return {
            id: d.id,
            slug: d.slug || d.id,
            title: safeTitle || 'Guide Book',
            subtitle: `${extractedClass} Standard Guide`,
            cls: extractedClass,
            category: isCombo ? 'combo' : 'guide',
            subject: d.subject || 'State Board',
            price,
            mrp,
            discount,
            rating: Number(d.review_count) > 0 ? Number(d.avg_rating || 0) : 0,
            reviews: Number(d.review_count || 0),
            badge: (d.badge && String(d.badge).trim()) || '',
            badgeColor: (d.badge && String(d.badge).trim())
              ? (String(d.badge).toUpperCase().includes('COMBO') ? 'bg-purple-600' : 'bg-blue-600')
              : 'bg-blue-600',
            image: safeImg,
            hoverImage: safeImg,
            description: d.description || 'Complete guide book for exam success.',
            features: ['Solved Papers', 'Chapter Notes'],
            inStock: mapBookInStock(d),
            stock: Number(d.stock ?? 0),
            isBestSeller: String(d.badge || '').toUpperCase().includes('BEST'),
          };
        });
        writeCache(key, mapped);
        return NextResponse.json(mapped, {
          headers: catalogHeaders({ 'X-Cache-Status': 'MISS_DB' }),
        });
      }
      return staleFallback();
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const raced = await Promise.race([
      load.catch((err: any) => {
        console.error('Error fetching products from DB:', err?.message || err);
        return staleFallback();
      }).finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<NextResponse>((resolve) => {
        timer = setTimeout(() => resolve(staleFallback()), CATALOG_GET_BUDGET_MS);
      }),
    ]);
    return raced;
  } catch (err: any) {
    console.error('Error fetching products from DB:', err?.message || err);
    return staleFallback();
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  try {
    const body = await request.json().catch(() => ({}));
    const { title, cls, category, price, mrp, badge, image, description, stock } = body;

    if (!title || price === undefined || price === null || price === '') {
      return NextResponse.json({ error: 'Title and price are required' }, { status: 400 });
    }

    // Never invent inventory — missing/invalid stock → 0 (not for sale until admin sets qty)
    const stockQty = Math.max(0, Math.floor(Number(stock)));
    if (!Number.isFinite(Number(stock)) || Number(stock) < 0) {
      return NextResponse.json(
        { error: 'Initial stock is required (use 0 if not yet available)' },
        { status: 400 }
      );
    }
    const bookStatus = stockQty > 0 ? 'published' : 'out_of_stock';

    const id = `bpg-${Date.now()}`;
    const slug = slugFromTitle(String(title), id);
    const finalMrp = Number(mrp || price);
    const sale = Number(price);
    const hasSale = Number.isFinite(sale) && sale > 0 && sale < finalMrp;
    const finalDiscountPrice = hasSale ? sale : null;
    const categoryId = category === 'combo' ? 'cat-combos' : `cat-${cls || '10th'}`;
    const finalImgRaw = String(image || '').trim();
    if (finalImgRaw.startsWith('data:')) {
      return NextResponse.json(
        { error: 'Cover image must be an uploaded URL (not base64). Use the image upload button.' },
        { status: 400 }
      );
    }
    const finalImg = finalImgRaw || PLACEHOLDER_COVER;
    const finalDesc = description || `Complete ${cls || '10th'} Standard ${title} guide.`;
    const finalBadge = String(badge || '').trim().slice(0, 100);

    await ensureDefaultCategories(queryDb as any);
    await ensureCategory(queryDb, categoryId, cls || '10th', category || 'guide');

    const sql = `
      INSERT INTO books (id, title, slug, category_id, price, discount_price, cover_image, description, status, featured, badge, stock)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, $10, $11)
      RETURNING *
    `;
    const res = await queryDb(sql, [
      id,
      title,
      slug,
      categoryId,
      finalMrp,
      finalDiscountPrice,
      finalImg,
      finalDesc,
      bookStatus,
      finalBadge,
      stockQty,
    ]);
    invalidateProductsCache();
    try {
      const { notifyStockChanged } = await import('@/app/api/stock/stream/route');
      void notifyStockChanged([id]);
    } catch (_) {}
    return NextResponse.json(res.rows[0], { status: 201 });
  } catch (err: any) {
    console.error('POST /api/products failed:', err?.message || err);
    const msg = err?.message || 'Failed to add product';
    if (msg.includes('books_category_id_fkey')) {
      return NextResponse.json(
        { error: 'Catalog category missing in database. Redeploy latest app or run category seed in Railway Postgres.' },
        { status: 500 }
      );
    }
    const status = msg.includes('connect') || msg.includes('timeout') ? 503 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  try {
    const { id, title, price, mrp, inStock, stock, description, image, badge, hasDiscount } = await request.json().catch(() => ({}));
    if (!id) return NextResponse.json({ error: 'Product id is required' }, { status: 400 });

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
    if (mrp !== undefined) { fields.push(`price = $${idx++}`); values.push(Number(mrp)); }
    if (price !== undefined || hasDiscount === false) {
      const mrpNum = Number(mrp);
      const saleNum = Number(price);
      const noSale =
        hasDiscount === false ||
        !Number.isFinite(saleNum) ||
        (Number.isFinite(mrpNum) && saleNum >= mrpNum);
      fields.push(`discount_price = $${idx++}`);
      values.push(noSale ? null : saleNum);
    }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (image !== undefined) {
      const img = String(image || '').trim();
      if (img.startsWith('data:')) {
        return NextResponse.json(
          { error: 'Cover image must be an uploaded URL (not base64). Use the image upload button.' },
          { status: 400 }
        );
      }
      fields.push(`cover_image = $${idx++}`);
      values.push(img || PLACEHOLDER_COVER);
    }
    if (badge !== undefined) { fields.push(`badge = $${idx++}`); values.push(String(badge || '').trim().slice(0, 100)); }
    let finalStatus: string | undefined = undefined;
    let finalStock: number | undefined = undefined;

    if (inStock !== undefined && stock === undefined) {
      const available = Boolean(inStock);
      // Status-only toggle — do NOT invent or wipe stock counts (keeps qty consistent).
      finalStatus = available ? 'published' : 'out_of_stock';
    }

    if (stock !== undefined) {
      const qty = Math.max(0, Math.floor(Number(stock) || 0));
      finalStock = qty;
      finalStatus = qty > 0 ? 'published' : 'out_of_stock';
    }

    // Assign each column once (avoids "multiple assignments to same column")
    const setCols = new Map<string, unknown>();
    for (let i = 0; i < fields.length; i++) {
      const col = fields[i].split('=')[0].trim();
      setCols.set(col, values[i]);
    }
    if (finalStatus !== undefined) setCols.set('status', finalStatus);
    if (finalStock !== undefined) setCols.set('stock', finalStock);

    if (setCols.size > 0) {
      const cols = [...setCols.keys()];
      const params = [...setCols.values(), id];
      const assignments = cols.map((c, i) => `${c} = $${i + 1}`);
      assignments.push('updated_at = NOW()');
      await queryDb(
        `UPDATE books SET ${assignments.join(', ')} WHERE id = $${params.length}`,
        params
      );
      invalidateProductsCache();
      if (finalStatus !== undefined || finalStock !== undefined) {
        try {
          const { notifyStockChanged } = await import('@/app/api/stock/stream/route');
          void notifyStockChanged([id]);
        } catch (_) {}
      }
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('PATCH /api/products failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Update failed' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Product id is required' }, { status: 400 });

    await queryDb(`DELETE FROM books WHERE id = $1`, [id]);
    invalidateProductsCache();
    try {
      const { notifyStockChanged } = await import('@/app/api/stock/stream/route');
      void notifyStockChanged([id]);
    } catch (_) {}
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('DELETE /api/products failed:', err?.message || err);
    return NextResponse.json({ error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
