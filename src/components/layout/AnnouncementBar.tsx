'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  HelpCircle,
  MapPin,
  User,
  UserCheck,
  AlertTriangle,
  Sparkles,
  X,
  Wrench,
  ShieldAlert,
  ArrowRight,
  Gift,
  Truck,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { StorefrontContextPayload, StorefrontAnnouncement } from '@/lib/cofounder/themeEngine';

export const ANNOUNCEMENT_BAR_VERSION = 'bpg-bar-v20261026-zomato-pro';

export const AnnouncementBar: React.FC = () => {
  const { user, setIsAuthOpen, setSelectedClass } = useStore();
  const [mounted, setMounted] = useState(false);
  const [context, setContext] = useState<StorefrontContextPayload | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);

    try {
      const stored = localStorage.getItem('bpg_dismissed_announcement_id');
      if (stored) setDismissedId(stored);
    } catch (_) {}

    const fetchContext = async () => {
      try {
        const res = await fetch('/api/cofounder/storefront-context', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok) {
          const data: StorefrontContextPayload = await res.json();
          setContext(data);
        }
      } catch (_) {}
    };

    fetchContext();

    const interval = setInterval(fetchContext, 30000);
    const handleVis = () => {
      if (document.visibilityState === 'visible') fetchContext();
    };
    document.addEventListener('visibilitychange', handleVis);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, []);

  const handleDismiss = (id: string) => {
    setDismissedId(id);
    try {
      localStorage.setItem('bpg_dismissed_announcement_id', id);
    } catch (_) {}
  };

  const scrollToCombos = () => {
    setSelectedClass('Class 10');
    const el = document.getElementById('products');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const announcement: StorefrontAnnouncement | null = context?.announcement || null;
  const isDismissed = announcement && dismissedId === announcement.id && announcement.severity !== 'CRITICAL';
  const showAnnouncement = announcement && !isDismissed;

  const theme = context?.theme;
  const isFestive = theme && theme.id !== 'default';

  return (
    <header className="w-full relative z-50">
      {/* ── 1. HIGH-PRIORITY STORE NOTICE BANNER (ZOMATO OUTAGE / EMERGENCY STYLE) ── */}
      {showAnnouncement && (
        <div
          role="alert"
          aria-live="assertive"
          className={`w-full py-2 px-3 sm:px-4 text-xs font-sans transition-all duration-300 shadow-md ${
            announcement.severity === 'CRITICAL'
              ? 'bg-gradient-to-r from-[#2c0908] via-[#480f0e] to-[#1f0505] border-b border-red-600/70 text-red-100 shadow-[0_4px_25px_rgba(239,68,68,0.25)]'
              : announcement.severity === 'WARNING'
              ? 'bg-gradient-to-r from-[#2c1906] via-[#462407] to-[#1c0f03] border-b border-amber-500/50 text-amber-100 shadow-[0_4px_20px_rgba(245,158,11,0.2)]'
              : 'bg-gradient-to-r from-[#0a1829] via-[#0f243d] to-[#081220] border-b border-sky-600/50 text-sky-100'
          }`}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Pulsing Live Beacon Indicator */}
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    announcement.severity === 'CRITICAL'
                      ? 'bg-red-400'
                      : announcement.severity === 'WARNING'
                      ? 'bg-amber-400'
                      : 'bg-sky-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    announcement.severity === 'CRITICAL'
                      ? 'bg-red-500'
                      : announcement.severity === 'WARNING'
                      ? 'bg-amber-500'
                      : 'bg-sky-500'
                  }`}
                />
              </span>

              {/* Severity Pill Badge */}
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider shrink-0 ${
                  announcement.type === 'MAINTENANCE' || announcement.severity === 'CRITICAL'
                    ? 'bg-red-500/25 text-red-300 border border-red-500/40'
                    : announcement.type === 'PROMOTION'
                    ? 'bg-amber-500/25 text-amber-200 border border-amber-500/40'
                    : announcement.severity === 'WARNING'
                    ? 'bg-amber-500/25 text-amber-200 border border-amber-500/40'
                    : 'bg-sky-500/25 text-sky-200 border border-sky-500/40'
                }`}
              >
                {announcement.type === 'MAINTENANCE'
                  ? 'MAINTENANCE'
                  : announcement.severity === 'CRITICAL'
                  ? 'CRITICAL ALERT'
                  : announcement.type === 'PROMOTION'
                  ? 'SPECIAL OFFER'
                  : announcement.severity === 'WARNING'
                  ? 'STORE UPDATE'
                  : 'NOTICE'}
              </span>

              {/* Message Content */}
              <p className="font-semibold text-xs truncate sm:whitespace-normal">
                {announcement.content}
                {announcement.expectedEnd && (
                  <span className="ml-1.5 opacity-90 text-[11px] font-bold underline decoration-dotted">
                    ({announcement.expectedEnd})
                  </span>
                )}
              </p>
            </div>

            {/* Dismiss CTA */}
            {announcement.dismissible && announcement.severity !== 'CRITICAL' && (
              <button
                onClick={() => handleDismiss(announcement.id)}
                className="p-1 rounded-full hover:bg-white/10 text-slate-300 hover:text-white transition-colors shrink-0"
                aria-label="Dismiss notice"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 2. ZOMATO-STYLE FESTIVE CELEBRATION BANNER (When Theme is Active) ── */}
      {!showAnnouncement && isFestive && (
        <div className="w-full bg-gradient-to-r from-[#1c0c03] via-[#3a1906] to-[#1a0a02] border-b border-amber-400/40 text-amber-100 py-2 px-3 sm:px-4 shadow-[0_4px_25px_rgba(245,158,11,0.2)]">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            {/* Left: Glowing Diya & Message */}
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="text-base sm:text-lg shrink-0 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse">
                {theme.id === 'deepavali' ? '🪔' : theme.id === 'pongal' ? '🌾' : '✨'}
              </span>

              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest bg-amber-400/20 text-amber-300 border border-amber-400/50 shrink-0 shadow-xs">
                {theme.badgeText || (theme.id === 'deepavali' ? 'DEEPAVALI UTSAV' : 'FESTIVAL SPECIAL')}
              </span>

              <span className="text-xs sm:text-[13px] font-bold text-amber-100 truncate tracking-wide">
                {theme.greeting}
              </span>
            </div>

            {/* Right: Quick CTA & Dismiss */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={scrollToCombos}
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 text-slate-950 hover:brightness-110 shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <span>Shop Combos</span>
                <ArrowRight className="w-3 h-3 stroke-[2.5]" />
              </button>

              <button
                onClick={() => handleDismiss('theme_greeting')}
                className="p-1 rounded-full hover:bg-white/10 text-amber-300/80 hover:text-white transition-colors"
                aria-label="Dismiss banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 3. LUXURY EDITORIAL DESKTOP UTILITY ROW (Help | Track Order | Login) ── */}
      <div className="hidden sm:block bg-[#001226] text-slate-300 text-xs py-1.5 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 flex justify-between items-center gap-2">
          {/* Slogan with micro-pulse icon */}
          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-medium">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Tamil Nadu 10th SSLC 5-in-1 Combo Guides • ST Courier Free Doorstep Delivery</span>
          </div>

          {/* Quick utility links */}
          <div className="flex items-center gap-4 font-semibold flex-shrink-0 text-[11px]">
            <Link
              href="/help"
              className="flex items-center gap-1 text-slate-300 hover:text-amber-400 transition-colors"
            >
              <HelpCircle className="w-3 h-3 text-amber-400" />
              <span>Help Desk</span>
            </Link>
            <span className="text-slate-700">|</span>
            <Link
              href="/track"
              className="flex items-center gap-1 text-slate-300 hover:text-amber-400 transition-colors"
            >
              <MapPin className="w-3 h-3 text-amber-400" />
              <span>Track Order</span>
            </Link>
            <span className="text-slate-700">|</span>
            {mounted && user ? (
              <Link
                href="/profile"
                className="flex items-center gap-1 text-amber-400 font-bold hover:underline"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span className="truncate max-w-[90px]">{user.name.split(' ')[0]}</span>
              </Link>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="flex items-center gap-1 text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
              >
                <User className="w-3 h-3 text-amber-400" />
                <span>Login</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
