'use client';

import React from 'react';
import { ShieldCheck, Truck, Award, Phone } from 'lucide-react';

export const TrustBar = () => {
  return (
    <div className="bg-[#001B3A] text-white py-6 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-amber-400 flex-shrink-0" />
          <div>
            <h4 className="font-heading font-bold text-xs">SECURE PAYMENT</h4>
            <p className="text-[11px] text-slate-400">100% Safe Razorpay & COD</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Truck className="w-7 h-7 text-amber-400 flex-shrink-0" />
          <div>
            <h4 className="font-heading font-bold text-xs">FAST DELIVERY</h4>
            <p className="text-[11px] text-slate-400">Across All Districts of India</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Award className="w-7 h-7 text-amber-400 flex-shrink-0" />
          <div>
            <h4 className="font-heading font-bold text-xs">QUALITY CONTENT</h4>
            <p className="text-[11px] text-slate-400">Expert Prepared Notes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Phone className="w-7 h-7 text-amber-400 flex-shrink-0" />
          <div>
            <h4 className="font-heading font-bold text-xs">CUSTOMER SUPPORT</h4>
            <p className="text-[11px] text-slate-400">WhatsApp & Phone Support</p>
          </div>
        </div>
      </div>
    </div>
  );
};
