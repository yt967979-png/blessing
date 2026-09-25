import { NextRequest, NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
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
  applyRateLimitAsync,
  clientIp,
} from '@/lib/serverSecurity';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('bookId');
    const includeStats = searchParams.get('stats') === '1';
    const adminList = searchParams.get('admin') === '1';
    const session = await getAuthenticatedUser(request);

    if (adminList) {
      const admin = await verifyAdminRequest(request);
      if (!admin.isAdmin) return unauthorizedResponse('Admin only.');
    }

    await ensureReviewSchema(queryDb as any);

    if (adminList) {
      const search = (searchParams.get('q') || '').trim().toLowerCase();
      const ratingFilter = Number(searchParams.get('rating')) || 0;

      let adminSql = `
        SELECT r.*, b.title AS book_title, u.name AS user_name, u.email AS user_email
        FROM reviews r
        LEFT JOIN books b ON b.id = r.book_id
        LEFT JOIN users u ON u.id = r.user_id
        WHERE 1=1
      `;
      const adminParams: any[] = [];

      if (ratingFilter >= 1 && ratingFilter <= 5) {
        adminParams.push(ratingFilter);
        adminSql += ` AND r.rating = $${adminParams.length}`;
      }

      if (search) {
        adminParams.push(`%${search}%`);
        const pIdx = adminParams.length;
        adminSql += ` AND (
          LOWER(COALESCE(b.title, '')) LIKE $${pIdx} OR
          LOWER(COALESCE(r.user_name, '')) LIKE $${pIdx} OR
          LOWER(COALESCE(u.name, '')) LIKE $${pIdx} OR
          LOWER(COALESCE(u.email, '')) LIKE $${pIdx} OR
          LOWER(COALESCE(r.review, '')) LIKE $${pIdx}
        )`;
      }

      adminSql += ` ORDER BY r.created_at DESC LIMIT 200`;

      const res = await queryDb(adminSql, adminParams);
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
      const stats = await getBookReviewStats(queryDb, bookId);
      let userReview = null;
      let canReview = false;
      if (session?.userId) {
        const existing = await getUserReviewForBook(queryDb, session.userId, bookId);
        if (existing) {
          userReview = { ...mapPublicReview(existing), isOwn: true };
        } else {
          const purchase = await findDeliveredPurchase(queryDb, session.userId, bookId);
          canReview = !!purchase;
        }
      }

      const sortParam = searchParams.get('sort') || 'newest';
      let orderBy = 'created_at DESC';
      if (sortParam === 'highest') {
        orderBy = 'rating DESC, created_at DESC';
      } else if (sortParam === 'lowest') {
        orderBy = 'rating ASC, created_at DESC';
      } else if (sortParam === 'helpful') {
        orderBy = 'COALESCE(helpful_count, 0) DESC, created_at DESC';
      }

      const filterRating = Number(searchParams.get('rating'));
      const photosOnly = searchParams.get('photos') === '1';

      let sql = `SELECT * FROM reviews WHERE book_id = $1`;
      const params: any[] = [bookId];

      if (filterRating >= 1 && filterRating <= 5) {
        params.push(filterRating);
        sql += ` AND rating = $${params.length}`;
      }

      if (photosOnly) {
        sql += ` AND images IS NOT NULL AND jsonb_array_length(CASE WHEN jsonb_typeof(images) = 'array' THEN images ELSE '[]'::jsonb END) > 0`;
      }

      sql += ` ORDER BY ${orderBy} LIMIT 100`;

      const res = await queryDb(sql, params);
      const reviews = res.rows.map((r: any) => ({
        ...mapPublicReview(r),
        isOwn: session?.userId != null && r.user_id === session.userId,
      }));

      return NextResponse.json({
        stats: {
          count: stats.count,
          avgRating: stats.count > 0 ? stats.avgRating : 0,
          breakdown: stats.breakdown || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
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

    const res = await queryDb(query, params);
    const reviews = res.rows.map((r: any) => mapPublicReview(r));
    return NextResponse.json(reviews);
  } catch (err: any) {
    console.error('[reviews GET]', err?.message || err);
    return NextResponse.json({ error: 'Could not load reviews.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // Action: Helpful vote (IP-deduplicated to prevent manipulation)
    if (body.action === 'vote_helpful') {
      const voterIp = clientIp(request) || 'unknown';
      const rlVote = await applyRateLimitAsync(`vote_helpful:${voterIp}`, 30, 60000);
      if (!rlVote.allowed) {
        return NextResponse.json({ error: 'Too many votes. Please wait a minute.' }, { status: 429 });
      }

      const reviewId = String(body.reviewId || '').trim();
      if (!reviewId) {
        return NextResponse.json({ error: 'Review id is required.' }, { status: 400 });
      }
      await ensureReviewSchema(queryDb as any);

      // Atomic insert — ON CONFLICT means same IP can only vote once per review
      const voteRes = await queryDb(
        `INSERT INTO review_votes (review_id, voter_ip) VALUES ($1, $2)
         ON CONFLICT (review_id, voter_ip) DO NOTHING
         RETURNING id`,
        [reviewId, voterIp]
      );

      if (!voteRes.rows.length) {
        // Already voted — return current count without incrementing
        const cur = await queryDb(`SELECT helpful_count FROM reviews WHERE id = $1`, [reviewId]);
        return NextResponse.json({
          success: false,
          alreadyVoted: true,
          helpfulCount: Number(cur.rows[0]?.helpful_count || 0),
        });
      }

      const res = await queryDb(
        `UPDATE reviews SET helpful_count = COALESCE(helpful_count, 0) + 1 WHERE id = $1 RETURNING helpful_count`,
        [reviewId]
      );
      if (!res.rows.length) {
        return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        helpfulCount: Number(res.rows[0].helpful_count || 1),
      });
    }

    const session = await getAuthenticatedUser(request);
    if (!session) return unauthorizedResponse('Login required to submit a review.');

    const rlPost = await applyRateLimitAsync(`review_post:${session.userId}:${clientIp(request)}`, 5, 60000);
    if (!rlPost.allowed) {
      return NextResponse.json({ error: 'Too many reviews submitted. Please wait.' }, { status: 429 });
    }

    const bookId = String(body.bookId || '').trim();
    const rating = Math.min(5, Math.max(1, Number(body.rating) || 0));
    const comment = String(body.comment || body.review || '').trim().slice(0, 2000);
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

    await ensureReviewSchema(queryDb as any);

    const existing = await getUserReviewForBook(queryDb, session.userId, bookId);
    if (existing) {
      return NextResponse.json(
        { error: 'You already reviewed this book. Use edit to update your review.' },
        { status: 409 }
      );
    }

    const purchase = await findDeliveredPurchase(queryDb, session.userId, bookId);
    if (!purchase) {
      return NextResponse.json(
        {
          error:
            'Verified reviews are only allowed after your order is delivered. Buy this book and wait for delivery.',
        },
        { status: 403 }
      );
    }

    let district = String(body.district || '').trim();
    if (!district && purchase.orderId) {
      try {
        const oRes = await queryDb('SELECT shipping_address FROM orders WHERE id = $1', [purchase.orderId]);
        const sAddr = oRes.rows[0]?.shipping_address;
        if (sAddr) {
          const parsed = typeof sAddr === 'string' ? JSON.parse(sAddr) : sAddr;
          district = parsed.district || parsed.city || '';
        }
      } catch {
        /* best effort */
      }
    }

    const reviewerType = String(body.reviewerType || 'Parent / Student').trim();
    const studentClass = String(body.studentClass || '').trim();

    const userRes = await queryDb(`SELECT name FROM users WHERE id = $1`, [session.userId]);
    const userName = userRes.rows[0]?.name || 'Verified Student';

    const revId = `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const insertRes = await queryDb(
      `INSERT INTO reviews (id, user_id, user_name, book_id, order_id, rating, review, images, verified_purchase, district, student_class, reviewer_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, TRUE, $9, $10, $11, NOW(), NOW())
       RETURNING *`,
      [
        revId,
        session.userId,
        userName,
        bookId,
        purchase.orderId,
        rating,
        comment,
        JSON.stringify(images),
        district || null,
        studentClass || null,
        reviewerType || null,
      ]
    );

    const stats = await getBookReviewStats(queryDb, bookId);
    return NextResponse.json({
      success: true,
      message: 'Thank you! Your verified review is published.',
      review: {
        ...mapPublicReview(insertRes.rows[0]),
        isOwn: true,
      },
      stats: { count: stats.count, avgRating: stats.avgRating },
    });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'You already reviewed this book.' }, { status: 409 });
    }
    console.error('[reviews POST]', err?.message || err);
    return NextResponse.json({ error: 'Could not save review.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await getAuthenticatedUser(request);
  if (!session) return unauthorizedResponse('Login required to edit your review.');

  try {
    const body = await request.json().catch(() => ({}));
    const reviewId = String(body.id || '').trim();
    const bookId = String(body.bookId || '').trim();
    const rating =
      body.rating != null ? Math.min(5, Math.max(1, Number(body.rating))) : undefined;
    const comment =
      body.comment != null ? String(body.comment || body.review || '').trim().slice(0, 2000) : undefined;
    const images = Array.isArray(body.images)
      ? body.images.map(String).filter(Boolean).slice(0, 5)
      : undefined;

    if (!reviewId && !bookId) {
      return NextResponse.json({ error: 'Review id or book id is required.' }, { status: 400 });
    }

    await ensureReviewSchema(queryDb as any);

    let row: any;
    if (reviewId) {
      const res = await queryDb(`SELECT * FROM reviews WHERE id = $1 LIMIT 1`, [reviewId]);
      row = res.rows[0];
    } else {
      row = await getUserReviewForBook(queryDb, session.userId, bookId);
    }

    if (!row) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }
    if (row.user_id !== session.userId) {
      const admin = await verifyAdminRequest(request);
      if (!admin.isAdmin) {
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
    const updated = await queryDb(
      `UPDATE reviews SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    const stats = await getBookReviewStats(queryDb, updated.rows[0].book_id);
    return NextResponse.json({
      success: true,
      review: { ...mapPublicReview(updated.rows[0]), isOwn: true },
      stats: { count: stats.count, avgRating: stats.avgRating },
    });
  } catch (err: any) {
    console.error('[reviews PATCH]', err?.message || err);
    return NextResponse.json({ error: 'Could not update review.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) return unauthorizedResponse('Admin only.');

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Review id required.' }, { status: 400 });

  try {
    await queryDb(`DELETE FROM reviews WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Delete failed.' }, { status: 500 });
  }
}
