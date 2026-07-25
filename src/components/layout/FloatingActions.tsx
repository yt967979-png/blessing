'use client';

import React from 'react';
import { MessageSquare, Phone } from 'lucide-react';

export const FloatingActions = () => {
  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-3">
      <a
        href="https://wa.me/919840418228"
        target="_blank"
        rel="noreferrer"
        className="w-12 h-12 rounded-full bg-[#25D366] text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        title="WhatsApp Us"
      >
        <MessageSquare className="w-6 h-6" />
      </a>
      <a
        href="tel:+919840418228"
        className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        title="Call Us"
      >
        <Phone className="w-6 h-6" />
      </a>
    </div>
  );
};
