import { NextResponse } from 'next/server';
import { pingDb } from '@/lib/db';

/** Readiness probe — DB must respond (Railway healthcheck). */
export async function GET() {
  const result = await pingDb();
  if (!result.ok) {
    return NextResponse.json(
      {
        status: 'not_ready',
        database: 'disconnected',
        message: result.message,
        timestamp: Date.now(),
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: 'ready',
    database: 'connected',
    host: result.host,
    timestamp: Date.now(),
  });
}
