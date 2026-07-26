'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCheck,
  BookOpen,
  FileText,
  Hourglass,
  Target,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Award,
  Book,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const HeroSection = () => {
  const { products, setSelectedClass, setSelectedCategory } = useStore();
  const [activeSlide, setActiveSlide] = useState(0);

  // Dynamically generate slides based on Database Products if available
  const heroProducts = products.length > 0 ? products.slice(0, 3) : [];

  const slides = heroProducts.length > 0 ? heroProducts.map((p) => ({
    tag: `${p.cls} STANDARD • ${p.badge}`,
    titleLine1: 'SCORE HIGH MARKS WITH',
    titleLine2: p.title.toUpperCase(),
    subtitle: p.description,
    badge: p.badge,
    image: p.image,
    price: p.price,
    mrp: p.mrp,
    discount: p.discount,
  })) : [
    {
      tag: 'TAMIL NADU STATE BOARD | CBSE | MATRICULATION',
      titleLine1: 'SCORE HIGH MARKS WITH',
      titleLine2: 'BLESSING POWER GUIDE',
      subtitle: 'Quality guides for better preparation and brighter results for 6th to 12th standard students.',
      badge: '100% EXAM ORIENTED',
      image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      price: 190,
      mrp: 240,
      discount: 20,
    }
  ];

  const nextSlide = () => setActiveSlide((prev) => (prev + 1) % slides.length);
  const prevSlide = () => setActiveSlide((prev) => (prev - 1 + slides.length) % slides.length);

  const currentSlide = slides[activeSlide] || slides[0];

  const scrollToProducts = () => {
    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="relative bg-gradient-to-br from-[#020B19] via-[#001E42] to-[#003478] text-white overflow-hidden py-10 md:py-16">
      {/* Background glowing particle effects & glassmorphic ambient lighting */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-400/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-center min-h-[400px]">
          {/* Content Left */}
          <div className="lg:col-span-7 text-center lg:text-left">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-amber-400/40 text-amber-300 text-xs font-extrabold tracking-wide mb-5 shadow-lg backdrop-blur-md">
                  <Award className="w-4 h-4 text-amber-400" />
                  <span>{currentSlide.tag}</span>
                </div>

                <h1 className="font-heading font-black tracking-tight mb-3">
                  <span className="block text-lg sm:text-xl md:text-2xl text-slate-300 font-extrabold tracking-wider uppercase mb-1">
                    {currentSlide.titleLine1}
                  </span>
                  <span className="block text-2xl sm:text-4xl md:text-5xl bg-gradient-to-r from-amber-200 via-amber-400 to-amber-500 bg-clip-text text-transparent drop-shadow-md leading-tight font-black">
                    {currentSlide.titleLine2}
                  </span>
                </h1>

                <p className="text-slate-300 text-xs sm:text-sm md:text-base max-w-xl mx-auto lg:mx-0 mb-6 font-medium leading-relaxed line-clamp-2">
                  {currentSlide.subtitle}
                </p>

                {/* Features Row - Glass Cards */}
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mb-8 max-w-xl mx-auto lg:mx-0">
                  {[
                    { icon: FileCheck, label: 'Exam Papers' },
                    { icon: BookOpen, label: 'Class Notes' },
                    { icon: FileText, label: 'Model Papers' },
                    { icon: Hourglass, label: 'Past Papers' },
                    { icon: Target, label: '100% Exam Target' },
                  ].map((feat, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 transition-all duration-200 backdrop-blur-md group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-300 group-hover:scale-110 transition-transform mb-1">
                        <feat.icon className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-200 text-center leading-tight">
                        {feat.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5">
                  <button
                    onClick={scrollToProducts}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-[#F0C14B] via-[#E5B53D] to-[#D4A843] text-[#001226] font-black text-xs sm:text-sm px-8 py-4 rounded-xl shadow-xl shadow-amber-500/20 hover:shadow-amber-500/35 hover:-translate-y-0.5 active:translate-y-0 transition-all uppercase tracking-wider cursor-pointer border border-amber-300/40"
                  >
                    <span>EXPLORE ALL GUIDES</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => {
                      setSelectedCategory('guide');
                      scrollToProducts();
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/25 text-white font-extrabold text-xs sm:text-sm px-8 py-4 rounded-xl transition-all uppercase tracking-wider cursor-pointer backdrop-blur-md shadow-lg"
                  >
                    <Book className="w-4 h-4 text-amber-400" />
                    <span>POPULAR GUIDES</span>
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 3D Floating Book Glass Showcase */}
          <div className="lg:col-span-5 relative flex justify-center items-center mt-4 lg:mt-0">
            <div className="relative w-72 sm:w-80 h-72">
              {/* Glass container glow */}
              <div className="absolute inset-0 bg-blue-500/10 backdrop-blur-2xl rounded-3xl border border-white/10 shadow-2xl" />

              <motion.img
                src={currentSlide.image}
                alt="Guide 1"
                className="absolute top-6 left-2 w-32 sm:w-36 rounded-xl shadow-2xl border-2 border-white/30 -rotate-6 z-10 object-contain bg-slate-900/80 p-1.5 backdrop-blur-md"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.img
                src={heroProducts[1]?.image || currentSlide.image}
                alt="Guide 2"
                className="absolute top-2 left-20 sm:left-24 w-32 sm:w-36 rounded-xl shadow-2xl border-2 border-white/30 rotate-4 z-20 object-contain bg-slate-900/80 p-1.5 backdrop-blur-md"
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.img
                src={heroProducts[2]?.image || currentSlide.image}
                alt="Guide 3"
                className="absolute top-10 left-36 sm:left-44 w-32 sm:w-36 rounded-xl shadow-2xl border-2 border-white/30 -rotate-3 z-30 object-contain bg-slate-900/80 p-1.5 backdrop-blur-md"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Gold Seal Badge */}
              <div className="absolute -top-3 -right-3 w-22 h-22 sm:w-24 sm:h-24 rounded-full bg-gradient-to-tr from-amber-400 via-amber-300 to-amber-500 text-[#001226] border-4 border-white/80 shadow-2xl flex flex-col items-center justify-center text-center z-40 p-2 font-black rotate-12 backdrop-blur-md">
                <span className="text-[8px] tracking-widest uppercase">PROVEN RESULT</span>
                <span className="text-[10px] leading-tight font-black uppercase">HIGHEST MARKS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Arrow Controls */}
        {slides.length > 1 && (
          <div className="absolute top-1/2 left-2 right-2 -translate-y-1/2 flex justify-between pointer-events-none z-30 hidden md:flex">
            <button
              onClick={prevSlide}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 border border-white/20 text-white backdrop-blur-lg flex items-center justify-center pointer-events-auto transition-all shadow-xl"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={nextSlide}
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/25 border border-white/20 text-white backdrop-blur-lg flex items-center justify-center pointer-events-auto transition-all shadow-xl"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Dots */}
        {slides.length > 1 && (
          <div className="flex justify-center items-center gap-2 mt-8">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSlide(idx)}
                className={`h-2.5 rounded-full transition-all cursor-pointer ${
                  activeSlide === idx
                    ? 'w-8 bg-amber-400 shadow-md shadow-amber-400/50'
                    : 'w-2.5 bg-white/25 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
