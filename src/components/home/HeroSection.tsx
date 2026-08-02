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
  Sparkles,
  Star,
  Zap,
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
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const heroProducts = products.filter((p) => p.inStock).slice(0, 4);

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

  // Auto-advance slides every 6s
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
    setCopiedCode(code);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(code);
    }
    showToast(`Coupon ${code} copied — apply at checkout!`);
    setTimeout(() => setCopiedCode(null), 2500);
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
    <section className="relative bg-gradient-to-br from-[#020B19] via-[#001E42] to-[#003478] text-white overflow-hidden py-8 md:py-16">
      {/* Dynamic Animated Ambient Glow Background */}
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-amber-400/20 rounded-full blur-[120px] pointer-events-none animate-pulse-aura" />
      <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-blue-500/25 rounded-full blur-[120px] pointer-events-none animate-pulse-aura" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Text & Actions Column */}
          <div className="lg:col-span-7 text-center lg:text-left animate-fade-slide-up">
            {/* Tag Badge */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-amber-400/40 text-amber-300 text-xs font-extrabold tracking-wide mb-4 shadow-lg backdrop-blur-md">
              <Award className="w-4 h-4 text-amber-400 shrink-0 animate-bounce" />
              <span className="truncate max-w-[280px] sm:max-w-none">{currentSlide.tag}</span>
            </div>

            {/* Animated Main Headline */}
            <h1 className="font-heading font-black tracking-tight mb-4">
              <span className="block text-xs sm:text-lg text-slate-300 font-extrabold tracking-widest uppercase mb-1 flex items-center justify-center lg:justify-start gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-400" />
                {currentSlide.titleLine1}
              </span>
              <span className="block text-2xl leading-tight sm:text-4xl md:text-5xl lg:text-6xl bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent font-black drop-shadow-sm">
                BLESSING POWER GUIDE
              </span>
              {heroProducts.length > 0 && (
                <span className="mt-2 block text-base sm:text-2xl text-white/95 font-bold line-clamp-2 transition-all">
                  {currentSlide.titleLine2}
                </span>
              )}
            </h1>

            <p className="text-slate-300 text-sm sm:text-base max-w-xl mx-auto lg:mx-0 mb-6 font-medium leading-relaxed line-clamp-2 sm:line-clamp-3">
              {currentSlide.subtitle}
            </p>

            {/* Feature Chips Row */}
            <div className="grid grid-cols-3 gap-2.5 mb-6 max-w-md mx-auto lg:mx-0">
              {features.map((feat) => (
                <div
                  key={feat.label}
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-white/10 border border-white/15 backdrop-blur-md hover:bg-white/15 transition-all"
                >
                  <feat.icon className="w-4 h-4 text-amber-300 mb-1" />
                  <span className="text-[11px] font-bold text-slate-200 text-center leading-tight">
                    {feat.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Active Coupons Section */}
            {publicCoupons.length > 0 && (
              <div className="mb-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-300 flex items-center gap-1.5 mb-2.5 justify-center lg:justify-start">
                  <Tag className="w-4 h-4 text-amber-400" />
                  Active Offers — Tap to Copy
                </p>
                <div className="flex gap-2.5 overflow-x-auto scroll-chips pb-1 -mx-1 px-1 justify-start lg:flex-wrap lg:overflow-visible">
                  {publicCoupons.slice(0, 4).map((c) => {
                    const isJustCopied = copiedCode === c.code;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => copyCoupon(c.code)}
                        className={`text-left shrink-0 min-w-[150px] max-w-[210px] px-3.5 py-2.5 rounded-xl border backdrop-blur-md transition-all touch-manipulation active:scale-95 ${
                          isJustCopied
                            ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-lg shadow-amber-400/40'
                            : 'bg-white/10 border-amber-400/35 hover:bg-white/15 hover:border-amber-400/60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-black text-sm tracking-wider ${isJustCopied ? 'text-slate-950' : 'text-amber-300'}`}>
                            {c.code}
                          </span>
                          {isJustCopied ? (
                            <span className="text-[10px] font-extrabold bg-slate-950 text-amber-300 px-1.5 py-0.5 rounded">Copied!</span>
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-amber-400/80" />
                          )}
                        </div>
                        <p className={`text-[11px] font-bold mt-0.5 line-clamp-1 ${isJustCopied ? 'text-slate-900' : 'text-white'}`}>
                          {c.label}
                        </p>
                        {c.expiryDate && (
                          <p className={`text-[10px] mt-1 flex items-center gap-1 ${isJustCopied ? 'text-slate-800' : 'text-slate-400'}`}>
                            <Clock className="w-3 h-3" />
                            Till {fmtExpiry(c.expiryDate)}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Primary Action Buttons with Animated Shimmer */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3">
              <button
                type="button"
                onClick={scrollToProducts}
                className="inline-flex items-center justify-center gap-2 animate-shimmer text-[#001226] font-black text-sm px-7 py-3.5 rounded-xl shadow-xl shadow-amber-400/20 uppercase tracking-wider touch-manipulation hover:scale-[1.03] active:scale-[0.98] transition-all min-h-12"
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
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/25 text-white font-extrabold text-sm px-7 py-3.5 rounded-xl uppercase tracking-wider touch-manipulation hover:scale-[1.02] active:scale-[0.98] transition-all min-h-12"
              >
                <Book className="w-4 h-4 text-amber-400" />
                <span>Browse All</span>
              </button>
            </div>
          </div>

          {/* Right Floating 3D Book Showcase with Animated Floating Badges */}
          <div className="hidden sm:flex lg:col-span-5 relative justify-center items-center">
            {/* Ambient Backlight Glow */}
            <div className="absolute w-72 h-96 bg-gradient-to-tr from-amber-400/30 to-blue-600/30 rounded-full blur-2xl animate-pulse-aura" />

            {/* 3D Book Card Container */}
            <div className="relative w-60 md:w-72 aspect-[3/4] rounded-2xl overflow-hidden border border-white/25 bg-slate-900/80 shadow-2xl hero-3d-card animate-float-slow backdrop-blur-md">
              <Image
                src={currentSlide.image}
                alt={currentSlide.titleLine2}
                fill
                className="object-contain p-4 transition-transform duration-500 hover:scale-105"
                sizes="(max-width: 1024px) 240px, 288px"
                priority
              />

              {/* Discount Tag */}
              {currentSlide.discount > 0 && (
                <div className="absolute top-3 right-3 bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 text-xs font-black px-3 py-1 rounded-full shadow-md animate-bounce">
                  {currentSlide.discount}% OFF
                </div>
              )}
            </div>

            {/* Top Floating Badge */}
            <div className="absolute -top-4 -left-4 md:-left-8 bg-slate-900/90 border border-amber-400/50 text-white px-3.5 py-2 rounded-xl shadow-xl backdrop-blur-md flex items-center gap-2 animate-float-reverse">
              <Zap className="w-4 h-4 text-amber-400" />
              <div>
                <p className="text-[11px] font-black text-amber-300 uppercase">100% Exam-Oriented</p>
                <p className="text-[10px] text-slate-300 font-semibold">Latest TN State Syllabus</p>
              </div>
            </div>

            {/* Bottom Floating Badge */}
            <div className="absolute -bottom-4 -right-4 md:-right-6 bg-slate-900/90 border border-blue-400/50 text-white px-3.5 py-2 rounded-xl shadow-xl backdrop-blur-md flex items-center gap-2 animate-float-slow">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <div>
                <p className="text-[11px] font-black text-amber-300">4.9★ Rating</p>
                <p className="text-[10px] text-slate-300 font-semibold">50,000+ Happy Students</p>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Indicators & Controls */}
        {slides.length > 1 && (
          <div className="flex items-center justify-center gap-3 mt-8">
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous"
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center touch-manipulation transition-all hover:scale-110 active:scale-95"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <div className="flex gap-2">
              {slides.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveSlide(idx)}
                  aria-label={`Slide ${idx + 1}`}
                  className={`h-2.5 rounded-full transition-all duration-300 touch-manipulation ${
                    activeSlide === idx ? 'w-8 bg-amber-400 shadow-md shadow-amber-400/50' : 'w-2.5 bg-white/30 hover:bg-white/50'
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next"
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center touch-manipulation transition-all hover:scale-110 active:scale-95"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
