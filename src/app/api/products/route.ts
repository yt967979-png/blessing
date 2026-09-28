import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient, ensureDefaultCategories, queryDb } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';
import { recordAdminAudit } from '@/lib/adminAudit';
import { getCatalogCacheTtlMs, getCatalogCdnHeaders } from '@/lib/launchScale';
import { isBookInStock, calculateBookPrices } from '@/lib/stock';
import { syncAllAbandonedCartsInDb } from '@/lib/abandonedCartSync';
import { isComboItem } from '@/lib/deliveryRules';
import { redisGetJson, redisSetJson } from '@/lib/redis';
import { normalizeProductMedium } from '@/lib/productMedium';

// Shared catalog cache: same search/class/slug reused without hitting DB again
const queryCache = new Map<string, { data: any[]; timestamp: number }>();
const MAX_CACHE_KEYS = 120;

// In-flight single-flight request coalescing: if 20,000 requests arrive at the same millisecond, only 1 queries DB
const inFlightRequests = new Map<string, Promise<any[]>>();

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

export async function invalidateProductsCache() {
  queryCache.clear();
  try {
    const { redisDelPattern } = await import('@/lib/redis');
    await redisDelPattern('catalog:*');
    await redisDelPattern('book_meta:*');
  } catch {}
  try {
    const { invalidateLiveProductsCache } = await import('@/app/api/products/live/route');
    await invalidateLiveProductsCache();
  } catch {}
  try {
    const { invalidateMetaMemoryCache } = await import('@/app/products/[slug]/page');
    invalidateMetaMemoryCache();
  } catch {}
  try {
    const { revalidatePath } = await import('next/cache');
    revalidatePath('/', 'layout');
    revalidatePath('/products/[slug]', 'page');
    revalidatePath('/admin');
  } catch {}
}

function cacheKey(cls: string | null, search: string | null, slug: string | null) {
  const normSlug = slug ? String(slug).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') : '';
  return `c=${cls || ''}|s=${(search || '').trim().toLowerCase()}|g=${normSlug}`;
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

/** CDN-bypass headers for SSE-triggered re-fetches (?fresh=1). */
function freshHeaders(extra: Record<string, string> = {}) {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    Vary: 'Accept-Encoding',
    ...extra,
  };
}

/** Selling price: use discount_price only when it is a real sale (< MRP). */
function mapBookPrices(d: { price?: unknown; discount_price?: unknown }) {
  return calculateBookPrices(d);
}

function mapBookInStock(d: { status?: unknown; stock?: unknown }) {
  return isBookInStock(d);
}

