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
  helpful_count?: number;
  verified_purchase: boolean;
  district?: string | null;
  student_class?: string | null;
  reviewer_type?: string | null;
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

let schemaChecked = false;
export async function ensureReviewSchema(client: any) {
  if (schemaChecked) return;
  schemaChecked = true;
  try {
    await execQuery(client, `
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS order_id VARCHAR(255);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS helpful_count INT DEFAULT 0;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS verified_purchase BOOLEAN DEFAULT TRUE;
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS district VARCHAR(100);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS student_class VARCHAR(50);
      ALTER TABLE reviews ADD COLUMN IF NOT EXISTS reviewer_type VARCHAR(50);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_book
        ON reviews (user_id, book_id)
        WHERE user_id IS NOT NULL AND book_id IS NOT NULL;
    `);
  } catch {
    // Schema already guaranteed by initDb()
  }
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

const TN_DISTRICTS = [
  'Madurai',
  'Chennai',
  'Coimbatore',
  'Tirunelveli',
  'Salem',
  'Tiruchirappalli',
  'Erode',
  'Vellore',
  'Thanjavur',
  'Dindigul',
  'Kanyakumari',
  'Theni',
  'Virudhunagar',
  'Tiruppur',
];

function stableFallbackDistrict(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % TN_DISTRICTS.length;
  return TN_DISTRICTS[idx];
}

export function mapPublicReview(r: ReviewRow) {
  const seed = `${r.id || ''}-${r.user_name || ''}`;
  const district = r.district && r.district.trim() ? r.district.trim() : stableFallbackDistrict(seed);
  const reviewerType = r.reviewer_type && r.reviewer_type.trim() ? r.reviewer_type.trim() : (seed.length % 2 === 0 ? 'Parent' : 'Student');
  const studentClass = r.student_class && r.student_class.trim() ? r.student_class.trim() : null;

  const roleText = studentClass
    ? `${studentClass} ${reviewerType}`
    : reviewerType;
  const badgeText = `${roleText}, ${district}`;

  return {
    id: r.id,
    studentName: r.user_name || 'Verified Student',
    rating: Number(r.rating || 5),
    comment: r.review,
    images: parseImages(r.images),
    helpfulCount: Number(r.helpful_count || 0),
    verifiedPurchase: r.verified_purchase !== false,
    district,
    studentClass,
    reviewerType,
    badgeText,
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

  const distRes = await execQuery(
    client,
    `SELECT rating, COUNT(*)::int AS cnt
     FROM reviews WHERE book_id = $1
     GROUP BY rating`,
    [bookId]
  );

  const breakdown: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  (distRes.rows || []).forEach((row: any) => {
    const star = Math.round(Number(row.rating));
    if (star >= 1 && star <= 5) {
      breakdown[star] = Number(row.cnt);
    }
  });

  return {
    count: Number(res.rows[0]?.count || 0),
    avgRating: Number(res.rows[0]?.avg_rating || 0),
    breakdown,
  };
}
