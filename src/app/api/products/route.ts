import { NextResponse } from 'next/server';
import { getDbClient, defaultSeedProducts } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cls = searchParams.get('cls');
    const category = searchParams.get('category');

    const client = await getDbClient();

    if (client) {
      try {
        let sql = 'SELECT * FROM products WHERE 1=1';
        const params: any[] = [];
        let count = 1;

        if (cls && cls !== 'all' && cls !== 'ALL') {
          sql += ` AND class = $${count++}`;
          params.push(cls);
        }
        if (category && category !== 'all' && category !== 'ALL') {
          sql += ` AND category = $${count++}`;
          params.push(category);
        }

        sql += ' ORDER BY createdAt DESC';

        const res = await client.query(sql, params);
        await client.end();

        if (res.rows && res.rows.length > 0) {
          const mapped = res.rows.map((d: any) => ({
            id: Number(d.id.toString().replace(/[^0-9]/g, '')) || Date.now(),
            slug: d.id,
            title: d.title,
            subtitle: `${d.class || '10th'} Standard Guide`,
            cls: d.class || '10th',
            category: d.category === 'combo' ? 'combo' : 'guide',
            subject: 'State Board',
            price: Number(d.price),
            mrp: Number(d.oldprice || d.price + 40),
            discount: Number(d.discount || 20),
            rating: Number(d.rating || 5.0),
            reviews: Number(d.reviews || 10),
            badge: d.badge || 'BESTSELLER',
            badgeColor: 'bg-blue-600',
            image: d.img || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
            hoverImage: d.img || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
            description: d.description || 'Complete guide book for exam success.',
            features: ['Solved Papers', 'Chapter Notes'],
            inStock: Boolean(d.enabled ?? true),
          }));
          return NextResponse.json(mapped);
        }
      } catch (e) {
        await client.end();
      }
    }
  } catch (err) {}

  // Fallback to default catalog if DB query fails or empty
  return NextResponse.json(defaultSeedProducts);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, cls, category, price, mrp, badge, image, description } = body;

    if (!title || !price) {
      return NextResponse.json({ error: 'Title and price are required' }, { status: 400 });
    }

    const id = `bpg-${Date.now()}`;
    const finalClass = cls || '10th';
    const finalCategory = category || 'guide';
    const finalPrice = Number(price);
    const finalMrp = Number(mrp || finalPrice + 40);
    const discountVal = Math.round(((finalMrp - finalPrice) / finalMrp) * 100).toString();
    const finalBadge = badge || 'BESTSELLER';
    const finalImg = image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80';
    const finalDesc = description || `Complete ${finalClass} Standard ${title} guide.`;

    const client = await getDbClient();
    if (client) {
      const sql = `
        INSERT INTO products (id, title, class, category, price, oldPrice, discount, rating, reviews, badge, stockQty, enabled, img, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 5.0, 15, $8, 50, 1, $9, $10)
        RETURNING *
      `;
      const res = await client.query(sql, [id, title, finalClass, finalCategory, finalPrice, finalMrp, discountVal, finalBadge, finalImg, finalDesc]);
      await client.end();
      return NextResponse.json(res.rows[0], { status: 201 });
    }

    return NextResponse.json({ id, title, price: finalPrice }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
