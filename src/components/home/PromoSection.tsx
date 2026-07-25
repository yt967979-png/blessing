'use client';

import React, { useState } from 'react';
import { Star, Download, Sparkles, Tag, ArrowRight, FileText } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const PromoSection = () => {
  const { setSelectedCategory, showToast } = useStore();
  const [activeReviewSlide, setActiveReviewSlide] = useState(0);

  const reviews = [
    {
      stars: 5,
      text: '"Very useful guides. Easy to understand and got good marks in exams!"',
      author: '- Arjun, 10th Std',
    },
    {
      stars: 5,
      text: '"All important questions are given. Really helped me score more."',
      author: '- Priya, 12th Std',
    },
    {
      stars: 5,
      text: '"The 5-subject combo pack saved me money and prep time."',
      author: '- Karthik, 10th Std',
    },
  ];

  const handleDownloadSample = () => {
    showToast('📥 Downloading Sample Chapter Preview PDF...');
    window.open('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c', '_blank');
  };

  const handleShopOffers = () => {
    setSelectedCategory('combo');
    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-12 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Special Offers */}
          <div className="bg-gradient-to-br from-amber-400 via-amber-300 to-amber-500 rounded-2xl p-6 text-[#001B3A] shadow-md flex flex-col justify-between relative overflow-hidden">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Tag className="w-5 h-5 text-[#001B3A]" />
                <h3 className="font-heading font-black text-lg tracking-wide uppercase">
                  SPECIAL OFFERS
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-6">
                <div className="bg-emerald-700 text-white rounded-xl p-2 text-center shadow-xs">
                  <div className="text-[10px] font-black uppercase">BUY 2 GUIDES</div>
                  <div className="text-sm font-black text-amber-300 mt-0.5">10% OFF</div>
                </div>
                <div className="bg-emerald-700 text-white rounded-xl p-2 text-center shadow-xs">
                  <div className="text-[10px] font-black uppercase">BUY 5 GUIDES</div>
                  <div className="text-sm font-black text-amber-300 mt-0.5">20% OFF</div>
                </div>
                <div className="bg-emerald-700 text-white rounded-xl p-2 text-center shadow-xs">
                  <div className="text-[10px] font-black uppercase">COMBO PACKS</div>
                  <div className="text-sm font-black text-amber-300 mt-0.5">BEST VALUE</div>
                </div>
              </div>
            </div>

            <button
              onClick={handleShopOffers}
              className="w-full bg-[#001B3A] hover:bg-blue-900 text-white font-extrabold text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
            >
              <span>SHOP NOW</span>
              <ArrowRight className="w-4 h-4 text-amber-400" />
            </button>
          </div>

          {/* Card 2: Student Reviews */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-6 text-[#001B3A] shadow-xs flex flex-col justify-between">
            <div>
              <div className="text-center mb-3">
                <h3 className="font-heading font-black text-xs text-amber-800 uppercase tracking-widest">
                  STUDENT REVIEWS
                </h3>
              </div>

              <div className="flex justify-center text-amber-400 mb-3">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400" />
                ))}
              </div>

              <p className="text-xs text-slate-700 italic text-center font-medium leading-relaxed min-h-[48px]">
                {reviews[activeReviewSlide].text}
              </p>

              <p className="text-[11px] font-bold text-slate-500 text-right mt-2">
                {reviews[activeReviewSlide].author}
              </p>
            </div>

            <div className="flex justify-center gap-1.5 mt-4">
              {reviews.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveReviewSlide(idx)}
                  className={`w-2.5 h-2.5 rounded-full transition-all cursor-pointer ${
                    activeReviewSlide === idx ? 'bg-amber-500 w-5' : 'bg-slate-300'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Card 3: Download Sample PDF */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-6 text-[#001B3A] shadow-xs flex flex-col justify-between">
            <div>
              <h3 className="font-heading font-black text-xs text-emerald-800 uppercase tracking-widest mb-3 text-center">
                DOWNLOAD SAMPLE
              </h3>

              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h4 className="font-heading font-bold text-sm text-slate-900 leading-tight">
                    Get Free Sample PDF of any Guide
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1">Preview chapters before buying</p>
                </div>
                <div className="w-12 h-14 bg-red-100 border border-red-200 rounded-lg flex items-center justify-center text-red-600 font-black text-xs flex-shrink-0 shadow-xs">
                  PDF
                </div>
              </div>
            </div>

            <button
              onClick={handleDownloadSample}
              className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>DOWNLOAD NOW</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
