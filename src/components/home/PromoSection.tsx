'use client';

import React, { useState, useEffect } from 'react';
import { Star, ChevronLeft, ChevronRight, Quote } from 'lucide-react';

interface DBReview {
  id: string;
  studentName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export const PromoSection = () => {
  const [activeReviewSlide, setActiveReviewSlide] = useState(0);
  const [reviews, setReviews] = useState<DBReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reviews?limit=10')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setReviews(data);
        } else {
          setReviews([]);
        }
      })
      .catch(() => {
        setReviews([]);
      })
      .finally(() => setReviewsLoading(false));
  }, []);

  // Auto-rotate reviews every 5 seconds if multiple exist
  useEffect(() => {
    if (reviews.length <= 1) return;
    const timer = setInterval(() => {
      setActiveReviewSlide((prev) => (prev + 1) % reviews.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [reviews.length]);

  // Do not render anything if loading or if no REAL reviews exist in DB
  if (reviewsLoading || reviews.length === 0) {
    return null;
  }

  const current = reviews[activeReviewSlide] || reviews[0];
  const avgRating = (reviews.reduce((s, r) => s + (Number(r.rating) || 5), 0) / reviews.length).toFixed(1);

  return (
    <section className="py-12 bg-white border-t border-slate-200">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-8 text-[#001B3A] shadow-xs relative overflow-hidden">
          <div className="text-center mb-4">
            <h3 className="font-heading font-black text-sm text-amber-900 uppercase tracking-widest flex items-center justify-center gap-2">
              <Quote className="w-4 h-4 text-amber-600 rotate-180" />
              <span>VERIFIED STUDENT REVIEWS</span>
              <Quote className="w-4 h-4 text-amber-600" />
            </h3>
            <p className="text-xs text-amber-700 font-semibold mt-1">
              {reviews.length} Verified Student {reviews.length === 1 ? 'Review' : 'Reviews'} • Avg Rating {avgRating}/5.0
            </p>
          </div>

          {current && (
            <div className="max-w-2xl mx-auto text-center py-2">
              <div className="flex justify-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-5 h-5 ${i < (current.rating || 5) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                  />
                ))}
              </div>

              <p className="text-base text-slate-800 italic font-medium leading-relaxed mb-3">
                &quot;{current.comment}&quot;
              </p>

              <p className="text-xs font-bold text-slate-600">
                — {current.studentName}
              </p>
            </div>
          )}

          {/* Carousel Controls */}
          {reviews.length > 1 && (
            <div className="flex justify-center items-center gap-3 mt-6">
              <button
                type="button"
                onClick={() => setActiveReviewSlide((p) => (p - 1 + reviews.length) % reviews.length)}
                className="p-1.5 rounded-full hover:bg-amber-200/80 transition-colors cursor-pointer"
                aria-label="Previous review"
              >
                <ChevronLeft className="w-4 h-4 text-amber-800" />
              </button>
              {reviews.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveReviewSlide(idx)}
                  className={`h-2.5 rounded-full transition-all cursor-pointer ${
                    activeReviewSlide === idx ? 'bg-amber-500 w-6' : 'bg-amber-200 w-2.5'
                  }`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setActiveReviewSlide((p) => (p + 1) % reviews.length)}
                className="p-1.5 rounded-full hover:bg-amber-200/80 transition-colors cursor-pointer"
                aria-label="Next review"
              >
                <ChevronRight className="w-4 h-4 text-amber-800" />
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
