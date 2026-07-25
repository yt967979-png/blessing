'use client';

import React from 'react';
import { Users, School, BookMarked, Star } from 'lucide-react';

export const StatsSection = () => {
  return (
    <section className="py-12 bg-gradient-to-r from-[#001B3A] to-[#003B73] text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          <div>
            <Users className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <div className="font-heading font-black text-3xl md:text-4xl text-amber-300">
              10,000+
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-1 uppercase tracking-wider">
              Happy Students
            </div>
          </div>
          <div>
            <School className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <div className="font-heading font-black text-3xl md:text-4xl text-amber-300">
              500+
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-1 uppercase tracking-wider">
              Partner Schools
            </div>
          </div>
          <div>
            <BookMarked className="w-8 h-8 text-amber-400 mx-auto mb-2" />
            <div className="font-heading font-black text-3xl md:text-4xl text-amber-300">
              50+
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-1 uppercase tracking-wider">
              Guide Titles
            </div>
          </div>
          <div>
            <Star className="w-8 h-8 text-amber-400 mx-auto mb-2 fill-amber-400" />
            <div className="font-heading font-black text-3xl md:text-4xl text-amber-300">
              4.9 / 5.0
            </div>
            <div className="text-xs font-semibold text-slate-300 mt-1 uppercase tracking-wider">
              Student Rating
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
