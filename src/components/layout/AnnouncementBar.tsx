'use client';

import React from 'react';
import Link from 'next/link';
import { HelpCircle, MapPin, User, UserCheck } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { shopWhatsAppChatUrl } from '@/lib/shopContact';

export const AnnouncementBar = () => {
  const { user, setIsAuthOpen } = useStore();

  // Hidden on phones — bottom nav + header cover Help / Track / Login
  return (
    <div className="hidden sm:block bg-[#001226] text-slate-300 text-xs py-2 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 flex justify-end items-center gap-2">
        <div className="flex items-center gap-4 font-medium flex-shrink-0">
          <a
            href={shopWhatsAppChatUrl('Hello Blessing Power Guide Support')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-amber-400 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3 h-3 text-amber-400" />
            <span>Help</span>
          </a>
          <span className="text-slate-700">|</span>
          <Link
            href="/track"
            className="flex items-center gap-1 hover:text-amber-400 transition-colors"
          >
            <MapPin className="w-3 h-3 text-amber-400" />
            <span>Track Order</span>
          </Link>
          <span className="text-slate-700">|</span>
          {user ? (
            <Link
              href="/profile"
              className="flex items-center gap-1 text-amber-400 font-semibold hover:underline"
            >
              <UserCheck className="w-3 h-3" />
              <span className="truncate max-w-[80px] sm:max-w-none">{user.name.split(' ')[0]}</span>
            </Link>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-1 hover:text-amber-400 transition-colors cursor-pointer"
            >
              <User className="w-3 h-3 text-amber-400" />
              <span>Login</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
