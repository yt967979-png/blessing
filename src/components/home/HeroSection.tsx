'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import {
  FileCheck,
  BookOpen,
  FileText,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Award,
  Book,
  Tag,
  Copy,
  Clock,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const HeroSection = () => {
  const {
    products,
    setSelectedClass,
    setSelectedCategory,
    publicCoupons,
    setPendingCouponCode,
    showToast,
  } = useStore();
  const [activeSlide, setActiveSlide] = useState(0);

  const heroProducts = products.filter((p) => p.inStock).slice(0, 3);

  const slides =
    heroProducts.length > 0
      ? heroProducts.map((p) => ({
          tag: `${p.cls} STANDARD${p.badge ? ` • ${p.badge}` : ''}`,
          titleLine1: 'SCORE HIGH MARKS WITH',
          titleLine2: p.title.toUpperCase(),
          subtitle: p.description,
          badge: p.badge || 'EXAM ORIENTED',
          image: p.image,
          price: p.price,
          mrp: p.mrp,
          discount: p.discount,
        }))
      : [
          {
            tag: 'TAMIL NADU STATE BOARD | CBSE | MATRICULATION',
            titleLine1: 'SCORE HIGH MARKS WITH',
            titleLine2: 'BLESSING POWER GUIDE',
            subtitle:
              'Quality guides for better preparation and brighter results for 6th to 12th standard students.',
            badge: '100% EXAM ORIENTED',
            image:
              'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
            price: 190,
            mrp: 240,
            discount: 20,
          },
        ];

  const nextSlide = useCallback(
    () => setActiveSlide((prev) => (prev + 1) % slides.length),
    [slides.length]
  );
  const prevSlide = useCallback(
    () => setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length),
    [slides.length]
  );

  // Auto-advance on mobile without Framer (lighter)
  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setInterval(nextSlide, 6000);
    return () => window.clearInterval(id);
  }, [slides.length, nextSlide]);

  const currentSlide = slides[activeSlide] || slides[0];

  const scrollToProducts = () => {
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  };

  const copyCoupon = (code: string) => {
    setPendingCouponCode(code);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(code);
    }
    showToast(`Coupon ${code} copied — apply at checkout!`);
  };

  const fmtExpiry = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const features = [
    { icon: FileCheck, label: 'Exam Papers' },
    { icon: BookOpen, label: 'Class Notes' },
    { icon: FileText, label: 'Model Papers' },
  ];

  return (
    <section className="relative bg-gradient-to-br from-[#020B19] via-[#001E42] to-[#003478] text-white overflow-hidden py-6 md:py-14">
      {/* Ambient glow — desktop only (blur is costly on phones) */}
      <div className="mobile-hide-fx md:block absolute -top-32 -right-32 w-96 h-96 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />
      <div className="mobile-hide-fx md:block absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-center">
          <div className="lg:col-span-7 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-amber-400/40 text-amber-300 text-[11px] font-extrabold tracking-wide mb-4">
              <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate max-w-[280px] sm:max-w-none">{currentSlide.tag}</span>
            </div>

            <h1 className="font-heading font-black tracking-tight mb-3">
              <span className="block text-sm sm:text-xl text-slate-300 font-extrabold tracking-wider uppercase mb-1">
                {currentSlide.titleLine1}
              </span>
              <span className="block text-[1.65rem] leading-tight sm:text-4xl md:text-5xl bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent font-black">
                BLESSING POWER GUIDE
              </span>
              {heroProducts.length > 0 && (
                <span className="mt-2 block text-base sm:text-2xl text-white/90 font-bold line-clamp-2">
                  {currentSlide.titleLine2}
                </span>
              )}
            </h1>

            <p className="text-slate-300 text-sm max-w-xl mx-auto lg:mx-0 mb-5 font-medium leading-relaxed line-clamp-2 sm:line-clamp-3">
              {currentSlide.subtitle}
            </p>

            {/* Compact feature row — 3 items only */}
            <div className="grid grid-cols-3 gap-2 mb-5 max-w-md mx-auto lg:mx-0">
              {features.map((feat) => (
                <div
                  key={feat.label}
                  className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white/10 border border-white/10"
                >
                  <feat.icon className="w-4 h-4 text-amber-300 mb-1" />
                  <span className="text-[10px] font-bold text-slate-200 text-center leading-tight">
                    {feat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Coupons — horizontal scroll on mobile */}
            {publicCoupons.length > 0 && (
              <div className="mb-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-300/90 flex items-center gap-1.5 mb-2 justify-center lg:justify-start">
                  <Tag className="w-3.5 h-3.5" />
                  Active Offers
                </p>
                <div className="flex gap-2 overflow-x-auto scroll-chips pb-1 -mx-1 px-1 justify-start lg:flex-wrap lg:overflow-visible">
                  {publicCoupons.slice(0, 4).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => copyCoupon(c.code)}
                      className="text-left shrink-0 min-w-[148px] max-w-[200px] px-3 py-2.5 rounded-xl bg-white/10 border border-amber-400/35 active:bg-white/20 touch-manipulation"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-amber-300 text-sm tracking-wider">{c.code}</span>
                        <Copy className="w-3 h-3 text-amber-400/70" />
                      </div>
                      <p className="text-[11px] font-bold text-white mt-0.5 line-clamp-1">{c.label}</p>
                      {c.expiryDate && (
                        <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Till {fmtExpiry(c.expiryDate)}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-2.5">
              <button
                type="button"
                onClick={scrollToProducts}
                className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-[#F0C14B] via-[#E5B53D] to-[#D4A843] text-[#001226] font-black text-sm px-6 py-3.5 rounded-xl shadow-lg uppercase tracking-wider touch-manipulation active:scale-[0.98] min-h-12"
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
                className="inline-flex items-center justify-center gap-2 bg-white/10 border border-white/25 text-white font-extrabold text-sm px-6 py-3.5 rounded-xl uppercase tracking-wider touch-manipulation active:scale-[0.98] min-h-12"
              >
                <Book className="w-4 h-4 text-amber-400" />
                <span>Browse All</span>
              </button>
            </div>
          </div>

          {/* Single book visual — desktop/tablet; hidden on small phones to save space & GPU */}
          <div className="hidden sm:flex lg:col-span-5 relative justify-center items-center">
            <div className="relative w-56 md:w-72 aspect-[3/4] rounded-2xl overflow-hidden border border-white/20 bg-slate-900/60 shadow-2xl">
              <Image
                src={currentSlide.image}
                alt={currentSlide.titleLine2}
                fill
                className="object-contain p-4"
                sizes="(max-width: 1024px) 224px, 288px"
                priority
              />
              {currentSlide.discount > 0 && (
                <div className="absolute top-3 right-3 bg-amber-400 text-[#001226] text-[10px] font-black px-2.5 py-1 rounded-full">
                  {currentSlide.discount}% OFF
                </div>
              )}
            </div>
          </div>
        </div>

        {slides.length > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous"
              className="w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center touch-manipulation"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex gap-1.5">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveSlide(idx)}
                  aria-label={`Slide ${idx + 1}`}
                  className={`h-2 rounded-full transition-all touch-manipulation ${
                    activeSlide === idx ? 'w-6 bg-amber-400' : 'w-2 bg-white/30'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next"
              className="w-10 h-10 rounded-full bg-white/15 border border-white/20 flex items-center justify-center touch-manipulation"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
