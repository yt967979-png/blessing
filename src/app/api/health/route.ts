import { NextResponse } from 'next/server';

/** Liveness probe — does not require PostgreSQL (Railway healthcheck). */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'blessing-power-guide-next',
    timestamp: Date.now(),
  });
}
