import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient, ensureDefaultCategories } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';
import { invalidateProductsCache } from '@/app/api/products/route';

function slugFromTitle(title: string, id: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return base ? `${base}-${id.slice(-6)}` : id;
}

/**
 * Admin bulk import books.
 * Body: { csv: string } or { rows: Array<{title,cls,category,price,mrp,stock,badge}> }
 * CSV header: title,cls,category,price,mrp,stock,badge
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) return forbiddenResponse(auth.error);

  let client: any = null;
  try {
    const body = await request.json().catch(() => ({}));
    let rows: any[] = Array.isArray(body.rows) ? body.rows : [];

    if ((!rows.length || body.csv) && typeof body.csv === 'string') {
      const lines = body.csv
        .split(/\r?\n/)
        .map((l: string) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        return NextResponse.json({ error: 'CSV needs a header row and at least one book.' }, { status: 400 });
      }
      const header = lines[0].split(',').map((h: string) => h.trim().toLowerCase().replace(/"/g, ''));
      const idx = (name: string) => header.indexOf(name);
      rows = lines.slice(1).map((line: string) => {
        const cols = line.match(/("([^"]|"")*"|[^,]*)/g)?.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim()) || line.split(',');
        const get = (name: string) => {
          const i = idx(name);
          return i >= 0 ? cols[i] || '' : '';
        };
        return {
          title: get('title'),
          cls: get('cls') || get('class') || '10th',
          category: get('category') || 'guide',
          price: get('price') || get('sale') || get('mrp'),
          mrp: get('mrp') || get('price'),
          stock: get('stock') === '' ? '0' : (get('stock') || '0'),
          badge: get('badge') || '',
        };
      });
    }

    if (!rows.length) {
      return NextResponse.json({ error: 'No rows to import.' }, { status: 400 });
    }

    client = await getDbClient();
    await ensureDefaultCategories(client);

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    const createdIds: string[] = [];

    for (const raw of rows.slice(0, 200)) {
      const title = String(raw.title || '').trim();
      if (!title) {
        skipped++;
        continue;
      }
      const cls = String(raw.cls || '10th').trim();
      const category = String(raw.category || 'guide').toLowerCase().includes('combo') ? 'combo' : 'guide';
      const mrp = Number(raw.mrp || raw.price) || 0;
      const sale = Number(raw.price || raw.mrp) || mrp;
      if (mrp <= 0) {
        errors.push(`Skip "${title}": invalid price`);
        skipped++;
        continue;
      }
      const hasSale = sale > 0 && sale < mrp;
      // Never invent inventory — missing stock column → 0 (not for sale)
      const stockRaw = raw.stock;
      const stockNum = Number(stockRaw);
      const stock = Number.isFinite(stockNum) && stockNum >= 0
        ? Math.max(0, Math.floor(stockNum))
        : 0;
      const bookStatus = stock > 0 ? 'published' : 'out_of_stock';
      const badge = String(raw.badge || '').trim().slice(0, 100);
      const id = `bpg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const slug = slugFromTitle(title, id);
      const categoryId = category === 'combo' ? 'cat-combos' : `cat-${cls || '10th'}`;

      try {
        await client.query(
          `INSERT INTO categories (id, name, slug, status)
           VALUES ($1, $2, $3, 'active')
           ON CONFLICT (id) DO UPDATE SET status = 'active'`,
          [categoryId, category === 'combo' ? 'Combo Packs' : `${cls} Standard Guides`, categoryId.replace(/^cat-/, '')]
        );
        await client.query(
          `INSERT INTO books (id, slug, title, subject, price, discount_price, stock, status, category_id, badge, cover_image, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id,
            slug,
            title,
            'State Board',
            mrp,
            hasSale ? sale : null,
            stock,
            bookStatus,
            categoryId,
            badge,
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
            `Complete ${cls} Standard ${title} guide.`,
          ]
        );
        createdIds.push(id);
        created++;
      } catch (e: any) {
        errors.push(`${title}: ${e?.message || 'failed'}`);
        skipped++;
      }
    }

    invalidateProductsCache();
    if (createdIds.length) {
      try {
        const { notifyCatalogChanged } = await import('@/app/api/stock/stream/route');
        void notifyCatalogChanged(createdIds);
      } catch (_) { /* non-fatal */ }
    }
    return NextResponse.json({ success: true, created, skipped, errors: errors.slice(0, 20) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Bulk import failed' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}
