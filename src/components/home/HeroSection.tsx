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
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const HeroSection = () => {
  const { products } = useStore();
  const [activeSlide, setActiveSlide] = useState(0);

  // Dynamically generate slides based on Database Products if available
  const heroProducts = products.length > 0 ? products.slice(0, 3) : [];

  const slides = heroProducts.length > 0 ? heroProducts.map((p) => ({
    tag: `${p.cls} STANDARD • ${p.badge}`,
    titleLine1: 'EXAM READY STUDY GUIDE',
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

  return (
    <section className="relative bg-gradient-to-br from-[#001226] via-[#002B5B] to-[#003D8F] text-white overflow-hidden py-12 md:py-16">
      {/* Background glowing particle effects */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-[380px]">
          {/* Content Left */}
          <div className="lg:col-span-7">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300 text-xs font-semibold mb-4">
                  <Award className="w-3.5 h-3.5" />
                  <span>{currentSlide.tag}</span>
                </div>

                <h1 className="font-heading font-black tracking-tight mb-2">
                  <span className="block text-xl md:text-2xl text-slate-200 font-extrabold">
                    {currentSlide.titleLine1}
                  </span>
                  <span className="block text-2xl sm:text-3xl md:text-4xl gold-gradient-text drop-shadow-md leading-tight">
                    {currentSlide.titleLine2}
                  </span>
                </h1>

                <p className="text-slate-300 text-sm md:text-base max-w-xl mb-6 font-normal leading-relaxed line-clamp-2">
                  {currentSlide.subtitle}
                </p>

                {/* Features Row */}
                <div className="flex flex-wrap gap-4 mb-8">
                  {[
                    { icon: FileCheck, label: 'Important Questions' },
                    { icon: BookOpen, label: 'Chapter Notes' },
                    { icon: FileText, label: 'Model Papers' },
                    { icon: Hourglass, label: 'Previous Q&A' },
                    { icon: Target, label: '100% Exam Ready' },
                  ].map((feat, idx) => (
                    <div key={idx} className="flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-300">
                        <feat.icon className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-300 text-center max-w-[70px]">
                        {feat.label}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA Buttons */}
                <div className="flex items-center gap-4">
                  <a
                    href="#products"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-[#F0C14B] to-[#D4A843] text-[#001B3A] font-extrabold text-sm px-8 py-3.5 rounded-xl shadow-lg hover:shadow-amber-500/20 hover:-translate-y-0.5 transition-all uppercase tracking-wider"
                  >
                    <span>EXPLORE BOOKS</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 3D Floating Book Mockups Right */}
          <div className="lg:col-span-5 relative flex justify-center items-center">
            <div className="relative w-80 h-72">
              <motion.img
                src={currentSlide.image}
                alt="Guide 1"
                className="absolute top-6 left-0 w-36 rounded-lg shadow-2xl border-2 border-white/20 -rotate-6 z-10 object-contain bg-slate-900/60 p-1"
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.img
                src={heroProducts[1]?.image || currentSlide.image}
                alt="Guide 2"
                className="absolute top-0 left-20 w-36 rounded-lg shadow-2xl border-2 border-white/20 rotate-3 z-20 object-contain bg-slate-900/60 p-1"
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.img
                src={heroProducts[2]?.image || currentSlide.image}
                alt="Guide 3"
                className="absolute top-10 left-40 w-36 rounded-lg shadow-2xl border-2 border-white/20 -rotate-2 z-30 object-contain bg-slate-900/60 p-1"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
              />

              {/* Gold Seal Badge */}
              <div className="absolute -top-4 -right-2 w-24 h-24 rounded-full bg-gradient-to-tr from-amber-400 via-amber-300 to-amber-500 text-[#001B3A] border-4 border-white shadow-xl flex flex-col items-center justify-center text-center z-40 p-2 font-black">
                <span className="text-[8px] tracking-wider uppercase">BETTER GUIDES</span>
                <span className="text-[10px] leading-tight">BRIGHTER RESULTS</span>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Arrow Controls */}
        {slides.length > 1 && (
          <div className="absolute top-1/2 left-2 right-2 -translate-y-1/2 flex justify-between pointer-events-none z-30 hidden md:flex">
            <button
              onClick={prevSlide}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white backdrop-blur-md flex items-center justify-center pointer-events-auto transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={nextSlide}
              className="w-10 h-10 rounded-full bg-white/15 hover:bg-white/30 text-white backdrop-blur-md flex items-center justify-center pointer-events-auto transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Dots */}
        {slides.length > 1 && (
          <div className="flex justify-center items-center gap-2 mt-6">
            {slides.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setActiveSlide(idx)}
                className={`h-2.5 rounded-full transition-all ${
                  activeSlide === idx
                    ? 'w-8 bg-amber-400'
                    : 'w-2.5 bg-white/30 hover:bg-white/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
