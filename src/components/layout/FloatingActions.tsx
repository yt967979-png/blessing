'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare, Phone } from 'lucide-react';

export const FloatingActions = () => {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

  return (
    <div
      className="fixed bottom-24 md:bottom-6 right-4 md:right-6 z-40 flex flex-col gap-3"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <a
        href="https://wa.me/919840418228"
        target="_blank"
        rel="noreferrer"
        className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform"
        title="WhatsApp Support"
        aria-label="WhatsApp Support"
      >
        <MessageSquare className="w-6 h-6" />
      </a>
      <a
        href="tel:+919840418228"
        className="w-12 h-12 rounded-full bg-[#001B3A] text-amber-400 border border-amber-400/30 flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform"
        title="Call Helpdesk"
        aria-label="Call Helpdesk"
      >
        <Phone className="w-5 h-5" />
      </a>
    </div>
  );
};
