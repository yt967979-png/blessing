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
    <section className="py-14 bg-gradient-to-b from-slate-50 to-white border-t border-slate-200">
      <div className="max-w-4xl mx-auto px-4">
        <div className="text-center mb-10">
          <span className="text-xs font-black uppercase tracking-widest text-blue-600 bg-blue-100/70 border border-blue-200 px-3.5 py-1 rounded-full inline-block mb-2">
            GOT QUESTIONS?
          </span>
          <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl text-[#001226] tracking-tight uppercase">
            FREQUENTLY ASKED QUESTIONS
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
            Everything you need to know about delivery, syllabus coverage, and book content
          </p>
        </div>

        <div className="space-y-3.5">
          {FAQS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="bg-white/80 backdrop-blur-md border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs transition-all duration-200 hover:border-blue-300"
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full p-4 sm:p-5 text-left font-heading font-extrabold text-xs sm:text-sm text-[#001226] flex justify-between items-center gap-4 hover:bg-blue-50/40 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-black flex-shrink-0">
                      ?
                    </span>
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-blue-600 transition-transform duration-300 flex-shrink-0 ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 text-slate-600 text-xs sm:text-sm font-medium leading-relaxed border-t border-slate-100 bg-slate-50/50">
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
