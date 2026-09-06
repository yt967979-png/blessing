'use client';

import { useEffect, useRef } from 'react';

/** Refetch coupons when admin creates/updates one (SSE) or on a short poll fallback. */
export function useCouponCatalogSync(reload: () => void) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    const run = () => reloadRef.current();
    window.addEventListener('bpg:coupons-changed', run);
    const poll = window.setInterval(run, 20_000);
    return () => {
      window.removeEventListener('bpg:coupons-changed', run);
      window.clearInterval(poll);
    };
  }, []);
}
