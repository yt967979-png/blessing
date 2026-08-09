'use client';

import { useEffect, useRef } from 'react';

type OrderStreamEvent = {
  type?: string;
  orderId?: string;
  status?: string;
  userId?: string | null;
  timestamp?: number;
};

/**
 * Subscribe to /api/orders/stream (cookie session).
 * Admins receive all events; customers only their own (server-filtered).
 */
export function useOrderLiveSync(
  enabled: boolean,
  onEvent: (event: OrderStreamEvent) => void
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || typeof EventSource === 'undefined') return;

    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      es = new EventSource('/api/orders/stream');
      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data) as OrderStreamEvent;
          if (data?.type === 'ORDER_CREATED' || data?.type === 'ORDER_UPDATED') {
            onEventRef.current(data);
          }
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        if (es && es.readyState === EventSource.CLOSED && !stopped) {
          es.close();
          retryTimer = setTimeout(connect, 5000);
        }
      };
    };

    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (es) es.close();
    };
  }, [enabled]);
}
