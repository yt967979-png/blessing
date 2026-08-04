import { NextResponse } from 'next/server';

/** Coupons disabled — historical redemption UI is not exposed. */
export async function GET() {
  return NextResponse.json({ error: 'Coupons system is disabled.' }, { status: 410 });
}
