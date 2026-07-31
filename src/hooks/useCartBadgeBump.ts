'use client';

import { useEffect, useRef, useState } from 'react';

/** True briefly when cartCount increases — drives badge micro-animation. */
export function useCartBadgeBump(cartCount: number) {
  const [bump, setBump] = useState(false);
  const prev = useRef(cartCount);

  useEffect(() => {
    if (cartCount > prev.current) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 380);
      prev.current = cartCount;
      return () => clearTimeout(t);
    }
    prev.current = cartCount;
  }, [cartCount]);

  return bump;
}
