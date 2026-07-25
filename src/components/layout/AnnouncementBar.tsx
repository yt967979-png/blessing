'use client';

import React from 'react';
import Link from 'next/link';
import { HelpCircle, MapPin, User, UserCheck } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const AnnouncementBar = () => {
  const { user, setIsTrackOpen, setIsAuthOpen } = useStore();

  return (
    <div className="bg-[#001226] text-slate-300 text-[10px] sm:text-xs py-1.5 sm:py-2 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 flex justify-between sm:justify-end items-center gap-2">
        <span className="text-amber-300 font-bold sm:hidden truncate text-[10px]">
          📚 Tamil Nadu State Board Guides
        </span>
        <div className="flex items-center gap-2.5 sm:gap-4 font-medium flex-shrink-0">
          <a
            href="https://wa.me/919840418228?text=Hello%20Blessing%20Power%20Guide%20Support"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-amber-400 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3 h-3 text-amber-400" />
            <span>Help</span>
          </a>
          <span className="text-slate-700">|</span>
          <button
            onClick={() => setIsTrackOpen(true)}
            className="flex items-center gap-1 hover:text-amber-400 transition-colors cursor-pointer"
          >
            <MapPin className="w-3 h-3 text-amber-400" />
            <span>Track Order</span>
          </button>
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
