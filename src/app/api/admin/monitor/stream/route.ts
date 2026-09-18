import { NextRequest } from 'next/server';
import { verifyAdminRequest } from '@/lib/serverSecurity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin.isAdmin) {
    return new Response('Unauthorized', { status: 401 });
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
          // Fetch the unified monitor payload from the local monitor endpoint
          const res = await fetch(`${origin}/api/admin/monitor`, {
            headers: {
              cookie: request.headers.get('cookie') || '',
              authorization: request.headers.get('authorization') || '',
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

      // Push initial frame immediately
      await fetchAndPush();

      // Repeat every 5 seconds
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
