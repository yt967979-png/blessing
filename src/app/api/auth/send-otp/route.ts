import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'OTP authentication is deprecated. Please register or sign in with your email/phone and password.' },
    { status: 410 }
  );
}
