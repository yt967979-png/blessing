'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const PREFIX = 'bpg_scroll:';

/** Persist scroll per route in sessionStorage (home ↔ PDP / search feel Flipkart-like). */
export function ScrollRestore() {
  const pathname = usePathname();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const key = `${PREFIX}${pathname}`;
    let restored = false;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw != null) {
        const y = Number(raw);
        if (Number.isFinite(y) && y > 0) {
          restored = true;
          requestAnimationFrame(() => {
            window.scrollTo(0, y);
          });
        }
      }
    } catch {
      /* ignore */
    }

    if (!restored && pathname.startsWith('/products/')) {
      window.scrollTo(0, 0);
    }

    const persist = () => {
      try {
        sessionStorage.setItem(key, String(Math.round(window.scrollY)));
      } catch {
        /* ignore */
      }
    };

    const onScroll = () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(persist, 120);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      persist();
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname]);

  return null;
}
