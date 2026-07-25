'use client';

import React from 'react';
import Link from 'next/link';
import { HelpCircle, MapPin, User, UserCheck } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const AnnouncementBar = () => {
  const { user, setIsTrackOpen, setIsAuthOpen } = useStore();

  return (
    <div className="bg-[#001226] text-slate-300 text-xs py-2 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 flex justify-end items-center">
        <div className="flex items-center gap-4 font-medium">
          <a
            href="https://wa.me/919840418228?text=Hello%20Blessing%20Power%20Guide%20Support"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-amber-400 transition-colors cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Help</span>
          </a>
          <span className="text-slate-700">|</span>
          <button
            onClick={() => setIsTrackOpen(true)}
            className="flex items-center gap-1 hover:text-amber-400 transition-colors cursor-pointer"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
            <span>Track Order</span>
          </button>
          <span className="text-slate-700">|</span>
          {user ? (
            <Link
              href="/profile"
              className="flex items-center gap-1.5 text-amber-400 font-semibold hover:underline"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{user.name}</span>
            </Link>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-1 hover:text-amber-400 transition-colors cursor-pointer"
            >
              <User className="w-3.5 h-3.5 text-amber-400" />
              <span>Login / Register</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
