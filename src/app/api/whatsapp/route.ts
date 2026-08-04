import { NextResponse } from 'next/server';

/** WhatsApp order alerts / resend — product-disabled. */
export async function POST() {
  return NextResponse.json(
    { status: 'disabled', message: 'WhatsApp order messaging is disabled for this shop.' },
    { status: 410 }
  );
}

export async function GET() {
  return NextResponse.json(
    { status: 'disabled', service: 'WhatsApp' },
    { status: 410 }
  );
}
