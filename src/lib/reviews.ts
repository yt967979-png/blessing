import { queryDb } from '@/lib/db';

export interface ReviewRow {
  id: string;
  user_id: string | null;
  user_name: string | null;
  book_id: string | null;
  order_id: string | null;
  rating: number;
  review: string;
  images: string[] | null;
  verified_purchase: boolean;
  created_at: string | Date;
  updated_at: string | Date | null;
}

async function execQuery(client: any, sql: string, params?: any[]): Promise<any> {
  if (typeof client === 'function') {
    return client(sql, params);
  }
  if (client && typeof client.query === 'function') {
    return client.query(sql, params);
  }
  return queryDb(sql, params);
}

export async function ensureReviewSchema(client: any) {
  await execQuery(client, `
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id VARCHAR(255);
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN DEFAULT TRUE;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_book
      ON reviews (user_id, book_id)
      WHERE user_id IS NOT NULL AND book_id IS NOT NULL;
  `);
}

function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean).slice(0, 5);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean).slice(0, 5);
    } catch {
      return raw ? [raw] : [];
    }
  }
  return [];
}

export function mapPublicReview(r: ReviewRow) {
  return {
    id: r.id,
    studentName: r.user_name || 'Verified Student',
    rating: Number(r.rating || 5),
    comment: r.review,
    images: parseImages(r.images),
    verifiedPurchase: r.verified_purchase !== false,
    createdAt: new Date(r.created_at).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    updatedAt: r.updated_at
      ? new Date(r.updated_at).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : null,
    isOwn: false as boolean,
  };
}

/** Order must be delivered and include this book. */
export async function findDeliveredPurchase(
  client: any,
  userId: string,
  bookId: string
): Promise<{ orderId: string; orderNumber: string } | null> {
  const res = await execQuery(
    client,
    `SELECT o.id AS order_id, o.order_number
     FROM orders o
     INNER JOIN order_items oi ON oi.order_id = o.id
     WHERE o.user_id = $1
       AND oi.book_id = $2
       AND (
         COALESCE(o.order_status, '') ILIKE '%delivered%'
         OR COALESCE(o.courier_status, '') ILIKE '%delivered%'
         OR o.delivered_at IS NOT NULL
       )
     ORDER BY COALESCE(o.delivered_at, o.ordered_at) DESC
     LIMIT 1`,
    [userId, bookId]
  );
  if (!res.rows.length) return null;
  return {
    orderId: res.rows[0].order_id,
    orderNumber: res.rows[0].order_number,
  };
}

export async function getUserReviewForBook(client: any, userId: string, bookId: string) {
  const res = await execQuery(
    client,
    `SELECT * FROM reviews WHERE user_id = $1 AND book_id = $2 LIMIT 1`,
    [userId, bookId]
  );
  return (res.rows[0] as ReviewRow) || null;
}

export async function getBookReviewStats(client: any, bookId: string) {
  const res = await execQuery(
    client,
    `SELECT COUNT(*)::int AS count, COALESCE(AVG(rating), 0)::numeric(3,1) AS avg_rating
     FROM reviews WHERE book_id = $1`,
    [bookId]
  );
  return {
    count: Number(res.rows[0]?.count || 0),
    avgRating: Number(res.rows[0]?.avg_rating || 0),
  };
}
