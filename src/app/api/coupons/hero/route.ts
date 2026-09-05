import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { mapHeroCoupon } from '@/lib/coupons';

/** Public: the single festive offer admin pinned to the home hero. */
export async function GET() {
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
    return NextResponse.json(
      { offer },
      { headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=60' } }
    );
  } catch {
    return NextResponse.json({ offer: null });
  }
}
