'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Award,
  BookOpen,
  ArrowRight,
  Book,
  FileCheck,
  FileText,
  Truck,
  Gift,
  Sparkles,
} from 'lucide-react';
import { useStore, Product } from '@/context/StoreContext';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { useCouponCatalogSync } from '@/hooks/useCouponCatalogSync';
import { StorefrontContextPayload } from '@/lib/cofounder/themeEngine';

function HeroShowcase({
  size = 'lg',
  book,
  showBook,
}: {
  size?: 'sm' | 'lg';
  book: Product | null;
  showBook: boolean;
}) {
  const canFlip = Boolean(book?.image);
  const box = size === 'lg' ? 'w-64 h-64 md:w-80 md:h-80' : 'w-28 h-28';
  const logoSize = size === 'lg' ? 280 : 120;
  const logoClass =
    size === 'lg'
      ? 'w-52 h-52 md:w-64 md:h-64 rounded-full shadow-2xl'
      : 'w-[6.5rem] h-[6.5rem] rounded-full shadow-lg';

  return (
    <div className={`hero-showcase ${box}`}>
      <div className={`hero-showcase-inner ${box} ${showBook && canFlip ? 'is-book' : ''}`}>
        <div className="hero-showcase-face hero-showcase-logo flex items-center justify-center rounded-full bg-slate-950 p-1 md:p-2 shadow-2xl border border-amber-400/30 overflow-hidden">
          <BrandLogo size={logoSize} priority className={logoClass} />
        </div>
        {book?.image ? (
          <Link
            href={`/products/${book.slug}`}
            className="hero-showcase-face hero-showcase-book rounded-full bg-slate-950 p-3 md:p-4 shadow-2xl border border-amber-400/40 relative overflow-hidden flex items-center justify-center group"
          >
            <Image
              src={book.image}
              alt={book.title || 'Guidebook cover'}
              fill
              className="object-contain p-2 group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 768px) 112px, 320px"
              priority
              unoptimized={imageNeedsUnoptimized(book.image)}
            />
            {size === 'lg' && (
              <span className="absolute bottom-2.5 inset-x-3 bg-slate-900/90 backdrop-blur-xs text-amber-300 text-[10.5px] font-black py-1 px-2.5 rounded-full text-center truncate shadow-lg border border-amber-400/40">
                {book.title}
              </span>
            )}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export const HeroSection = () => {
  const { setSelectedClass, setSelectedCategory, products } = useStore();
  const [heroTitle, setHeroTitle] = useState('');
  const [context, setContext] = useState<StorefrontContextPayload | null>(null);

  // Active storefront context (theme & announcements)
  useEffect(() => {
    let isMounted = true;
    const fetchContext = async () => {
      try {
        const res = await fetch('/api/cofounder/storefront-context', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok && isMounted) {
          const data: StorefrontContextPayload = await res.json();
          setContext(data);
        }
      } catch (_) {}
    };
    fetchContext();
    return () => {
      isMounted = false;
    };
  }, []);

  // Collect all available products that have a valid cover image
  const booksWithCovers = useMemo(() => {
    return products.filter((p) => Boolean(String(p.image || (p as any).cover_image || '').trim()));
  }, [products]);

  // Current active book displayed on the reverse flip face
  const [activeBook, setActiveBook] = useState<Product | null>(null);
  const [showBook, setShowBook] = useState(false);

  // Initialize active book as soon as catalog products load
  useEffect(() => {
    if (booksWithCovers.length > 0 && !activeBook) {
      const initial = booksWithCovers[Math.floor(Math.random() * booksWithCovers.length)];
      setActiveBook(initial);
    }
  }, [booksWithCovers, activeBook]);

  // Continuously rotate: Logo -> Book -> Logo -> Different Random Book -> repeat
  useEffect(() => {
    if (booksWithCovers.length === 0) {
      setShowBook(false);
      return;
    }

    let isMounted = true;
    let flipTimeout: NodeJS.Timeout;
    let switchTimeout: NodeJS.Timeout;

    const runFlipCycle = () => {
      setShowBook(true);

      flipTimeout = setTimeout(() => {
        if (!isMounted) return;
        setShowBook(false);

        switchTimeout = setTimeout(() => {
          if (!isMounted) return;
          setActiveBook((prev) => {
            if (booksWithCovers.length <= 1) return booksWithCovers[0] || null;
            const pool = booksWithCovers.filter((b) => b.id !== prev?.id);
            const next = pool[Math.floor(Math.random() * pool.length)] || booksWithCovers[0];
            return next;
          });

          flipTimeout = setTimeout(() => {
            if (!isMounted) return;
            runFlipCycle();
          }, 2000);
        }, 900);
      }, 3600);
    };

    const initialTimer = setTimeout(() => {
      runFlipCycle();
    }, 2000);

    return () => {
      isMounted = false;
      clearTimeout(initialTimer);
      clearTimeout(flipTimeout);
      clearTimeout(switchTimeout);
    };
  }, [booksWithCovers]);

  const loadHeroOffer = useCallback(async () => {
    try {
      const res = await fetch('/api/coupons/hero', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      setHeroTitle(String(data.offer?.title || '').trim());
    } catch {
      setHeroTitle('');
    }
  }, []);

  useEffect(() => {
    void loadHeroOffer();
  }, [loadHeroOffer]);

  useCouponCatalogSync(loadHeroOffer);

  const scrollToProducts = () => {
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  };

  const themeId = context?.theme?.id || 'default';
  const isFestive = themeId !== 'default';

  const features = [
    { icon: FileCheck, label: 'Exam Papers' },
    { icon: BookOpen, label: 'Class Notes' },
    { icon: FileText, label: 'Model Papers' },
  ];

  return (
    <section
      className={`relative ${
        isFestive
          ? 'bg-gradient-to-br from-[#020b18] via-[#09152b] to-[#1c1206]'
          : 'bg-gradient-to-br from-[#020B19] via-[#001E42] to-[#003478]'
      } text-white overflow-hidden py-8 md:py-16 transition-colors duration-700`}
    >
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-amber-400/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-blue-500/25 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 text-center lg:text-left">
            
            {/* Top Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-amber-400/40 text-amber-300 text-xs font-extrabold tracking-wide mb-4">
              <Award className="w-4 h-4 text-amber-400 shrink-0" />
              <span>TAMIL NADU STATE BOARD GUIDES</span>
            </div>

            {/* Display Headline */}
            <h1 className="font-heading font-black tracking-tight mb-4">
              <span className="block text-xs sm:text-lg text-slate-300 font-extrabold tracking-widest uppercase mb-1">
                Score high marks with
              </span>
              <span className="block text-2xl leading-tight sm:text-4xl md:text-5xl lg:text-6xl text-amber-400">
                BLESSING POWER GUIDE
              </span>
            </h1>

            {/* Description */}
            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto lg:mx-0 mb-5 font-medium leading-relaxed">
              Quality guides for 6th to 12th standard students. Pay online with Razorpay. Free delivery on 5-in-1 combo guides via ST Courier.
            </p>

            {/* Hero Offer Banner (Only when configured in DB) */}
            {heroTitle ? (
              <button
                type="button"
                onClick={scrollToProducts}
                className="hero-offer-ticket group relative mb-6 w-full max-w-xl mx-auto lg:mx-0 text-left overflow-hidden rounded-2xl touch-manipulation"
                aria-label={heroTitle}
              >
                <span className="pointer-events-none absolute -top-6 -right-4 h-20 w-20 rounded-full bg-amber-300/30 blur-2xl" />
                <span className="pointer-events-none absolute -bottom-8 -left-4 h-16 w-16 rounded-full bg-amber-500/20 blur-2xl" />
                <span className="hero-offer-shine pointer-events-none absolute inset-0" />
                <span className="relative flex items-start gap-3 p-3.5 sm:p-4">
                  <span className="relative shrink-0 mt-0.5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 text-[#001226] shadow-[0_8px_20px_rgba(245,158,11,0.45)]">
                    <Gift className="h-6 w-6" strokeWidth={2.25} />
                    <Sparkles className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 text-amber-200 animate-pulse" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 border border-amber-300/40 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                      Featured Offer
                    </span>
                    <span className="mt-1.5 block font-heading text-[17px] sm:text-xl font-black leading-snug text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">
                      {heroTitle}
                    </span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-amber-300 group-hover:text-amber-200">
                      Shop this offer
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </span>
              </button>
            ) : null}

            {/* Mobile Circle Flip Animation */}
            <div className="sm:hidden flex justify-center mb-5">
              <HeroShowcase size="sm" book={activeBook} showBook={showBook} />
            </div>

            {/* Feature Pills */}
            <div className="grid grid-cols-3 gap-2.5 mb-6 max-w-md mx-auto lg:mx-0">
              {features.map((feat) => (
                <div
                  key={feat.label}
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/10 border border-white/15"
                >
                  <feat.icon className="w-4 h-4 text-amber-300 mb-1" />
                  <span className="text-[11px] font-bold text-slate-200 text-center leading-tight">
                    {feat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Quick Class Shortcut Pills */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 mb-6">
              <span className="text-xs text-slate-300 font-bold mr-1">Quick Class:</span>
              {[
                { label: '10th Standard', cls: '10th', cat: 'guide' },
                { label: '11th Standard', cls: '11th', cat: 'guide' },
                { label: '12th Standard', cls: '12th', cat: 'guide' },
                { label: 'Combo Packs', cls: 'all', cat: 'combo' },
              ].map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  onClick={() => {
                    setSelectedClass(pill.cls);
                    setSelectedCategory(pill.cat);
                    scrollToProducts();
                  }}
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-amber-400 hover:text-[#001B3A] border border-white/20 text-xs font-bold text-slate-100 touch-manipulation cursor-pointer"
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {/* Primary Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
              <button
                type="button"
                onClick={scrollToProducts}
                className="inline-flex items-center justify-center gap-2 bg-amber-400 text-[#001226] font-black text-sm px-7 py-3.5 rounded-xl uppercase tracking-wider touch-manipulation min-h-12 cursor-pointer hover:bg-amber-300 active:scale-95 transition-all shadow-lg"
              >
                <span>Shop Guides</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('guide');
                  setSelectedClass('all');
                  scrollToProducts();
                }}
                className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/25 text-white font-extrabold text-sm px-7 py-3.5 rounded-xl uppercase tracking-wider touch-manipulation min-h-12 cursor-pointer hover:bg-white/20 active:scale-95 transition-all"
              >
                <Book className="w-4 h-4 text-amber-400" />
                <span>Browse All</span>
              </button>
            </div>
          </div>

          {/* Desktop/Tablet 3D Circle Flip Animation */}
          <div className="hidden sm:flex lg:col-span-5 relative justify-center items-center">
            <div className="absolute w-72 h-72 bg-amber-400/20 rounded-full blur-2xl pointer-events-none" />
            <HeroShowcase size="lg" book={activeBook} showBook={showBook} />
          </div>

        </div>
      </div>
    </section>
  );
};
