'use client';

import { useEffect, useRef } from 'react';

/** Refetch coupons when admin creates/updates/toggles/deletes one (SSE, BroadcastChannel, window focus, and rapid poll). */
export function useCouponCatalogSync(reload: () => void) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    const run = () => reloadRef.current();

    window.addEventListener('bpg:coupons-changed', run);
    window.addEventListener('focus', run);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        run();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('bpg_coupons_bus');
        bc.onmessage = () => run();
      }
    } catch (_) {}

    // Fallback 30-second poll guarantee for background synchronization (instant updates handled by SSE & BroadcastChannel)
    const poll = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      run();
    }, 30000);

    return () => {
      window.removeEventListener('bpg:coupons-changed', run);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(poll);
      try {
        bc?.close();
      } catch (_) {}
    };
  }, []);
}
