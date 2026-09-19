import { NextRequest } from 'next/server';
import { verifyOpsToken, verifyOpsPin } from '@/app/api/ops/auth/route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const cookieToken = request.cookies.get('bpg_ops_session')?.value;
  const authHeader = request.headers.get('Authorization') || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : '';
  const pinHeader = request.headers.get('x-ops-pin') || '';
  const expectedPin = (process.env.OPS_PIN || '').trim();

  const isPinValid = Boolean(expectedPin && pinHeader && verifyOpsPin(pinHeader, expectedPin));
  const isAuthorized =
    (cookieToken && verifyOpsToken(cookieToken)) ||
    (headerToken && verifyOpsToken(headerToken)) ||
    isPinValid;

  if (!isAuthorized) {
    return new Response('Unauthorized Ops Session', { status: 401 });
  }

  const origin = request.nextUrl.origin;
  const encoder = new TextEncoder();

  let isClosed = false;
  let timer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const fetchAndPush = async () => {
        if (isClosed) return;
        try {
          const res = await fetch(`${origin}/api/ops/monitor`, {
            headers: {
              cookie: request.headers.get('cookie') || '',
              authorization: request.headers.get('authorization') || '',
              'x-ops-pin': pinHeader || '',
            },
            cache: 'no-store',
          });
          if (res.ok) {
            const data = await res.json();
            const message = `data: ${JSON.stringify(data)}\n\n`;
            controller.enqueue(encoder.encode(message));
          }
        } catch {
          // non-blocking
        }
      };

      await fetchAndPush();

      timer = setInterval(() => {
        void fetchAndPush();
      }, 5000);
    },
    cancel() {
      isClosed = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
