'use client';

import React from 'react';
import { ShieldCheck, Truck, Award, Phone } from 'lucide-react';

export const TrustBar = () => {
  return (
    <div className="bg-gradient-to-r from-[#020B19] via-[#001938] to-[#020B19] text-white py-8 border-t border-slate-800/80 relative overflow-hidden">
      {/* Subtle backdrop lighting */}
      <div className="absolute top-1/2 left-1/4 -translate-y-1/2 w-64 h-64 bg-amber-400/5 rounded-full blur-2xl pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 -translate-y-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-3 sm:px-4 grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-6 relative z-10">
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
          <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-black text-xs text-white uppercase tracking-wider">100% SECURE PAYMENT</h4>
            <p className="text-[10px] text-slate-300 font-medium">Razorpay, UPI & Cash on Delivery</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
          <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-black text-xs text-white uppercase tracking-wider">EXPRESS ST COURIER</h4>
            <p className="text-[10px] text-slate-300 font-medium">Doorstep Delivery in 24-48 Hours</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
          <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-black text-xs text-white uppercase tracking-wider">VERIFIED CONTENT</h4>
            <p className="text-[10px] text-slate-300 font-medium">100% Aligned with Latest Syllabus</p>
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md hover:bg-white/10 transition-all">
          <div className="w-10 h-10 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center text-amber-400 flex-shrink-0">
            <Phone className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-heading font-black text-xs text-white uppercase tracking-wider">24/7 WHATSAPP SUPPORT</h4>
            <p className="text-[10px] text-slate-300 font-medium">Direct Live Assistance for Students</p>
          </div>
        </div>
      </div>
    </div>
  );
};
