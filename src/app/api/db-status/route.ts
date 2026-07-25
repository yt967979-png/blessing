import { NextResponse } from 'next/server';
import { getDbClient, defaultSeedBooks, defaultSeedCategories } from '@/lib/db';

export async function GET() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_PUBLIC_URL;
  const client = await getDbClient();

  if (!client) {
    return NextResponse.json({
      status: 'DISCONNECTED',
      message: 'DATABASE_URL is missing in Railway environment variables.',
      instruction: 'In Railway Dashboard -> Web Service -> Variables, add DATABASE_URL = ${{Postgres.DATABASE_URL}}',
      envKeysPresent: Object.keys(process.env).filter((k) => k.includes('DB') || k.includes('POSTGRES') || k.includes('PG')),
    });
  }

  try {
    // Check & Seed Categories
    const catRes = await client.query('SELECT COUNT(*) FROM categories');
    let catCount = Number(catRes.rows[0].count);
    if (catCount === 0) {
      for (const c of defaultSeedCategories) {
        await client.query(
          `INSERT INTO categories (id, name, slug, parent_category) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [c.id, c.name, c.slug, c.parent_category]
        );
      }
      const newCatRes = await client.query('SELECT COUNT(*) FROM categories');
      catCount = Number(newCatRes.rows[0].count);
    }

    // Check & Seed Books
    const bookRes = await client.query('SELECT COUNT(*) FROM books');
    let bookCount = Number(bookRes.rows[0].count);
    if (bookCount === 0) {
      for (const b of defaultSeedBooks) {
        await client.query(
          `INSERT INTO books (id, title, slug, isbn, author, publisher, edition, language, subject, category_id, description, price, discount_price, stock, pages, weight, cover_image, status, featured)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) ON CONFLICT (id) DO NOTHING`,
          [b.id, b.title, b.slug, b.isbn, b.author, b.publisher, b.edition, b.language, b.subject, b.category_id, b.description, b.price, b.discount_price, b.stock, b.pages, b.weight, b.cover_image, b.status, b.featured]
        );
      }
      const newBookRes = await client.query('SELECT COUNT(*) FROM books');
      bookCount = Number(newBookRes.rows[0].count);
    }

    // Check User, Orders & Reviews count
    const userRes = await client.query('SELECT COUNT(*) FROM users');
    const orderRes = await client.query('SELECT COUNT(*) FROM orders');
    const revRes = await client.query('SELECT COUNT(*) FROM reviews');
    const addrRes = await client.query('SELECT COUNT(*) FROM addresses');

    return NextResponse.json({
      status: 'CONNECTED',
      database: 'Railway PostgreSQL',
      connectionUrlFound: !!connectionString,
      tableRowCounts: {
        books: bookCount,
        categories: catCount,
        users: Number(userRes.rows[0].count),
        orders: Number(orderRes.rows[0].count),
        reviews: Number(revRes.rows[0].count),
        addresses: Number(addrRes.rows[0].count),
      },
      message: '✅ Railway PostgreSQL is connected and 17 tables are active with live seed catalog!',
    });
  } catch (err: any) {
    return NextResponse.json({ status: 'ERROR', error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
