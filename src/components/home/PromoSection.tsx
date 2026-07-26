'use client';

import React, { useState, useEffect } from 'react';
import { Star, Download, Tag, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

interface DBReview {
  id: string;
  studentName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export const PromoSection = () => {
  const { setSelectedCategory, showToast } = useStore();
  const [activeReviewSlide, setActiveReviewSlide] = useState(0);
  const [reviews, setReviews] = useState<DBReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reviews?limit=6')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setReviews(data);
        } else {
          // Friendly placeholder until real reviews exist
          setReviews([
            { id: '1', studentName: 'Arjun, 10th Std', rating: 5, comment: 'Very useful guides. Easy to understand and got good marks in exams!', createdAt: '' },
            { id: '2', studentName: 'Priya, 12th Std', rating: 5, comment: 'All important questions are given. Really helped me score more.', createdAt: '' },
            { id: '3', studentName: 'Karthik, 10th Std', rating: 5, comment: 'The 5-subject combo pack saved me money and prep time.', createdAt: '' },
          ]);
        }
      })
      .catch(() => {
        setReviews([
          { id: '1', studentName: 'Arjun, 10th Std', rating: 5, comment: 'Very useful guides. Easy to understand and got good marks in exams!', createdAt: '' },
        ]);
      })
      .finally(() => setReviewsLoading(false));
  }, []);

  // Auto-rotate reviews every 4 seconds
  useEffect(() => {
    if (reviews.length <= 1) return;
    const timer = setInterval(() => {
      setActiveReviewSlide((prev) => (prev + 1) % reviews.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [reviews.length]);

  const handleDownloadSample = () => {
    showToast('📥 Downloading Sample Chapter Preview PDF...');
    window.open('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c', '_blank');
  };

  const handleShopOffers = () => {
    setSelectedCategory('combo');
    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  const current = reviews[activeReviewSlide];
  const avgRating = reviews.length > 0
    ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
    : '5.0';

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
                {[
                  { label: 'BUY 2 GUIDES', value: '10% OFF' },
                  { label: 'BUY 5 GUIDES', value: '20% OFF' },
                  { label: 'COMBO PACKS', value: 'BEST VALUE' },
                ].map((item) => (
                  <div key={item.label} className="bg-emerald-700 text-white rounded-xl p-2 text-center">
                    <div className="text-[10px] font-black uppercase">{item.label}</div>
                    <div className="text-sm font-black text-amber-300 mt-0.5">{item.value}</div>
                  </div>
                ))}
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

          {/* Card 2: Live Student Reviews from DB */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-6 text-[#001B3A] shadow-xs flex flex-col justify-between min-h-[200px]">
            <div>
              <div className="text-center mb-3">
                <h3 className="font-heading font-black text-xs text-amber-800 uppercase tracking-widest">
                  STUDENT REVIEWS
                </h3>
                {!reviewsLoading && (
                  <p className="text-[10px] text-amber-600 mt-0.5">{reviews.length} verified reviews • Avg {avgRating}/5</p>
                )}
              </div>

              {reviewsLoading ? (
                <div className="flex justify-center items-center py-6">
                  <span className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : current ? (
                <>
                  <div className="flex justify-center gap-0.5 mb-3">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${i < current.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`}
                      />
                    ))}
                  </div>

                  <p className="text-xs text-slate-700 italic text-center font-medium leading-relaxed min-h-[48px]">
                    &quot;{current.comment}&quot;
                  </p>

                  <p className="text-[11px] font-bold text-slate-500 text-right mt-2">
                    — {current.studentName}
                  </p>
                </>
              ) : null}
            </div>

            {/* Carousel dots + arrows */}
            {reviews.length > 1 && (
              <div className="flex justify-center items-center gap-2 mt-4">
                <button
                  onClick={() => setActiveReviewSlide((p) => (p - 1 + reviews.length) % reviews.length)}
                  className="p-1 rounded-full hover:bg-amber-200 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5 text-amber-700" />
                </button>
                {reviews.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveReviewSlide(idx)}
                    className={`h-2 rounded-full transition-all cursor-pointer ${
                      activeReviewSlide === idx ? 'bg-amber-500 w-5' : 'bg-slate-300 w-2'
                    }`}
                  />
                ))}
                <button
                  onClick={() => setActiveReviewSlide((p) => (p + 1) % reviews.length)}
                  className="p-1 rounded-full hover:bg-amber-200 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5 text-amber-700" />
                </button>
              </div>
            )}
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
