'use client';

import React from 'react';
import Image from 'next/image';
import { Sparkles, ArrowRight, ShieldCheck, Truck, BookOpen, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const ComboBanner = () => {
  const { setSelectedClass, setSelectedCategory } = useStore();

  const handleBrowseCombos = () => {
    setSelectedClass('all');
    setSelectedCategory('all');
    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-10 bg-gradient-to-br from-[#020B19] via-[#001E42] to-[#002B5B] text-white relative overflow-hidden my-8 rounded-3xl mx-3 sm:mx-6 shadow-2xl border border-blue-500/20">
      {/* Decorative background aura lights */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Text Column */}
          <div className="lg:col-span-7 space-y-4 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 bg-amber-400/20 border border-amber-400/40 text-amber-300 px-3.5 py-1 rounded-full text-xs font-black tracking-widest uppercase shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
              <span>SPECIAL ALL-IN-ONE BUNDLES</span>
            </div>

            <h2 className="font-heading font-black text-2xl sm:text-4xl lg:text-5xl leading-tight text-white tracking-tight">
              10th &amp; 12th Standard <br />
              <span className="bg-gradient-to-r from-amber-300 via-amber-200 to-yellow-400 bg-clip-text text-transparent">
                5-Subject Combo Guides
              </span>
            </h2>

            <p className="text-slate-300 text-xs sm:text-sm max-w-xl leading-relaxed font-medium mx-auto lg:mx-0">
              Get all core subjects bundled together with extra discounts! Complete Samacheer Kalvi &amp; CBSE syllabus coverage with model question papers and chapter summaries.
            </p>

            {/* Included Subject Chips */}
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 pt-1">
              {['Tamil', 'English', 'Mathematics', 'Science', 'Social Science'].map((subj) => (
                <div
                  key={subj}
                  className="bg-white/10 border border-white/15 backdrop-blur-md px-3 py-1 rounded-xl text-[11px] font-bold text-amber-200 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3 h-3 text-amber-400" />
                  <span>{subj}</span>
                </div>
              ))}
            </div>

            {/* Badges & Guarantee */}
            <div className="pt-2 flex flex-wrap items-center justify-center lg:justify-start gap-4 text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>Express ST Courier Shipping</span>
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>2026 Latest Syllabus</span>
              </span>
            </div>

            <div className="pt-3">
              <button
                type="button"
                onClick={handleBrowseCombos}
                className="bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs sm:text-sm px-6 py-3.5 rounded-2xl inline-flex items-center gap-2 shadow-xl shadow-amber-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <span>EXPLORE ALL COMBOS</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Visual Card */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative bg-white/10 backdrop-blur-xl border border-white/20 p-6 rounded-3xl shadow-2xl max-w-sm w-full text-center space-y-4 transform hover:rotate-1 transition-transform">
              <div className="absolute -top-3 right-4 bg-gradient-to-r from-emerald-500 to-green-600 text-white text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-md tracking-wider">
                SAVE ₹250
              </div>

              <div className="w-20 h-20 bg-amber-400/20 rounded-2xl mx-auto flex items-center justify-center border border-amber-400/40 text-amber-400 shadow-inner">
                <BookOpen className="w-10 h-10" />
              </div>

              <div>
                <h3 className="font-heading font-black text-lg text-white">5-Subject Complete Pack</h3>
                <p className="text-xs text-slate-300 font-semibold mt-0.5">All Core Guides Included in 1 Box</p>
              </div>

              <div className="bg-slate-900/60 rounded-2xl p-3 border border-white/10 flex items-center justify-around">
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Combo Price</p>
                  <p className="font-black text-2xl text-amber-300">₹890</p>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <p className="text-[10px] uppercase font-bold text-slate-400">Individual MRP</p>
                  <p className="font-bold text-base text-slate-400 line-through">₹1,140</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
