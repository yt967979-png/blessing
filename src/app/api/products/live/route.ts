import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { isBookInStock, calculateBookPrices } from '@/lib/stock';
import { redisGetJson, redisSetJson, redisDel } from '@/lib/redis';

// Short in-memory buffer on each worker (2.5 seconds) to coalesce concurrent poll bursts
let memoryCache: { data: Record<string, any>; timestamp: number } | null = null;
const MEMORY_TTL_MS = 2500;

export async function invalidateLiveProductsCache() {
  memoryCache = null;
  await redisDel('catalog:live_stock');
}

export async function GET(request: Request) {
  const now = Date.now();
  const url = new URL(request.url);
  const forceFresh = url.searchParams.get('fresh') === '1' || Boolean(request.headers.get('authorization'));

  // 1. Fast-path: local process memory (sub-millisecond)
  if (!forceFresh && memoryCache && now - memoryCache.timestamp < MEMORY_TTL_MS) {
    return NextResponse.json(
      { ok: true, books: memoryCache.data, cached: 'memory' },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Live-Cache': 'HIT_MEMORY',
        },
      }
    );
  }

  // 2. Shared Redis cache (coalesce across worker blessing@3000 and blessing@3001)
  if (!forceFresh) {
    const redisCached = await redisGetJson<Record<string, any>>('catalog:live_stock');
    if (redisCached) {
      memoryCache = { data: redisCached, timestamp: now };
      return NextResponse.json(
        { ok: true, books: redisCached, cached: 'redis' },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Live-Cache': 'HIT_REDIS',
          },
        }
      );
    }
  }

  // 3. Lean database query: only dynamic columns (0 joins, minimal bandwidth)
  try {
    const res = await queryDb(
      `SELECT id, stock, price, discount_price, status, language, title, badge, sample_pdf_url, cover_image FROM books ORDER BY id`
    );

    const map: Record<string, any> = {};
    for (const row of res.rows || []) {
      const { price, mrp, discount } = calculateBookPrices(row);
      const inStock = isBookInStock(row);
      const stock = Math.max(0, Math.floor(Number(row.stock) || 0));

      map[row.id] = {
        id: row.id,
        stock,
        inStock,
        price,
        mrp,
        discount,
        status: row.status,
        language: row.language || 'Both',
        title: row.title != null ? String(row.title) : undefined,
        badge: row.badge != null ? String(row.badge) : undefined,
        samplePdfUrl: row.sample_pdf_url != null ? String(row.sample_pdf_url) : null,
        coverImage: row.cover_image != null ? String(row.cover_image) : undefined,
      };
    }

    memoryCache = { data: map, timestamp: now };
    void redisSetJson('catalog:live_stock', map, 3); // 3-second Redis TTL

    return NextResponse.json(
      { ok: true, books: map, cached: 'db' },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Live-Cache': 'MISS_DB',
        },
      }
    );
  } catch (err: any) {
    console.error('[/api/products/live] failed:', err?.message || err);
    // Soft fail: return whatever memory cache had, even if stale, never 500
    if (memoryCache) {
      return NextResponse.json(
        { ok: true, books: memoryCache.data, cached: 'stale' },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Live-Cache': 'STALE_MEMORY',
          },
        }
      );
    }
    return NextResponse.json({ ok: false, books: {}, error: 'Service Unavailable' }, { status: 503 });
  }
}
