import { NextResponse } from 'next/server';
import { getDbClient, defaultSeedBooks } from '@/lib/db';

export async function GET(request: Request) {
  const client = await getDbClient();
  let searchParam: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const cls = searchParams.get('cls');
    const search = searchParams.get('search');
    searchParam = search;

    if (client) {
      let sql = 'SELECT * FROM books WHERE 1=1';
      const params: any[] = [];
      let count = 1;

      if (cls && cls !== 'all' && cls !== 'ALL') {
        sql += ` AND title ILIKE $${count++}`;
        params.push(`%${cls}%`);
      }

      if (search && search.trim()) {
        sql += ` AND (title ILIKE $${count} OR subject ILIKE $${count} OR description ILIKE $${count})`;
        params.push(`%${search.trim()}%`);
        count++;
      }

      sql += ' ORDER BY created_at DESC';

      const res = await client.query(sql, params);

      if (res.rows && res.rows.length > 0) {
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
            rating: 5.0,
            reviews: 120,
            badge: isCombo ? 'SUPER COMBO' : 'BESTSELLER',
            badgeColor: 'bg-blue-600',
            image: d.cover_image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
            hoverImage: d.cover_image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
            description: d.description || 'Complete guide book for exam success.',
            features: ['Solved Papers', 'Chapter Notes'],
            inStock: d.stock > 0,
          };
        });
        return NextResponse.json(mapped);
      }
    }
  } catch (err: any) {
    console.error('Error fetching products from DB:', err.message);
  } finally {
    if (client) await client.end();
  }

  // Fallback map default seed books
  let mappedSeed = defaultSeedBooks.map((b) => ({
    id: b.id,
    slug: b.slug,
    title: b.title,
    subtitle: `${b.subject} Guide`,
    cls: b.title.includes('12th') ? '12th' : '10th',
    category: b.category_id === 'cat-combos' ? 'combo' : 'guide',
    subject: b.subject,
    price: b.discount_price,
    mrp: b.price,
    discount: Math.round(((b.price - b.discount_price) / b.price) * 100),
    rating: 4.9,
    reviews: 142,
    badge: b.category_id === 'cat-combos' ? 'SUPER COMBO' : 'BESTSELLER',
    badgeColor: 'bg-blue-600',
    image: b.cover_image,
    hoverImage: b.cover_image,
    description: b.description,
    features: ['Solved Papers', 'Chapter Notes'],
    inStock: true,
  }));

  if (searchParam && searchParam.trim()) {
    const term = searchParam.trim().toLowerCase();
    mappedSeed = mappedSeed.filter(
      (b) =>
        b.title.toLowerCase().includes(term) ||
        b.subject.toLowerCase().includes(term) ||
        b.cls.toLowerCase().includes(term)
    );
  }

  return NextResponse.json(mappedSeed);
}

export async function POST(request: Request) {
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
      return NextResponse.json(res.rows[0], { status: 201 });
    }

    return NextResponse.json({ id, title, price: finalDiscountPrice }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
