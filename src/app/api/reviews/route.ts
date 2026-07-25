import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET(request: Request) {
  let client: any = null;
  try {
    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');

    client = await getDbClient();

    let query = 'SELECT * FROM reviews ORDER BY created_at DESC LIMIT 50';
    let params: any[] = [];
    if (bookId) {
      query = 'SELECT * FROM reviews WHERE book_id = $1 ORDER BY created_at DESC';
      params = [bookId];
    }

    const res = await client.query(query, params);

    const reviews = res.rows.map((r: any) => ({
      id: r.id,
      studentName: r.user_name || 'Student Customer',
      rating: Number(r.rating || 5),
      comment: r.review,
      createdAt: new Date(r.created_at).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    }));

    return NextResponse.json(reviews);
  } catch (err: any) {
    return NextResponse.json({ error: 'Database connection failed.' }, { status: 503 });
  } finally {
    if (client) { try { await client.end(); } catch (_) {} }
  }
}

export async function POST(request: Request) {
  let client: any = null;
  try {
    const body = await request.json();
    const { bookId, studentName, rating, comment } = body;

    if (!comment || !rating) {
      return NextResponse.json({ error: 'Rating and review comment are required' }, { status: 400 });
    }

    client = await getDbClient();

    const revId = `rev-${Date.now()}`;
    await client.query(
      `INSERT INTO reviews (id, user_name, rating, review, book_id) VALUES ($1, $2, $3, $4, $5)`,
      [revId, studentName || 'Student', Number(rating), comment, bookId || null]
    );

    return NextResponse.json({ success: true, message: 'Thank you! Your verified student review was published.' });
  } catch (err: any) {
    return NextResponse.json({ error: 'Database connection failed.' }, { status: 503 });
  } finally {
    if (client) { try { await client.end(); } catch (_) {} }
  }
}
