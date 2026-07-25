'use client';

import React from 'react';
import {
  ListChecks,
  BookOpen,
  FileCheck,
  Hourglass,
  Target,
  GraduationCap,
} from 'lucide-react';

export const WhyChoose = () => {
  return (
    <section id="why" className="py-12 bg-slate-50 border-t border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-[#001B3A] uppercase tracking-wide inline-flex items-center gap-4">
            <span className="w-8 h-0.5 bg-slate-300 hidden sm:inline-block" />
            WHY CHOOSE BLESSING POWER GUIDE?
            <span className="w-8 h-0.5 bg-slate-300 hidden sm:inline-block" />
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { icon: ListChecks, title: 'Important Exam Questions' },
            { icon: BookOpen, title: 'Chapter-wise Coverage' },
            { icon: FileCheck, title: 'Model Question Papers' },
            { icon: Hourglass, title: 'Previous Year Papers' },
            { icon: Target, title: '100% Exam Oriented' },
            { icon: GraduationCap, title: 'Easy to Understand Language' },
          ].map((item, idx) => (
            <div
              key={idx}
              className="bg-white p-5 rounded-xl border border-slate-200 text-center hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
            >
              <item.icon className="w-8 h-8 text-blue-600 mx-auto mb-3" />
              <h3 className="font-heading font-bold text-xs text-[#001B3A] leading-snug">
                {item.title}
              </h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
