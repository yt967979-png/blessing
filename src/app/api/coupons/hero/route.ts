import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { mapHeroCoupon } from '@/lib/coupons';

let heroMemoryCache: { offer: any; timestamp: number } | null = null;
const HERO_CACHE_TTL_MS = 15000;

export function invalidateHeroCouponCache() {
  heroMemoryCache = null;
}

/** Public: the single festive offer admin pinned to the home hero. */
export async function GET() {
  const now = Date.now();
  if (heroMemoryCache && now - heroMemoryCache.timestamp < HERO_CACHE_TTL_MS) {
    return NextResponse.json(
      { offer: heroMemoryCache.offer, cached: true },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Cache': 'HIT_MEMORY',
        },
      }
    );
  }

  try {
    const res = await queryDb(
      `SELECT title, max_uses, used_count
       FROM coupons
       WHERE COALESCE(is_active, FALSE) = TRUE
         AND COALESCE(show_on_hero, FALSE) = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR max_uses <= 0 OR COALESCE(used_count, 0) < max_uses)
       ORDER BY created_at DESC
       LIMIT 1`
    );
    const mapped = mapHeroCoupon(res.rows?.[0]);
    const offer = mapped ? { title: mapped.title } : null;
    heroMemoryCache = { offer, timestamp: now };
    return NextResponse.json(
      { offer },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
          'CDN-Cache-Control': 'no-store',
          'Surrogate-Control': 'no-store',
        },
      }
    );
  } catch {
    return NextResponse.json({ offer: null });
  }
}
