import { NextRequest } from 'next/server';
import { registerSupportClient } from '@/lib/supportEvents';
import { getAuthenticatedUser } from '@/lib/serverSecurity';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversationId') || undefined;
  const user = await getAuthenticatedUser(req).catch(() => null);
  const isAdmin = Boolean(user && (user.role === 'admin' || user.role === 'super_admin'));

  let cleanup: (() => void) | null = null;
  let heartbeatTimer: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      cleanup = registerSupportClient({
        controller,
        conversationId,
        userId: user?.userId ? String(user.userId) : undefined,
        isAdmin,
      });

      // Initial connection frame
      const initial = `data: ${JSON.stringify({
        type: 'CONNECTED',
        isAdmin,
        conversationId,
        timestamp: new Date().toISOString(),
      })}\n\n`;
      controller.enqueue(new TextEncoder().encode(initial));

      // Keepalive heartbeat ping every 25s
      heartbeatTimer = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': keepalive\n\n'));
        } catch {
          if (heartbeatTimer) clearInterval(heartbeatTimer);
        }
      }, 25000);
    },
    cancel() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (cleanup) cleanup();
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
