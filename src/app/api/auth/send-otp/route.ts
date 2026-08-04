import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'OTP authentication is deprecated. Please continue with Google (or use email & password).' },
    { status: 410 }
  );
}
