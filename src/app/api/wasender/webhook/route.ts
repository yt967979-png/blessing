import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ status: 'disabled', message: 'Inbound WhatsApp webhook is disabled.' }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ status: 'disabled', service: 'Inbound WhatsApp Webhook' });
}
