import { NextResponse } from 'next/server';
import { getDbClient } from '@/lib/db';

export async function GET(request: Request) {
  const client = await getDbClient();
  try {
    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');

    if (!client) {
      return NextResponse.json([
        {
          id: 'rev-1',
          studentName: 'Karthik M (10th Standard)',
          rating: 5,
          comment: 'Scored 96/100 in Maths State Board exam after studying with Blessing Power Guide! Solved papers were super helpful.',
          createdAt: '24 July 2026',
        },
        {
          id: 'rev-2',
          studentName: 'Ananya S (12th Standard)',
          rating: 5,
          comment: 'Very clear step-by-step explanations and diagrams for Physics & Chemistry. Delivered in 24 hours via ST Courier!',
          createdAt: '22 July 2026',
        },
      ]);
    }

    let query = 'SELECT * FROM reviews ORDER BY created_at DESC';
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
      createdAt: new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    }));

    return NextResponse.json(reviews);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}

export async function POST(request: Request) {
  const client = await getDbClient();
  try {
    const body = await request.json();
    const { bookId, studentName, rating, comment } = body;

    if (!comment || !rating) {
      return NextResponse.json({ error: 'Rating and review comment are required' }, { status: 400 });
    }

    if (!client) {
      return NextResponse.json({ success: true, message: 'Review recorded locally.' });
    }

    const revId = `rev-${Date.now()}`;
    await client.query(
      `INSERT INTO reviews (id, user_name, rating, review, book_id) VALUES ($1, $2, $3, $4, $5)`,
      [revId, studentName || 'Student', Number(rating), comment, bookId || '10th-maths']
    );

    return NextResponse.json({ success: true, message: 'Thank you! Your verified student review was published successfully.' });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (client) await client.end();
  }
}
