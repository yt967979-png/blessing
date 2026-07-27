import { NextRequest, NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import {
  ensureReviewSchema,
  findDeliveredPurchase,
  getBookReviewStats,
  getUserReviewForBook,
  mapPublicReview,
} from '@/lib/reviews';
import {
  getAuthenticatedUser,
  unauthorizedResponse,
  verifyAdminRequest,
} from '@/lib/serverSecurity';

export async function GET(request: NextRequest) {
  let client: any = null;
  try {
    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');
    const includeStats = searchParams.get('stats') === '1';
    const adminList = searchParams.get('admin') === '1';
    const session = await getAuthenticatedUser(request);

    if (adminList) {
      const admin = await verifyAdminRequest(request);
      if (!admin) return unauthorizedResponse('Admin only.');
    }

    client = await getDbClient();
    await ensureReviewSchema(client);

    if (adminList) {
      const res = await client.query(
        `SELECT r.*, b.title AS book_title, u.name AS user_name, u.email AS user_email
         FROM reviews r
         LEFT JOIN books b ON b.id = r.book_id
         LEFT JOIN users u ON u.id = r.user_id
         ORDER BY r.created_at DESC
         LIMIT 200`
      );
      return NextResponse.json(
        res.rows.map((r: any) => ({
          ...mapPublicReview(r),
          bookTitle: r.book_title || 'Unknown book',
          userName: r.user_name || 'Customer',
          userEmail: r.user_email || '',
        }))
      );
    }

    if (bookId && includeStats) {
      const stats = await getBookReviewStats(client, bookId);
      let userReview = null;
      let canReview = false;
      if (session?.userId) {
        const existing = await getUserReviewForBook(client, session.userId, bookId);
        if (existing) {
          userReview = { ...mapPublicReview(existing), isOwn: true };
        } else {
          const purchase = await findDeliveredPurchase(client, session.userId, bookId);
          canReview = !!purchase;
        }
      }

      const res = await client.query(
        `SELECT * FROM reviews WHERE book_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [bookId]
      );
      const reviews = res.rows.map((r: any) => ({
        ...mapPublicReview(r),
        isOwn: session?.userId != null && r.user_id === session.userId,
      }));

      return NextResponse.json({
        stats: {
          count: stats.count,
          avgRating: stats.count > 0 ? stats.avgRating : 0,
        },
        reviews,
        canReview,
        userReview,
      });
    }

    let query = 'SELECT * FROM reviews ORDER BY created_at DESC LIMIT 50';
    const params: any[] = [];
    if (bookId) {
      query = 'SELECT * FROM reviews WHERE book_id = $1 ORDER BY created_at DESC LIMIT 100';
      params.push(bookId);
    }

    const res = await client.query(query, params);
    const reviews = res.rows.map((r: any) => mapPublicReview(r));
    return NextResponse.json(reviews);
  } catch (err: any) {
    console.error('[reviews GET]', err?.message || err);
    return NextResponse.json({ error: 'Could not load reviews.' }, { status: 503 });
  } finally {
    releaseDbClient(client);
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Login required to submit a review.');

  let client: any = null;
  try {
    const body = await request.json();
    const bookId = String(body.bookId || '').trim();
    const rating = Math.min(5, Math.max(1, Number(body.rating) || 0));
    const comment = String(body.comment || body.review || '').trim();
    const images = Array.isArray(body.images)
      ? body.images.map(String).filter(Boolean).slice(0, 5)
      : [];

    if (!bookId) {
      return NextResponse.json({ error: 'Book id is required.' }, { status: 400 });
    }
    if (!rating) {
      return NextResponse.json({ error: 'Rating is required (1–5).' }, { status: 400 });
    }
    if (comment.length < 10) {
      return NextResponse.json({ error: 'Review must be at least 10 characters.' }, { status: 400 });
    }

    client = await getDbClient();
    await ensureReviewSchema(client);

    const existing = await getUserReviewForBook(client, session.userId, bookId);
    if (existing) {
      return NextResponse.json(
        { error: 'You already reviewed this book. Use edit to update your review.' },
        { status: 409 }
      );
    }

    const purchase = await findDeliveredPurchase(client, session.userId, bookId);
    if (!purchase) {
      return NextResponse.json(
        {
          error:
            'Verified reviews are only allowed after your order is delivered. Buy this book and wait for delivery.',
        },
        { status: 403 }
      );
    }

    const userRes = await client.query(`SELECT name FROM users WHERE id = $1`, [session.userId]);
    const userName = userRes.rows[0]?.name || 'Verified Student';

    const revId = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await client.query(
      `INSERT INTO reviews (id, user_id, user_name, book_id, order_id, rating, review, images, verified_purchase, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, TRUE, NOW(), NOW())`,
      [
        revId,
        session.userId,
        userName,
        bookId,
        purchase.orderId,
        rating,
        comment,
        JSON.stringify(images),
      ]
    );

    const stats = await getBookReviewStats(client, bookId);
    return NextResponse.json({
      success: true,
      message: 'Thank you! Your verified review is published.',
      review: {
        id: revId,
        studentName: userName,
        rating,
        comment,
        images,
        verifiedPurchase: true,
      },
      stats: { count: stats.count, avgRating: stats.avgRating },
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'You already reviewed this book.' }, { status: 409 });
    }
    console.error('[reviews POST]', err?.message || err);
    return NextResponse.json({ error: 'Could not save review.' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Login required to edit your review.');

  let client: any = null;
  try {
    const body = await request.json();
    const reviewId = String(body.id || '').trim();
    const bookId = String(body.bookId || '').trim();
    const rating =
      body.rating != null ? Math.min(5, Math.max(1, Number(body.rating))) : undefined;
    const comment =
      body.comment != null ? String(body.comment || body.review || '').trim() : undefined;
    const images = Array.isArray(body.images)
      ? body.images.map(String).filter(Boolean).slice(0, 5)
      : undefined;

    if (!reviewId && !bookId) {
      return NextResponse.json({ error: 'Review id or book id is required.' }, { status: 400 });
    }

    client = await getDbClient();
    await ensureReviewSchema(client);

    let row: any;
    if (reviewId) {
      const res = await client.query(`SELECT * FROM reviews WHERE id = $1 LIMIT 1`, [reviewId]);
      row = res.rows[0];
    } else {
      row = await getUserReviewForBook(client, session.userId, bookId);
    }

    if (!row) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }
    if (row.user_id !== session.userId) {
      const admin = await verifyAdminRequest(request);
      if (!admin) {
        return NextResponse.json({ error: 'You can only edit your own review.' }, { status: 403 });
      }
    }

    if (comment !== undefined && comment.length < 10) {
      return NextResponse.json({ error: 'Review must be at least 10 characters.' }, { status: 400 });
    }

    const fields: string[] = ['updated_at = NOW()'];
    const values: any[] = [];
    let idx = 1;
    if (rating !== undefined) {
      fields.push(`rating = $${idx++}`);
      values.push(rating);
    }
    if (comment !== undefined) {
      fields.push(`review = $${idx++}`);
      values.push(comment);
    }
    if (images !== undefined) {
      fields.push(`images = $${idx++}::jsonb`);
      values.push(JSON.stringify(images));
    }

    values.push(row.id);
    const updated = await client.query(
      `UPDATE reviews SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    const stats = await getBookReviewStats(client, updated.rows[0].book_id);
    return NextResponse.json({
      success: true,
      review: { ...mapPublicReview(updated.rows[0]), isOwn: true },
      stats: { count: stats.count, avgRating: stats.avgRating },
    });
  } catch (err: any) {
    console.error('[reviews PATCH]', err?.message || err);
    return NextResponse.json({ error: 'Could not update review.' }, { status: 500 });
  } finally {
    releaseDbClient(client);
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return unauthorizedResponse('Admin only.');

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Review id required.' }, { status: 400 });

  let client: any = null;
  try {
    client = await getDbClient();
    await client.query(`DELETE FROM reviews WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } finally {
    releaseDbClient(client);
  }
}
