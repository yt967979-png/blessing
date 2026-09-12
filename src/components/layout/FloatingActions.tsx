'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { shopWhatsAppChatUrl } from '@/lib/shopContact';

/** Desktop floating message icon → opens shop WhatsApp chat (wa.me only). */
export const FloatingActions = () => {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

  return (
    <div
      className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-3.5 md:bottom-6 md:right-6 z-40 flex flex-col items-end gap-2 pointer-events-auto select-none"
    >
      <a
        href={shopWhatsAppChatUrl('Hello Blessing Power Guide Support, I need help with ordering books')}
        target="_blank"
        rel="noreferrer"
        className="group relative flex items-center gap-2 px-3 py-2.5 md:p-3.5 rounded-full bg-[#25D366] text-white shadow-[0_6px_20px_rgba(37,211,102,0.4)] hover:bg-[#20bd5a] hover:scale-105 active:scale-95 transition-all duration-200"
        title="Chat with us on WhatsApp"
        aria-label="Chat with us on WhatsApp"
      >
        <span className="relative flex items-center justify-center">
          <MessageCircle className="w-5 h-5 md:w-6 md:h-6 fill-current stroke-none" />
          {/* Active online pulse dot */}
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-200 border border-[#25D366]"></span>
          </span>
        </span>
        <span className="hidden sm:inline-block text-xs font-black tracking-wide pr-1">
          WhatsApp Help
        </span>
      </a>
    </div>
  );
};
