'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Phone } from 'lucide-react';

/** Desktop-only floating phone support — mobile uses bottom nav + Help link */
export const FloatingActions = () => {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

  return (
    <div className="hidden md:flex fixed bottom-6 right-6 z-40 flex-col gap-3">
      <a
        href="tel:+919840418228"
        className="w-12 h-12 rounded-full bg-[#0044AA] text-white flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
        title="Call Support"
        aria-label="Call Support"
      >
        <Phone className="w-6 h-6" />
      </a>
    </div>
  );
};
