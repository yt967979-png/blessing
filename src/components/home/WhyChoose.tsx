'use client';

import React from 'react';
import {
  ListChecks,
  BookOpen,
  FileCheck,
  Hourglass,
  Target,
  GraduationCap,
  Award,
} from 'lucide-react';

export const WhyChoose = () => {
  return (
    <section id="why" className="py-14 bg-gradient-to-b from-white to-slate-50/80 border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-gradient-to-br from-blue-900/90 via-[#001E42] to-[#001226] border border-blue-400/20 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden text-white">
          {/* Glass ambient highlights */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-80 h-80 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

          <div className="text-center max-w-2xl mx-auto mb-8 relative z-10">
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-400 bg-amber-400/10 border border-amber-400/30 px-3.5 py-1 rounded-full inline-block mb-3 backdrop-blur-md">
              THE BLESSING POWER ADVANTAGE
            </span>
            <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl text-white tracking-tight uppercase">
              WHY 100,000+ STUDENTS TRUST OUR GUIDES
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm font-medium mt-2">
              Crafted by veteran State Board & CBSE educators to maximize exam scores with minimum memorization effort.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4 relative z-10">
            {[
              { icon: ListChecks, title: 'High-Yield Questions', desc: 'Expected board exam questions' },
              { icon: BookOpen, title: 'Chapter Summaries', desc: 'Clear step-by-step notes' },
              { icon: FileCheck, title: 'Model Test Papers', desc: 'Full practice sets with solutions' },
              { icon: Hourglass, title: '10-Year Solved Papers', desc: 'Past year trend breakdown' },
              { icon: Target, title: '100% Exam Focused', desc: 'Zero clutter, max scoring' },
              { icon: GraduationCap, title: 'Simple Language', desc: 'Easy to learn & memorize' },
              { icon: Award, title: '95%+ Score Guarantee', desc: 'Proven academic track record' },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-white/10 hover:bg-white/15 border border-white/15 p-4 rounded-2xl text-center transition-all duration-300 backdrop-blur-md hover:-translate-y-1 hover:shadow-xl group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 text-amber-300 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="font-heading font-black text-xs text-white leading-snug mb-1">
                  {item.title}
                </h3>
                <p className="text-[10px] text-slate-300 font-medium leading-tight hidden sm:block">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
