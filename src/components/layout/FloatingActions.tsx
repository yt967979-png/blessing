'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare } from 'lucide-react';

/** Desktop-only floating WhatsApp — mobile uses bottom nav + Help link */
export const FloatingActions = () => {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

  return (
    <div className="hidden md:flex fixed bottom-6 right-6 z-40 flex-col gap-3">
      <a
        href="https://wa.me/919840418228"
        target="_blank"
        rel="noreferrer"
        className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
        title="WhatsApp Support"
        aria-label="WhatsApp Support"
      >
        <MessageSquare className="w-6 h-6" />
      </a>
    </div>
  );
};
