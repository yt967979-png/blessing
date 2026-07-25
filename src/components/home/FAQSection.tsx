'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const FAQS = [
  {
    q: 'Which syllabus do Blessing Power Guides follow?',
    a: 'Our guides follow the latest Tamil Nadu State Board (Samacheer Kalvi) syllabus, CBSE board curriculum, and Matriculation standards updated for the 2026 academic year.',
  },
  {
    q: 'How long does delivery take across Tamil Nadu and India?',
    a: 'Orders are dispatched within 24 hours. Delivery takes 2-3 working days within Tamil Nadu (via Speed Post or Professional Courier) and 3-5 days for rest of India.',
  },
  {
    q: 'Do you offer Cash on Delivery (COD)?',
    a: 'Yes! We support Cash on Delivery (COD) as well as 100% secure online payments via Razorpay (UPI, Google Pay, PhonePe, Cards, Net Banking).',
  },
  {
    q: 'What is included in the 5-Subject Combo Pack?',
    a: 'The 10th Standard Combo Pack includes 5 complete books: Mathematics, Science, Social Science, English, and Tamil with model question papers and step-by-step solutions.',
  },
  {
    q: 'Can I preview sample chapters before buying?',
    a: 'Yes, you can click on the "Free Sample PDF" button at any time to download free sample chapters of any standard and subject.',
  },
];

export const FAQSection = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="py-12 bg-slate-50 border-t border-slate-200">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-[#001B3A] uppercase tracking-wide inline-flex items-center gap-4">
            <span className="w-8 h-0.5 bg-slate-300 hidden sm:inline-block" />
            FREQUENTLY ASKED QUESTIONS
            <span className="w-8 h-0.5 bg-slate-300 hidden sm:inline-block" />
          </h2>
        </div>

        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs"
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full p-4 text-left font-heading font-bold text-sm text-[#001B3A] flex justify-between items-center gap-4 hover:bg-slate-50 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-500 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-xs text-slate-600 border-t border-slate-100 pt-3 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
