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
    <div className="hidden md:flex fixed bottom-6 right-6 z-40 flex-col gap-3">
      <a
        href={shopWhatsAppChatUrl('Hello Blessing Power Guide Support')}
        target="_blank"
        rel="noreferrer"
        className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-xl hover:scale-105 transition-transform"
        title="Message shop on WhatsApp"
        aria-label="Message shop on WhatsApp"
      >
        <MessageCircle className="w-6 h-6" />
      </a>
    </div>
  );
};
