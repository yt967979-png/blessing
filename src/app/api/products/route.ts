import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';

// Shared catalog cache: same search/class/slug reused without hitting DB again
const queryCache = new Map<string, { data: any[]; timestamp: number }>();
const CACHE_TTL_MS = 120000; // 2 minutes RAM
const MAX_CACHE_KEYS = 80;

export function invalidateProductsCache() {
  queryCache.clear();
}

function cacheKey(cls: string | null, search: string | null, slug: string | null) {
  return `c=${cls || ''}|s=${(search || '').trim().toLowerCase()}|g=${slug || ''}`;
}

function readCache(key: string) {
  const hit = queryCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
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

const CDN_HEADERS = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  Vary: 'Accept-Encoding',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cls = searchParams.get('cls');
  const search = searchParams.get('search');
  const slug = searchParams.get('slug');
  const key = cacheKey(cls, search, slug);

  const cached = readCache(key);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { ...CDN_HEADERS, 'X-Cache-Status': 'HIT_MEMORY' },
    });
  }

  const client = await getDbClient();
  try {
    if (client) {
      let sql = `
        SELECT b.*, 
               COALESCE(COUNT(r.id), 0)::int as review_count,
               COALESCE(AVG(r.rating), 5.0)::numeric(3,1) as avg_rating
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

      const res = await client.query(sql, params);

      if (res.rows) {
        const mapped = res.rows.map((d: any) => {
          const calculatedDiscount = d.price && d.discount_price
            ? Math.round(((d.price - d.discount_price) / d.price) * 100)
            : 20;

          const isCombo = d.category_id === 'cat-combos' || d.title.toLowerCase().includes('combo');
          const classMatch = d.title.match(/(6th|7th|8th|9th|10th|11th|12th)/i);
          const extractedClass = classMatch ? classMatch[0] : '10th';

          return {
            id: d.id,
            slug: d.slug || d.id,
            title: d.title,
            subtitle: `${extractedClass} Standard Guide`,
            cls: extractedClass,
            category: isCombo ? 'combo' : 'guide',
            subject: d.subject || 'State Board',
            price: Number(d.discount_price || d.price),
            mrp: Number(d.price),
            discount: calculatedDiscount,
            rating: Number(d.avg_rating || 5.0),
            reviews: Number(d.review_count || 0),
            badge: isCombo ? 'SUPER COMBO' : 'BESTSELLER',
            badgeColor: 'bg-blue-600',
            image: d.cover_image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
            hoverImage: d.cover_image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
            description: d.description || 'Complete guide book for exam success.',
            features: ['Solved Papers', 'Chapter Notes'],
            inStock: d.status !== 'out_of_stock' && (d.stock === undefined || d.stock === null || Number(d.stock) > 0),
          };
        });
        writeCache(key, mapped);
        return NextResponse.json(mapped, {
          headers: { ...CDN_HEADERS, 'X-Cache-Status': 'MISS_DB' },
        });
      }
    }
  } catch (err: any) {
    console.error('Error fetching products from DB:', err.message);
  } finally {
    if (client) await client.end();
  }

  return NextResponse.json([]);
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const client = await getDbClient();
  try {
    const body = await request.json();
    const { title, cls, category, price, mrp, badge, image, description } = body;

    if (!title || !price) {
      return NextResponse.json({ error: 'Title and price are required' }, { status: 400 });
    }

    const id = `bpg-${Date.now()}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const finalPrice = Number(mrp || price + 40);
    const finalDiscountPrice = Number(price);
    const categoryId = category === 'combo' ? 'cat-combos' : `cat-${cls || '10th'}`;
    const finalImg = image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80';
    const finalDesc = description || `Complete ${cls || '10th'} Standard ${title} guide.`;

    if (client) {
      const sql = `
        INSERT INTO books (id, title, slug, category_id, price, discount_price, cover_image, description, status, featured)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'published', TRUE)
        RETURNING *
      `;
      const res = await client.query(sql, [id, title, slug, categoryId, finalPrice, finalDiscountPrice, finalImg, finalDesc]);
      invalidateProductsCache();
      return NextResponse.json(res.rows[0], { status: 201 });
    }

    return NextResponse.json({ id, title, price: finalDiscountPrice }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const client = await getDbClient();
  try {
    const { id, title, price, mrp, inStock, description, image } = await request.json();
    if (!id) return NextResponse.json({ error: 'Product id is required' }, { status: 400 });

    if (client) {
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
      if (price !== undefined) { fields.push(`discount_price = $${idx++}`); values.push(Number(price)); }
      if (mrp !== undefined) { fields.push(`price = $${idx++}`); values.push(Number(mrp)); }
      if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
      if (image !== undefined) { fields.push(`cover_image = $${idx++}`); values.push(image); }
      if (inStock !== undefined) {
        fields.push(`status = $${idx++}`);
        values.push(inStock ? 'published' : 'out_of_stock');
        fields.push(`stock = $${idx++}`);
        values.push(inStock ? 100 : 0);
      }

      if (fields.length > 0) {
        fields.push(`updated_at = NOW()`);
        values.push(id);
        await client.query(`UPDATE books SET ${fields.join(', ')} WHERE id = $${idx}`, values);
        invalidateProductsCache();
      }

      return NextResponse.json({ success: true, id });
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  const client = await getDbClient();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Product id is required' }, { status: 400 });

    if (client) {
      await client.query(`DELETE FROM books WHERE id = $1`, [id]);
      invalidateProductsCache();
      return NextResponse.json({ success: true, deletedId: id });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
