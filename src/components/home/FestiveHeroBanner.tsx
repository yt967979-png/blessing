'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Gift, Truck, ArrowRight, BookOpen, X, CheckCircle2 } from 'lucide-react';
import { StorefrontContextPayload } from '@/lib/cofounder/themeEngine';
import { useStore } from '@/context/StoreContext';

export const FestiveHeroBanner: React.FC = () => {
  const [context, setContext] = useState<StorefrontContextPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { setSelectedClass } = useStore();

  useEffect(() => {
    // Check if dismissed for current session
    try {
      const isDismissed = sessionStorage.getItem('bpg_dismissed_festive_hero');
      if (isDismissed) setDismissed(true);
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
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('bpg_dismissed_festive_hero', '1');
    } catch (_) {}
  };

  const scrollToCombos = (medium?: string) => {
    setSelectedClass('Class 10');
    const el = document.getElementById('products');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const theme = context?.theme;
  if (!theme || theme.id === 'default' || dismissed) {
    return null;
  }

  const isDeepavali = theme.id === 'deepavali';
  const isPongal = theme.id === 'pongal';
  const isNewYear = theme.id === 'new_year';

  return (
    <section className="relative w-full max-w-7xl mx-auto px-4 pt-4 pb-2 z-20">
      <div className="relative overflow-hidden rounded-3xl border border-amber-400/40 bg-gradient-to-br from-[#1a0d04] via-[#2d1506] to-[#120803] p-5 sm:p-7 md:p-8 shadow-[0_12px_40px_rgba(245,158,11,0.2)]">
        {/* Decorative Festive Background Glows */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-yellow-500/15 blur-3xl" />

        {/* Ambient Diya / Festival Watermark Motifs */}
        <div className="pointer-events-none absolute top-4 right-14 text-4xl sm:text-5xl opacity-20 select-none animate-pulse">
          {isDeepavali ? '🪔' : isPongal ? '🌾' : '✨'}
        </div>
        <div className="pointer-events-none absolute bottom-4 right-32 text-3xl sm:text-4xl opacity-15 select-none hidden sm:block">
          {isDeepavali ? '✨' : isPongal ? '☀️' : '⭐'}
        </div>

        {/* Dismiss Button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3.5 right-3.5 p-1.5 rounded-full bg-white/10 text-slate-300 hover:text-white hover:bg-white/20 transition-all z-20"
          title="Dismiss festive banner"
          aria-label="Dismiss banner"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          {/* Left Column: Festival Branding & Headline */}
          <div className="max-w-2xl">
            {/* Festival Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-widest mb-3 shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin" style={{ animationDuration: '6s' }} />
              <span>{theme.badgeText || (isDeepavali ? '🪔 DEEPAVALI MAHA UTSAV' : 'FESTIVAL SPECIAL')}</span>
              <span className="h-1 w-1 rounded-full bg-amber-400" />
              <span className="text-[10px] text-amber-200/90 font-bold">LIMITED TIME EDITION</span>
            </div>

            {/* Headline */}
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl tracking-tight text-white mb-2 leading-tight">
              {isDeepavali ? (
                <>
                  Light Up Your Board Exam Score with{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400">
                    5-in-1 Combo Guides 🪔
                  </span>
                </>
              ) : isPongal ? (
                <>
                  Celebrate Harvest of Marks with{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400">
                    Blessing Study Guides 🌾
                  </span>
                </>
              ) : (
                <>
                  New Year Academic Pass for{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-300 via-teal-100 to-emerald-400">
                    Class 10 State Board ✨
                  </span>
                </>
              )}
            </h2>

            {/* Subtext */}
            <p className="text-amber-100/90 text-sm sm:text-base font-normal leading-relaxed mb-4">
              Master Tamil, English, Maths, Science & Social Science with Tamil Nadu’s highest-rated SSLC guides. Specially formatted for Centum scorers.
            </p>

            {/* 3 Value Pillars */}
            <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-medium text-amber-200">
              <div className="flex items-center gap-1.5 bg-black/30 border border-amber-400/20 px-2.5 py-1 rounded-lg">
                <Truck className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>100% Free Doorstep Delivery via ST Courier</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/30 border border-amber-400/20 px-2.5 py-1 rounded-lg">
                <Gift className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>Free Exam Formula Gift Book Included</span>
              </div>
              <div className="flex items-center gap-1.5 bg-black/30 border border-amber-400/20 px-2.5 py-1 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span>Tamil & English Medium Available</span>
              </div>
            </div>
          </div>

          {/* Right Column: 1-Click Fast Action Cards (Zomato Style) */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 w-full lg:w-auto shrink-0">
            {/* Tamil Medium Quick Card */}
            <button
              onClick={() => scrollToCombos('Tamil')}
              className="group relative flex items-center justify-between gap-4 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-transparent border border-amber-400/40 hover:border-amber-400 hover:bg-amber-500/25 transition-all text-left shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-md">
                  <BookOpen className="w-5 h-5 font-bold" />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                    CLASS 10 5-IN-1 BOX SET
                  </div>
                  <div className="text-sm font-bold text-white group-hover:text-amber-200 transition-colors">
                    Tamil Medium Combo (₹1,300)
                  </div>
                </div>
              </div>
              <div className="h-8 w-8 rounded-full bg-amber-400/20 group-hover:bg-amber-400 group-hover:text-slate-950 flex items-center justify-center text-amber-300 transition-all shrink-0">
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>

            {/* English Medium Quick Card */}
            <button
              onClick={() => scrollToCombos('English')}
              className="group relative flex items-center justify-between gap-4 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-amber-400/10 to-transparent border border-amber-400/40 hover:border-amber-400 hover:bg-amber-500/25 transition-all text-left shadow-lg"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-400 to-amber-600 flex items-center justify-center text-slate-950 shadow-md">
                  <BookOpen className="w-5 h-5 font-bold" />
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                    CLASS 10 5-IN-1 BOX SET
                  </div>
                  <div className="text-sm font-bold text-white group-hover:text-amber-200 transition-colors">
                    English Medium Combo (₹1,300)
                  </div>
                </div>
              </div>
              <div className="h-8 w-8 rounded-full bg-amber-400/20 group-hover:bg-amber-400 group-hover:text-slate-950 flex items-center justify-center text-amber-300 transition-all shrink-0">
                <ArrowRight className="w-4 h-4" />
              </div>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
