import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ valid: false, error: 'Coupons system is disabled.' }, { status: 400 });
}