async function ensureCategory(categoryId: string, cls: string, category: string) {
  const name = category === 'combo' ? 'Combo Packs' : `${cls || '10th'} Standard Guides`;
  const slug = categoryId.replace(/^cat-/, '') || 'guides';
  await queryDb(
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

function mapCatalogRows(rows: any[]) {
  return (rows || []).map((d: any) => {
    const { price, mrp, discount } = mapBookPrices(d);
    const safeTitle = String(d.title || '');
    const isCombo = isComboItem({
      title: d.title,
      subject: d.subject,
      category_id: d.category_id,
      combo_subjects: d.combo_subjects,
    });

    // Authoritative class extraction: check category_id first (e.g. cat-7th -> 7th), then fall back to title regex
    let extractedClass = '10th';
    const catMatch = String(d.category_id || '').match(/^cat-(6th|7th|8th|9th|10th|11th|12th)$/i);
    if (catMatch) {
      extractedClass = catMatch[1];
    } else {
      const classMatch = safeTitle.match(/(6th|7th|8th|9th|10th|11th|12th)/i);
      if (classMatch) {
        extractedClass = classMatch[0];
      }
    }
    extractedClass = extractedClass.toLowerCase();
    const safeImg = safeCatalogImage(d.cover_image);

    let comboSubjects: string[] | undefined = undefined;
    if (d.combo_subjects) {
      if (Array.isArray(d.combo_subjects)) {
        comboSubjects = d.combo_subjects;
      } else if (typeof d.combo_subjects === 'string') {
        try {
          const parsed = JSON.parse(d.combo_subjects);
          if (Array.isArray(parsed)) comboSubjects = parsed;
        } catch {}
      }
    }

    return {
      id: d.id,
      slug: d.slug || d.id,
      title: safeTitle || 'Guide Book',
      subtitle: `${extractedClass} Standard Guide`,
      cls: extractedClass,
      category: isCombo ? 'combo' : 'guide',
      subject: (d.subject && String(d.subject).trim()) || 'General',
      price,
      mrp,
      discount,
      rating: Number(d.review_count) > 0 ? Number(d.avg_rating || 0) : 0,
      reviews: Number(d.review_count || 0),
      badge: (d.badge && String(d.badge).trim()) || '',
      badgeColor: (d.badge && String(d.badge).trim())
        ? String(d.badge).toUpperCase().includes('COMBO')
          ? 'bg-purple-600'
          : 'bg-blue-600'
        : 'bg-blue-600',
      image: safeImg,
      hoverImage: safeImg,
      samplePdfUrl: d.sample_pdf_url || null,
      comboSubjects: comboSubjects || undefined,
      description: d.description || `Complete ${extractedClass} Standard guide book for exam success.`,
      features: ['Solved Papers', 'Chapter Notes'],
      inStock: mapBookInStock(d),
      stock: Number(d.stock ?? 0),
      stockTamil: d.stock_tamil !== null && d.stock_tamil !== undefined ? Number(d.stock_tamil) : null,
      stockEnglish: d.stock_english !== null && d.stock_english !== undefined ? Number(d.stock_english) : null,
      stock_tamil: d.stock_tamil !== null && d.stock_tamil !== undefined ? Number(d.stock_tamil) : null,
      stock_english: d.stock_english !== null && d.stock_english !== undefined ? Number(d.stock_english) : null,
      isBestSeller: String(d.badge || '').toUpperCase().includes('BEST'),
      isComingSoon: Boolean(d.is_coming_soon || d.status === 'coming_soon'),
      language: d.language || 'Both',
    };
  });
}

let booksColumnsChecked = false;
async function ensureBooksColumns() {
  if (booksColumnsChecked) return;
  booksColumnsChecked = true;
  try {
    await queryDb(`ALTER TABLE books ADD COLUMN IF NOT EXISTS combo_subjects JSONB DEFAULT '[]'::jsonb;`);
    await queryDb(`ALTER TABLE books ADD COLUMN IF NOT EXISTS language VARCHAR(50) DEFAULT 'Both';`);
    await queryDb(`ALTER TABLE books ADD COLUMN IF NOT EXISTS stock_tamil INT DEFAULT NULL;`);
    await queryDb(`ALTER TABLE books ADD COLUMN IF NOT EXISTS stock_english INT DEFAULT NULL;`);
    await queryDb(`ALTER TABLE books ADD COLUMN IF NOT EXISTS is_coming_soon BOOLEAN DEFAULT false;`);
    await queryDb(`ALTER TABLE stock_holds ADD COLUMN IF NOT EXISTS medium VARCHAR(50);`);
    await queryDb(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS medium VARCHAR(50);`);
  } catch {}
}

/** Always 200 JSON for the shop — never surface DB/schema faults as HTTP 500. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cls = searchParams.get('cls');
    const search = searchParams.get('search');
    const slug = searchParams.get('slug');
    const key = cacheKey(cls, search, slug);
    const forceFresh = Boolean(
      searchParams.get('fresh') === '1' ||
      searchParams.get('admin') === '1' ||
      request.headers.get('x-admin-request') === '1'
    );

    const hdrs = forceFresh ? freshHeaders : catalogHeaders;

    if (!forceFresh) {
      const cached = readCache(key);
      if (cached) {
        return NextResponse.json(cached, {
          headers: hdrs({ 'X-Cache-Status': 'HIT_MEMORY' }),
        });
      }

      try {
        const redisCached = await redisGetJson<any[]>(`catalog:${key}`);
        if (redisCached && Array.isArray(redisCached) && redisCached.length > 0) {
          writeCache(key, redisCached);
          return NextResponse.json(redisCached, {
            headers: hdrs({ 'X-Cache-Status': 'HIT_REDIS' }),
          });
        }
      } catch {}

      // In-flight coalescing: if request 1 is already querying DB, requests 2-20,000 share its exact result!
      const existingInFlight = inFlightRequests.get(key);
      if (existingInFlight) {
        try {
          const coalesced = await existingInFlight;
          return NextResponse.json(coalesced, {
            headers: hdrs({ 'X-Cache-Status': 'HIT_COALESCED' }),
          });
        } catch {}
      }
    }

    const emptyOk = (cacheStatus: string) => {
      const stale = readCache(key, true);
      if (stale && stale.length > 0) {
        return NextResponse.json(stale, {
          headers: hdrs({ 'X-Cache-Status': 'STALE_MEMORY' }),
        });
      }
      return NextResponse.json([], {
        status: 200,
        headers: hdrs({ 'X-Cache-Status': cacheStatus }),
      });
    };

    const buildFilters = () => {
      let where = ' WHERE 1=1';
      const params: any[] = [];
      let count = 1;
      if (slug) {
        const rawSlug = String(slug).trim();
        const normSlug = rawSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        where += ` AND (b.slug = $${count} OR b.id = $${count} OR lower(b.slug) = $${count + 1} OR lower(b.slug) = $${count + 2} OR lower(replace(b.title, ' ', '-')) = $${count + 2})`;
        params.push(rawSlug, rawSlug.toLowerCase(), normSlug);
        count += 3;
      }
      if (cls && cls !== 'all' && cls !== 'ALL') {
        const cleanCls = cls.toLowerCase().trim();
        where += ` AND (b.category_id = $${count} OR b.category_id = $${count + 1} OR b.title ILIKE $${count + 2})`;
        params.push(`cat-${cleanCls}`, cleanCls, `%${cleanCls}%`);
        count += 3;
      }
      if (search && search.trim()) {
        where += ` AND (b.title ILIKE $${count} OR COALESCE(b.subject, '') ILIKE $${count} OR COALESCE(b.description, '') ILIKE $${count})`;
        params.push(`%${search.trim()}%`);
        count++;
      }
      return { where, params };
    };

    const loadPrimary = async () => {
      await ensureBooksColumns();
      const { where, params } = buildFilters();
      const sql = `
        SELECT b.id, b.slug, b.title, b.subject, b.price, b.discount_price, b.stock, b.stock_tamil, b.stock_english, b.status, b.is_coming_soon,
               b.badge, b.description, b.category_id, b.created_at, b.sample_pdf_url,
               b.combo_subjects, b.language,
               CASE
                 WHEN b.cover_image IS NULL OR b.cover_image = '' THEN NULL
                 WHEN b.cover_image LIKE 'data:%' THEN NULL
                 WHEN length(b.cover_image) > 2048 THEN NULL
                 ELSE b.cover_image
               END AS cover_image,
               COALESCE(COUNT(r.id), 0)::int as review_count,
               COALESCE(AVG(r.rating), 0)::numeric(3,1) as avg_rating
        FROM books b
        LEFT JOIN reviews r ON b.id = r.book_id
        ${where}
        GROUP BY b.id
        ORDER BY b.created_at DESC
      `;
      return queryDb(sql, params);
    };

    /** Minimal fallback if reviews join / columns fail — still never 500. */
    const loadFallback = async () => {
      const { where, params } = buildFilters();
      const sql = `
        SELECT b.id, b.slug, b.title, b.subject, b.price, b.discount_price, b.stock, NULL::int AS stock_tamil, NULL::int AS stock_english, b.status, COALESCE(b.is_coming_soon, false) AS is_coming_soon,
               b.badge, b.description, b.category_id, b.created_at, b.sample_pdf_url,
               '[]'::jsonb AS combo_subjects, COALESCE(b.language, 'Both') AS language,
               NULL::text AS cover_image,
               0::int as review_count,
               0::numeric as avg_rating
        FROM books b
        ${where}
        ORDER BY b.created_at DESC
        LIMIT 200
      `;
      return queryDb(sql, params);
    };

    const loadDataPromise = (async () => {
      let res: { rows?: any[] };
      try {
        res = await loadPrimary();
      } catch (primaryErr: any) {
        console.warn('[products] primary catalog query failed, using fallback:', primaryErr?.message || primaryErr);
        res = await loadFallback();
      }
      const mapped = mapCatalogRows(res.rows || []);
      if (mapped.length > 0) {
        writeCache(key, mapped);
        void redisSetJson(`catalog:${key}`, mapped, 300);
      }
      return mapped;
    })();

    if (!forceFresh) {
      inFlightRequests.set(key, loadDataPromise);
      loadDataPromise.finally(() => inFlightRequests.delete(key));
    }

    const load = (async () => {
      const mapped = await loadDataPromise;
      return NextResponse.json(mapped, {
        headers: hdrs({
          'X-Cache-Status': mapped.length > 0 ? 'MISS_DB' : 'MISS_DB_EMPTY',
          'X-Catalog-Count': String(mapped.length),
        }),
      });
    })();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const raced = await Promise.race([
      load
        .catch((err: any) => {
          console.error('[products] catalog load failed:', err?.message || err);
          return emptyOk('EMPTY_OR_ERROR');
        })
        .finally(() => {
          if (timer) clearTimeout(timer);
        }),
      new Promise<NextResponse>((resolve) => {
        timer = setTimeout(() => resolve(emptyOk('EMPTY_OR_TIMEOUT')), CATALOG_GET_BUDGET_MS);
      }),
    ]);
    return raced;
  } catch (err: any) {
    console.error('[products] GET fatal (returning []):', err?.message || err);
    return NextResponse.json([], {
      status: 200,
      headers: freshHeaders({ 'X-Cache-Status': 'FATAL_SOFT' }),
    });
  }
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  try {
    const body = await request.json();
    const { title, cls, category, price, mrp, badge, image, description, stock, stockTamil, stock_tamil, stockEnglish, stock_english, subject, status, samplePdfUrl, sample_pdf_url, comboSubjects, combo_subjects, language, medium, isComingSoon, is_coming_soon } = body;

    if (!title || price === undefined || price === null || price === '') {
      return NextResponse.json({ error: 'Title and price are required' }, { status: 400 });
    }

    const finalIsComingSoon = Boolean(isComingSoon !== undefined ? isComingSoon : (is_coming_soon !== undefined ? is_coming_soon : status === 'coming_soon'));
    const finalLanguage = normalizeProductMedium(language || medium);
    let finalStockTamil: number | null = null;
    let finalStockEnglish: number | null = null;
    let stockQty = 0;

    const rawSt = stockTamil !== undefined ? stockTamil : stock_tamil;
    const rawSe = stockEnglish !== undefined ? stockEnglish : stock_english;

    if (finalLanguage === 'English') {
      finalStockTamil = null;
      if (rawSe !== undefined && rawSe !== null && rawSe !== '') {
        finalStockEnglish = Math.max(0, parseInt(String(rawSe), 10) || 0);
      } else {
        finalStockEnglish = Math.max(0, Math.floor(Number(stock) || 0));
      }
      stockQty = finalStockEnglish;
    } else if (finalLanguage === 'Tamil') {
      finalStockEnglish = null;
      if (rawSt !== undefined && rawSt !== null && rawSt !== '') {
        finalStockTamil = Math.max(0, parseInt(String(rawSt), 10) || 0);
      } else {
        finalStockTamil = Math.max(0, Math.floor(Number(stock) || 0));
      }
      stockQty = finalStockTamil;
    } else {
      // 'Both' (bilingual): both mediums must have explicit non-null integer stock
      finalStockTamil = (rawSt !== undefined && rawSt !== null && rawSt !== '')
        ? Math.max(0, parseInt(String(rawSt), 10) || 0)
        : 0;
      finalStockEnglish = (rawSe !== undefined && rawSe !== null && rawSe !== '')
        ? Math.max(0, parseInt(String(rawSe), 10) || 0)
        : 0;
      stockQty = finalStockTamil + finalStockEnglish;
      // If admin only provided generic stock without medium split, assign to Tamil as default
      if (stockQty === 0 && stock !== undefined && Number(stock) > 0) {
        stockQty = Math.max(0, Math.floor(Number(stock) || 0));
        finalStockTamil = stockQty;
        finalStockEnglish = 0;
      }
    }

    if (!Number.isFinite(Number(stockQty)) || Number(stockQty) < 0) {
      return NextResponse.json(
        { error: 'Initial stock is required (use 0 if not yet available)' },
        { status: 400 }
      );
    }
    const bookStatus = status === 'draft' ? 'draft' : (stockQty > 0 ? 'published' : 'out_of_stock');

    const id = `bpg-${Date.now()}`;
    const slug = slugFromTitle(String(title), id);
    const finalMrp = Number(mrp || price);
    const sale = Number(price);
    const hasSale = Number.isFinite(sale) && sale > 0 && sale < finalMrp;
    const finalDiscountPrice = hasSale ? sale : null;
    const finalSubject = String(subject || 'General').trim();

    const isCombo = isComboItem({
      title: String(title || ''),
      subject: finalSubject,
      category,
      combo_subjects: Array.isArray(comboSubjects) ? comboSubjects : Array.isArray(combo_subjects) ? combo_subjects : undefined,
    });
    const categoryId = isCombo ? 'cat-combos' : `cat-${cls || '10th'}`;

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

    const finalPdf = String(samplePdfUrl || sample_pdf_url || '').trim() || null;
    const finalComboSubjects = isCombo
      ? (Array.isArray(comboSubjects)
          ? JSON.stringify(comboSubjects)
          : Array.isArray(combo_subjects)
          ? JSON.stringify(combo_subjects)
          : '[]')
      : '[]';

    // queryDb is a function — wrap so helpers that expect client.query work
    const db = { query: (text: string, params?: any[]) => queryDb(text, params) };
    await ensureDefaultCategories(db);
    await ensureCategory(categoryId, cls || '10th', isCombo ? 'combo' : 'guide');
    await ensureBooksColumns();

    const sql = `
      INSERT INTO books (id, title, slug, category_id, subject, price, discount_price, cover_image, description, status, featured, badge, stock, sample_pdf_url, combo_subjects, language, stock_tamil, stock_english, is_coming_soon)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, $11, $12, $13, $14::jsonb, $15, $16, $17, $18)
      RETURNING *
    `;
    const res = await queryDb(sql, [
      id,
      title,
      slug,
      categoryId,
      finalSubject,
      finalMrp,
      finalDiscountPrice,
      finalImg,
      finalDesc,
      bookStatus,
      finalBadge,
      stockQty,
      finalPdf,
      finalComboSubjects,
      finalLanguage,
      finalStockTamil,
      finalStockEnglish,
      finalIsComingSoon,
    ]);
    await invalidateProductsCache();
    void recordAdminAudit(
      {
        actorId: auth.user?.userId || 'admin',
        action: 'PRODUCT_CREATED',
        targetType: 'book',
        targetId: id,
        details: { title, price: finalMrp, discount_price: finalDiscountPrice, stock: stockQty },
      },
      request
    );
    try {
      const { notifyCatalogChanged } = await import('@/app/api/stock/stream/route');
      void notifyCatalogChanged([id]);
    } catch (_) {}
    void syncAllAbandonedCartsInDb().catch((e) =>
      console.warn('[POST /api/products] syncAllAbandonedCartsInDb failed:', e?.message || e)
    );
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
    return NextResponse.json({ error: 'Failed to add product. Please try again.' }, { status });
  }
}

export async function PATCH(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  try {
    const { id, title, cls, category, category_id, subject, price, mrp, inStock, stock, stockTamil, stock_tamil, stockEnglish, stock_english, description, image, badge, hasDiscount, samplePdfUrl, sample_pdf_url, comboSubjects, combo_subjects, language, medium, isComingSoon, is_coming_soon, status } = await request.json().catch(() => ({}));
    if (!id) return NextResponse.json({ error: 'Product id is required' }, { status: 400 });

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const comingSoonInput = isComingSoon !== undefined ? isComingSoon : (is_coming_soon !== undefined ? is_coming_soon : (status === 'coming_soon' ? true : undefined));
    if (comingSoonInput !== undefined) {
      await ensureBooksColumns();
      const val = Boolean(comingSoonInput);
      fields.push(`is_coming_soon = $${idx++}`);
      values.push(val);
    }

    let currentSubject = subject !== undefined ? String(subject) : undefined;
    let currentTitle = title !== undefined ? String(title) : undefined;
    const existing = await queryDb('SELECT title, subject, category_id, language, stock, stock_tamil, stock_english FROM books WHERE id = $1 LIMIT 1', [id]);
    const existingRow = existing.rows[0] || {};
    if (currentSubject === undefined) currentSubject = existingRow.subject;
    if (currentTitle === undefined) currentTitle = existingRow.title;

    const singleSubjects = [
      'tamil', 'english', 'mathematics', 'maths', 'science', 'social science', 'social',
      'physics', 'chemistry', 'biology', 'computer science', 'commerce', 'accountancy', 'economics'
    ];
    const isSingleSubject = currentSubject && singleSubjects.includes(currentSubject.trim().toLowerCase());

    if (title !== undefined) { fields.push(`title = $${idx++}`); values.push(title); }
    if (subject !== undefined) {
      fields.push(`subject = $${idx++}`);
      values.push(String(subject || 'General').trim());
    }

    const updatedLanguage = (language !== undefined || medium !== undefined) ? normalizeProductMedium(language || medium) : undefined;
    const activeLanguage = updatedLanguage || (existingRow.language ? normalizeProductMedium(existingRow.language) : 'Both');

    if (updatedLanguage !== undefined) {
      await ensureBooksColumns();
      fields.push(`language = $${idx++}`);
      values.push(updatedLanguage);
    }

    const rawStockTamil = stockTamil !== undefined ? stockTamil : stock_tamil;
    const rawStockEnglish = stockEnglish !== undefined ? stockEnglish : stock_english;

    let finalStockTamil: number | null | undefined = undefined;
    let finalStockEnglish: number | null | undefined = undefined;
    let finalStock: number | undefined = undefined;
    let finalStatus: string | undefined = undefined;

    if (activeLanguage === 'English') {
      // English-only: Tamil copies MUST NOT be added or preserved
      finalStockTamil = null;
      if (rawStockEnglish !== undefined && rawStockEnglish !== null && rawStockEnglish !== '') {
        finalStockEnglish = Math.max(0, parseInt(String(rawStockEnglish), 10) || 0);
      } else if (stock !== undefined) {
        finalStockEnglish = Math.max(0, Math.floor(Number(stock) || 0));
      } else if (updatedLanguage === 'English' && existingRow.stock_english !== null && existingRow.stock_english !== undefined) {
        finalStockEnglish = Math.max(0, Number(existingRow.stock_english) || 0);
      } else if (stock === undefined && rawStockEnglish === undefined && existingRow.stock !== undefined) {
        finalStockEnglish = Math.max(0, Number(existingRow.stock_english ?? existingRow.stock) || 0);
      }
      if (finalStockEnglish !== undefined) {
        finalStock = finalStockEnglish;
      }
    } else if (activeLanguage === 'Tamil') {
      // Tamil-only: English copies MUST NOT be added or preserved
      finalStockEnglish = null;
      if (rawStockTamil !== undefined && rawStockTamil !== null && rawStockTamil !== '') {
        finalStockTamil = Math.max(0, parseInt(String(rawStockTamil), 10) || 0);
      } else if (stock !== undefined) {
        finalStockTamil = Math.max(0, Math.floor(Number(stock) || 0));
      } else if (updatedLanguage === 'Tamil' && existingRow.stock_tamil !== null && existingRow.stock_tamil !== undefined) {
        finalStockTamil = Math.max(0, Number(existingRow.stock_tamil) || 0);
      } else if (stock === undefined && rawStockTamil === undefined && existingRow.stock !== undefined) {
        finalStockTamil = Math.max(0, Number(existingRow.stock_tamil ?? existingRow.stock) || 0);
      }
      if (finalStockTamil !== undefined) {
        finalStock = finalStockTamil;
      }
    } else {
      // Bilingual (Both)
      const prevTamil = existingRow.stock_tamil != null
        ? Math.max(0, Number(existingRow.stock_tamil) || 0)
        : (existingRow.language === 'Tamil' ? Math.max(0, Number(existingRow.stock) || 0) : 0);
      const prevEnglish = existingRow.stock_english != null
        ? Math.max(0, Number(existingRow.stock_english) || 0)
        : (existingRow.language === 'English' ? Math.max(0, Number(existingRow.stock) || 0) : 0);

      if (rawStockTamil !== undefined && rawStockTamil !== null && rawStockTamil !== '') {
        finalStockTamil = Math.max(0, parseInt(String(rawStockTamil), 10) || 0);
      } else if (updatedLanguage === 'Both' || existingRow.stock_tamil === null) {
        finalStockTamil = prevTamil;
      }

      if (rawStockEnglish !== undefined && rawStockEnglish !== null && rawStockEnglish !== '') {
        finalStockEnglish = Math.max(0, parseInt(String(rawStockEnglish), 10) || 0);
      } else if (updatedLanguage === 'Both' || existingRow.stock_english === null) {
        finalStockEnglish = prevEnglish;
      }

      if (finalStockTamil !== undefined || finalStockEnglish !== undefined) {
        const t = finalStockTamil !== undefined ? finalStockTamil : prevTamil;
        const e = finalStockEnglish !== undefined ? finalStockEnglish : prevEnglish;
        finalStockTamil = t;
        finalStockEnglish = e;
        finalStock = t + e;
      } else if (stock !== undefined) {
        finalStock = Math.max(0, Math.floor(Number(stock) || 0));
      }
    }

    if (cls !== undefined || category !== undefined || category_id !== undefined || isSingleSubject) {
      const targetCls = cls ? String(cls).trim().toLowerCase() : undefined;
      let targetCat = category_id
        ? String(category_id).trim()
        : category === 'combo'
        ? 'cat-combos'
        : (targetCls ? `cat-${targetCls}` : undefined);

      if (isSingleSubject && targetCat === 'cat-combos') {
        targetCat = targetCls ? `cat-${targetCls}` : 'cat-10th';
      }

      if (targetCat) {
        const db = { query: (text: string, params?: any[]) => queryDb(text, params) };
        await ensureDefaultCategories(db);
        await ensureCategory(targetCat, targetCls || '10th', targetCat === 'cat-combos' ? 'combo' : 'guide');
        fields.push(`category_id = $${idx++}`);
        values.push(targetCat);
      }
    }
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
    if (samplePdfUrl !== undefined || sample_pdf_url !== undefined) {
      const pdf = String(samplePdfUrl || sample_pdf_url || '').trim() || null;
      fields.push(`sample_pdf_url = $${idx++}`);
      values.push(pdf);
    }
    if (badge !== undefined) { fields.push(`badge = $${idx++}`); values.push(String(badge || '').trim().slice(0, 100)); }
    if (comboSubjects !== undefined || combo_subjects !== undefined || isSingleSubject) {
      await ensureBooksColumns();
      const raw = comboSubjects !== undefined ? comboSubjects : combo_subjects;
      const arr = isSingleSubject ? [] : (Array.isArray(raw) ? raw : []);
      fields.push(`combo_subjects = $${idx++}::jsonb`);
      values.push(JSON.stringify(arr));
    }

    if (finalStock !== undefined) {
      if (activeLanguage === 'Both') {
        const t = finalStockTamil !== undefined && finalStockTamil !== null ? finalStockTamil : (existingRow.stock_tamil != null ? Number(existingRow.stock_tamil) : 0);
        const e = finalStockEnglish !== undefined && finalStockEnglish !== null ? finalStockEnglish : (existingRow.stock_english != null ? Number(existingRow.stock_english) : 0);
        finalStatus = (t > 0 || e > 0) && finalStock > 0 ? 'published' : 'out_of_stock';
      } else {
        finalStatus = finalStock > 0 ? 'published' : 'out_of_stock';
      }
    }

    if (inStock !== undefined) {
      const available = Boolean(inStock);
      finalStatus = available ? 'published' : 'out_of_stock';
    }

    if (status !== undefined) {
      finalStatus = String(status);
    } else if (comingSoonInput === true && finalStatus === undefined) {
      finalStatus = 'coming_soon';
    } else if (comingSoonInput === false && finalStatus === undefined && existingRow.status === 'coming_soon') {
      const curStock = finalStock !== undefined ? finalStock : Number(existingRow.stock || 0);
      finalStatus = curStock > 0 ? 'published' : 'out_of_stock';
    }

    // Assign each column once (avoids "multiple assignments to same column")
    const setCols = new Map<string, unknown>();
    for (let i = 0; i < fields.length; i++) {
      const col = fields[i].split('=')[0].trim();
      setCols.set(col, values[i]);
    }
    if (finalStockTamil !== undefined) setCols.set('stock_tamil', finalStockTamil);
    if (finalStockEnglish !== undefined) setCols.set('stock_english', finalStockEnglish);
    if (finalStock !== undefined) setCols.set('stock', finalStock);
    if (finalStatus !== undefined) setCols.set('status', finalStatus);

    if (setCols.size > 0) {
      const cols = [...setCols.keys()];
      const params = [...setCols.values(), id];
      const assignments = cols.map((c, i) => `${c} = $${i + 1}`);
      assignments.push('updated_at = NOW()');
      await queryDb(
        `UPDATE books SET ${assignments.join(', ')} WHERE id = $${params.length}`,
        params
      );
      await invalidateProductsCache();
      try {
        const { notifyStockChanged, notifyCatalogChanged } = await import('@/app/api/stock/stream/route');
        void notifyStockChanged([id]);
        void notifyCatalogChanged([id]);
      } catch (_) {}
      void syncAllAbandonedCartsInDb().catch((e) =>
        console.warn('[PATCH /api/products] syncAllAbandonedCartsInDb failed:', e?.message || e)
      );

      void recordAdminAudit(
        {
          actorId: auth.user?.userId || 'admin',
          action: price !== undefined || mrp !== undefined ? 'PRICE_CHANGED' : (finalStock !== undefined ? 'STOCK_CHANGED' : 'PRODUCT_UPDATED'),
          targetType: 'book',
          targetId: id,
          details: Object.fromEntries(setCols.entries()),
        },
        request
      );
    }

    return NextResponse.json({ success: true, id });
  } catch (err: any) {
    console.error('PATCH /api/products failed:', err?.message || err);
    return NextResponse.json({ error: 'Failed to update product. Please try again.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Product id is required' }, { status: 400 });

    // Cascade cleanups: purge active carts, wishlists, and unconfirmed reservations for this deleted book
    await queryDb(`DELETE FROM cart_items WHERE book_id = $1`, [id]).catch(() => {});
    await queryDb(`DELETE FROM wishlist WHERE book_id = $1`, [id]).catch(() => {});
    await queryDb(`DELETE FROM stock_holds WHERE book_id = $1 AND status != 'confirmed'`, [id]).catch(() => {});

    await queryDb(`DELETE FROM books WHERE id = $1`, [id]);
    await invalidateProductsCache();

    void recordAdminAudit(
      {
        actorId: auth.user?.userId || 'admin',
        action: 'PRODUCT_DELETED',
        targetType: 'book',
        targetId: id,
        details: { deletedId: id },
      },
      request
    );

    try {
      // Book row is gone — stock notify would no-op; force full catalog refresh
      const { notifyCatalogChanged } = await import('@/app/api/stock/stream/route');
      void notifyCatalogChanged([id]);
    } catch (_) {}
    void syncAllAbandonedCartsInDb().catch((e) =>
      console.warn('[DELETE /api/products] syncAllAbandonedCartsInDb failed:', e?.message || e)
    );
    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    console.error('DELETE /api/products failed:', err?.message || err);
    return NextResponse.json({ error: 'Failed to delete product. Please try again.' }, { status: 500 });
  }
}
