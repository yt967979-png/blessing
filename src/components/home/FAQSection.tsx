'use client';

import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const FAQSection = () => {
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/content?type=faq')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setFaqs(data);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="py-14 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 space-y-3">
          <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse mx-auto mb-8" />
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (faqs.length === 0) return null;

  return (
    <section className="py-14 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-10">
          <span className="text-xs font-black uppercase tracking-widest text-blue-600 bg-blue-100/70 border border-blue-200 px-3.5 py-1 rounded-full inline-block mb-2">
            GOT QUESTIONS?
          </span>
          <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl text-[#001226] tracking-tight uppercase">
            FREQUENTLY ASKED QUESTIONS
          </h2>
        </div>

        <div className="space-y-3">
          {faqs.map((faq, idx) => (
            <div
              key={faq.id}
              className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            >
              <button
                onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
              >
                <span className="font-bold text-sm sm:text-base text-[#001226]">{faq.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-blue-600 shrink-0 transition-transform ${openIdx === idx ? 'rotate-180' : ''}`}
                />
              </button>
              {openIdx === idx && (
                <div className="px-5 pb-4 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                  {faq.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
