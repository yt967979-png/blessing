import { NextRequest } from 'next/server';

// In-memory set of connected SSE response controllers for instant real-time broadcasts (like Firebase)
const clients = new Set<ReadableStreamDefaultController>();

export function broadcastOrderChange(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(message);

  for (const client of clients) {
    try {
      client.enqueue(encoded);
    } catch (e) {
      clients.delete(client);
    }
  }
}

export async function GET(req: NextRequest) {
  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);

      // Send initial heartbeat connection message
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`));

      req.signal.addEventListener('abort', () => {
        clients.delete(controller);
        try {
          controller.close();
        } catch (_) {}
      });
    },
    cancel() {
      // Clean up disconnected clients
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable NGINX / proxy buffering for instant delivery
    },
  });
}
