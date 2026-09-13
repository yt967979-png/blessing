'use client';

import React from 'react';
import { ShieldCheck, Truck, Award, Phone } from 'lucide-react';

export const TrustBar = () => {
  return (
    <div className="bg-gradient-to-r from-[#020B19] via-[#001938] to-[#020B19] text-white py-8 border-t border-slate-800/80 relative overflow-hidden">
      {/* Subtle backdrop lighting */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-64 h-64 bg-amber-400/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-3 sm:px-4 grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 md:gap-6 relative z-10">
        <div className="flex flex-col min-[480px]:flex-row items-start min-[480px]:items-center gap-2 min-[480px]:gap-3 p-2.5 sm:p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-heading font-black text-[11px] sm:text-xs text-white uppercase tracking-wider leading-tight">100% SECURE PAYMENT</h4>
            <p className="text-[9px] sm:text-[10px] text-slate-300 font-medium mt-0.5">Razorpay UPI, Cards &amp; NetBanking</p>
          </div>
        </div>

        <div className="flex flex-col min-[480px]:flex-row items-start min-[480px]:items-center gap-2 min-[480px]:gap-3 p-2.5 sm:p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Truck className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-heading font-black text-[11px] sm:text-xs text-white uppercase tracking-wider leading-tight">ST COURIER DELIVERY</h4>
            <p className="text-[9px] sm:text-[10px] text-slate-300 font-medium mt-0.5">Usually 2–4 days in Tamil Nadu</p>
          </div>
        </div>

        <div className="flex flex-col min-[480px]:flex-row items-start min-[480px]:items-center gap-2 min-[480px]:gap-3 p-2.5 sm:p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Award className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-heading font-black text-[11px] sm:text-xs text-white uppercase tracking-wider leading-tight">VERIFIED CONTENT</h4>
            <p className="text-[9px] sm:text-[10px] text-slate-300 font-medium mt-0.5">100% Aligned with Latest Syllabus</p>
          </div>
        </div>

        <div className="flex flex-col min-[480px]:flex-row items-start min-[480px]:items-center gap-2 min-[480px]:gap-3 p-2.5 sm:p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-heading font-black text-[11px] sm:text-xs text-white uppercase tracking-wider leading-tight">WHATSAPP SUPPORT</h4>
            <p className="text-[9px] sm:text-[10px] text-slate-300 font-medium mt-0.5">Mon–Sat, 9 AM – 8 PM</p>
          </div>
        </div>
      </div>
    </div>
  );
};
