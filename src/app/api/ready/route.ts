import { NextResponse } from 'next/server';
import { pingDb } from '@/lib/db';

/** Overall budget so Caddy/proxies get a 503 JSON body instead of a 0-byte hang. */
const READY_BUDGET_MS = Number(process.env.DB_READY_TIMEOUT_MS || 8_000);

/** Readiness probe — DB must respond (healthchecks / deploy gates). Always JSON within budget. */
export async function GET() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      pingDb().finally(() => {
        if (timer) clearTimeout(timer);
      }),
      new Promise<{ ok: false; message: string }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              ok: false,
              message: `Database ping timed out after ${READY_BUDGET_MS}ms`,
            }),
          READY_BUDGET_MS
        );
      }),
    ]);

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
      host: 'host' in result ? result.host : undefined,
      timestamp: Date.now(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown readiness error';
    return NextResponse.json(
      {
        status: 'not_ready',
        database: 'disconnected',
        message,
        timestamp: Date.now(),
      },
      { status: 503 }
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
