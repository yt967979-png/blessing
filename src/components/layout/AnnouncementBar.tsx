'use client';

import React from 'react';
import { CheckCircle, Award, Truck, HelpCircle, MapPin, User, UserCheck } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const AnnouncementBar = () => {
  const { user, setIsTrackOpen, setIsAuthOpen, setIsProfileOpen } = useStore();

  return (
    <div className="bg-[#001226] text-slate-300 text-xs py-2 border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 flex justify-between items-center">
        <div className="hidden md:flex items-center gap-6 font-medium">
          <span className="flex items-center gap-1.5 hover:text-amber-400 transition-colors">
            <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
            Trusted by 10,000+ Students
          </span>
          <span className="flex items-center gap-1.5 hover:text-amber-400 transition-colors">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            Quality Guides for Better Results
          </span>
          <span className="flex items-center gap-1.5 hover:text-amber-400 transition-colors">
            <Truck className="w-3.5 h-3.5 text-amber-400" />
            Fast Delivery Across India
          </span>
        </div>
        <div className="flex items-center gap-4 ml-auto font-medium">
          <button className="flex items-center gap-1 hover:text-amber-400 transition-colors">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Help</span>
          </button>
          <span className="text-slate-700">|</span>
          <button
            onClick={() => setIsTrackOpen(true)}
            className="flex items-center gap-1 hover:text-amber-400 transition-colors"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Track Order</span>
          </button>
          <span className="text-slate-700">|</span>
          {user ? (
            <button
              onClick={() => setIsProfileOpen(true)}
              className="flex items-center gap-1.5 text-amber-400 font-semibold hover:underline"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{user.name}</span>
            </button>
          ) : (
            <button
              onClick={() => setIsAuthOpen(true)}
              className="flex items-center gap-1 hover:text-amber-400 transition-colors"
            >
              <User className="w-3.5 h-3.5" />
              <span>Login / Register</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
