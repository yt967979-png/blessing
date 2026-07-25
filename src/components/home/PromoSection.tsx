'use client';

import React from 'react';
import { Sparkles, BookOpen } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const PromoSection = () => {
  const { products, setSelectedCategory } = useStore();

  // Dynamically find top discounted products from Database
  const topDiscountedCombo = products.find((p) => p.category === 'combo') || products[0];

  if (!topDiscountedCombo) return null;

  return (
    <section className="py-12 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4">
        {/* Dynamic Card 1: Real Database Offer */}
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/60 border border-amber-300 rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between shadow-xs gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                Featured Database Deal
              </span>
            </div>
            <h3 className="font-heading font-black text-xl text-[#001B3A] mb-1">
              {topDiscountedCombo.title}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-2">
              {topDiscountedCombo.description}
            </p>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-black text-[#001B3A]">
                ₹{topDiscountedCombo.price}
              </span>
              <span className="text-xs text-slate-400 line-through">
                ₹{topDiscountedCombo.mrp}
              </span>
              <span className="text-xs font-extrabold text-emerald-600 bg-emerald-100 px-2.5 py-0.5 rounded">
                {topDiscountedCombo.discount}% OFF LIVE
              </span>
            </div>
          </div>

          <button
            onClick={() => setSelectedCategory('combo')}
            className="bg-[#D4A843] hover:bg-[#F0C14B] text-[#001B3A] font-extrabold text-xs px-8 py-3 rounded-lg shadow-sm transition-colors uppercase tracking-wider text-center flex-shrink-0"
          >
            BROWSE DEALS
          </button>
        </div>
      </div>
    </section>
  );
};
