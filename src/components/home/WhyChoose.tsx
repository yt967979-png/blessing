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
    <section id="why" className="py-12 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-6 md:p-8">
          <div className="text-center mb-6">
            <h2 className="font-heading font-extrabold text-sm md:text-base text-[#001B3A] uppercase tracking-widest">
              WHY CHOOSE BLESSING POWER GUIDE?
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { icon: ListChecks, title: 'Important Exam Questions' },
              { icon: BookOpen, title: 'Chapter-wise Coverage' },
              { icon: FileCheck, title: 'Model Question Papers' },
              { icon: Hourglass, title: 'Previous Year Questions' },
              { icon: Target, title: '100% Exam Oriented' },
              { icon: GraduationCap, title: 'Easy to Understand Language' },
              { icon: Award, title: 'Designed for Better Results' },
            ].map((item, idx) => (
              <div
                key={idx}
                className="bg-white p-4 rounded-xl border border-blue-100 text-center hover:shadow-md hover:-translate-y-1 transition-all duration-200"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-2.5 shadow-xs">
                  <item.icon className="w-5 h-5" />
                </div>
                <h3 className="font-heading font-bold text-[11px] text-[#001B3A] leading-snug">
                  {item.title}
                </h3>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
