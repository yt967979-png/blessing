import { NextResponse } from 'next/server';

/** Baileys QR / pairing — product-disabled. */
export async function GET() {
  return NextResponse.json(
    { status: 'disabled', message: 'WhatsApp pairing is disabled for this shop.' },
    { status: 410 }
  );
}

export async function POST() {
  return NextResponse.json(
    { status: 'disabled', message: 'WhatsApp pairing is disabled for this shop.' },
    { status: 410 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { status: 'disabled', message: 'WhatsApp pairing is disabled for this shop.' },
    { status: 410 }
  );
}
