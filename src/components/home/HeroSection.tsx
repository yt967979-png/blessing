'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  FileCheck,
  BookOpen,
  FileText,
  ArrowRight,
  Award,
  Book,
  Gift,
  Sparkles,
} from 'lucide-react';
import { useStore, Product } from '@/context/StoreContext';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { useCouponCatalogSync } from '@/hooks/useCouponCatalogSync';

function pickHeroBook(products: Product[]): Product | null {
  const withCover = products.filter((p) => String(p.image || '').trim());
  return (
    withCover.find((p) => p.isBestSeller) ||
    withCover.find((p) => p.isTrending) ||
    withCover.find((p) => p.inStock !== false) ||
    withCover[0] ||
    null
  );
}

function HeroShowcase({
  size,
  book,
  showBook,
}: {
  size: 'sm' | 'lg';
  book: Product | null;
  showBook: boolean;
}) {
  const canFlip = Boolean(book?.image);

  const box =
    size === 'lg'
      ? 'h-[13.5rem] w-[13.5rem] md:h-72 md:w-72'
      : 'h-[7.5rem] w-[7.5rem]';
  const logoSize = size === 'lg' ? 280 : 120;
  const logoClass =
    size === 'lg'
      ? 'w-52 h-52 md:w-64 md:h-64 rounded-[22%]'
      : 'w-[6.5rem] h-[6.5rem] rounded-3xl';

  return (
    <div className={`hero-showcase ${box}`}>
      <div className={`hero-showcase-inner ${box} ${showBook && canFlip ? 'is-book' : ''}`}>
        <div className="hero-showcase-face hero-showcase-logo flex items-center justify-center rounded-[28%] bg-white p-3 md:p-5 shadow-xl border border-white/30">
          <BrandLogo size={logoSize} priority className={logoClass} />
        </div>
        {book?.image ? (
          <Link
            href={`/products/${book.slug}`}
            className="hero-showcase-face hero-showcase-book flex items-center justify-center rounded-[28%] bg-white p-3 md:p-4 shadow-xl border border-white/30 overflow-hidden"
            aria-label={book.title}
          >
            <Image
              src={book.image}
              alt={`${book.title} guide book`}
              width={size === 'lg' ? 280 : 120}
              height={size === 'lg' ? 280 : 120}
              priority={size === 'lg'}
              className="h-full w-full object-contain"
              unoptimized={imageNeedsUnoptimized(book.image)}
            />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export const HeroSection = () => {
  const { setSelectedClass, setSelectedCategory, products } = useStore();
  const [heroTitle, setHeroTitle] = useState('');
  const heroBook = useMemo(() => pickHeroBook(products), [products]);
  const [showBook, setShowBook] = useState(false);

  useEffect(() => {
    if (!heroBook?.image) {
      setShowBook(false);
      return;
    }
    const start = window.setTimeout(() => setShowBook(true), 2400);
    const id = window.setInterval(() => setShowBook((v) => !v), 5200);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [heroBook?.id, heroBook?.image]);

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

  const features = [
    { icon: FileCheck, label: 'Exam Papers' },
    { icon: BookOpen, label: 'Class Notes' },
    { icon: FileText, label: 'Model Papers' },
  ];

  return (
    <section className="relative bg-gradient-to-br from-[#020B19] via-[#001E42] to-[#003478] text-white overflow-hidden py-8 md:py-16">
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-amber-400/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-blue-500/25 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          <div className="lg:col-span-7 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-amber-400/40 text-amber-300 text-xs font-extrabold tracking-wide mb-4">
              <Award className="w-4 h-4 text-amber-400 shrink-0" />
              <span>TAMIL NADU STATE BOARD GUIDES</span>
            </div>

            <h1 className="font-heading font-black tracking-tight mb-4">
              <span className="block text-xs sm:text-lg text-slate-300 font-extrabold tracking-widest uppercase mb-1">
                Score high marks with
              </span>
              <span className="block text-2xl leading-tight sm:text-4xl md:text-5xl lg:text-6xl text-amber-400">
                BLESSING POWER GUIDE
              </span>
            </h1>

            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto lg:mx-0 mb-5 font-medium leading-relaxed">
              Quality guides for 6th to 12th standard students. Pay online with Razorpay. Delivery via ST Courier.
            </p>

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
                      Limited offer
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

            <div className="sm:hidden flex justify-center mb-5">
              <HeroShowcase size="sm" book={heroBook} showBook={showBook} />
            </div>

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
                  className="px-3 py-1 rounded-lg bg-white/10 hover:bg-amber-400 hover:text-[#001B3A] border border-white/20 text-xs font-bold text-slate-100 touch-manipulation"
                >
                  {pill.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
              <button
                type="button"
                onClick={scrollToProducts}
                className="inline-flex items-center justify-center gap-2 bg-amber-400 text-[#001226] font-black text-sm px-7 py-3.5 rounded-xl uppercase tracking-wider touch-manipulation min-h-12"
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
                className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/25 text-white font-extrabold text-sm px-7 py-3.5 rounded-xl uppercase tracking-wider touch-manipulation min-h-12"
              >
                <Book className="w-4 h-4 text-amber-400" />
                <span>Browse All</span>
              </button>
            </div>
          </div>

          <div className="hidden sm:flex lg:col-span-5 relative justify-center items-center">
            <div className="absolute w-72 h-72 bg-amber-400/20 rounded-full blur-2xl pointer-events-none" />
            <HeroShowcase size="lg" book={heroBook} showBook={showBook} />
          </div>
        </div>
      </div>
    </section>
  );
};
