import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET(request: Request) {
  const client = await getDbClient();
  try {
    const { searchParams } = new URL(request.url);
    const cls = searchParams.get('cls');
    const search = searchParams.get('search');

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
        return NextResponse.json(mapped);
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

// PATCH /api/products — Update price, mrp, badge, or stock status in Railway PostgreSQL
export async function PATCH(request: Request) {
  const client = await getDbClient();
  try {
    const { id, price, mrp, badge, inStock } = await request.json();
    if (!id) return NextResponse.json({ error: 'Product id is required' }, { status: 400 });

    if (client) {
      const fields: string[] = [];
      const values: any[] = [];
      let idx = 1;

      if (price !== undefined) { fields.push(`discount_price = $${idx++}`); values.push(Number(price)); }
      if (mrp !== undefined)   { fields.push(`price = $${idx++}`); values.push(Number(mrp)); }
      if (badge !== undefined) { fields.push(`badge = $${idx++}`); values.push(badge); }
      if (inStock !== undefined) {
        fields.push(`status = $${idx++}`);
        values.push(inStock ? 'published' : 'out_of_stock');
        fields.push(`stock = $${idx++}`);
        values.push(inStock ? 100 : 0);
      }

      if (fields.length > 0) {
        values.push(id);
        await client.query(`UPDATE books SET ${fields.join(', ')} WHERE id = $${idx}`, values);
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

// DELETE /api/products — Remove a book from Railway PostgreSQL
export async function DELETE(request: Request) {
  const client = await getDbClient();
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Product id is required' }, { status: 400 });

    if (client) {
      await client.query(`DELETE FROM books WHERE id = $1`, [id]);
      return NextResponse.json({ success: true, deletedId: id });
    }

    return NextResponse.json({ success: true, deletedId: id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
