'use client';

import React from 'react';
import { CLASSES, CLASS_COLORS } from '@/lib/products';
import { useStore } from '@/context/StoreContext';

export const ClassPicker = () => {
  const { selectedClass, setSelectedClass, setSelectedCategory } = useStore();

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    setSelectedCategory('all');

    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-12 bg-gradient-to-b from-slate-50 to-blue-50/40 border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <span className="text-xs font-black uppercase tracking-widest text-blue-600 bg-blue-100/70 border border-blue-200 px-3.5 py-1 rounded-full inline-block mb-2">
            ACADEMIC SELECTION
          </span>
          <h2 className="font-heading font-black text-2xl sm:text-3xl md:text-4xl text-[#001226] tracking-tight uppercase">
            SELECT YOUR STANDARD
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1">
            Handcrafted guides & question banks tailored for State Board & CBSE excellence
          </p>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
          {CLASSES.map((cls) => {
            const isSelected = selectedClass === cls;
            return (
              <button
                key={cls}
                onClick={() => handleSelectClass(cls)}
                className={`p-4 sm:p-5 rounded-2xl border text-center transition-all duration-300 cursor-pointer backdrop-blur-md relative overflow-hidden group ${
                  CLASS_COLORS[cls]
                } ${
                  isSelected
                    ? 'ring-2 ring-blue-600 shadow-xl scale-105 font-bold border-blue-500 bg-white'
                    : 'bg-white/80 shadow-xs hover:-translate-y-1 hover:shadow-lg hover:bg-white border-slate-200'
                }`}
              >
                <div className="font-heading font-black text-2xl sm:text-3xl md:text-4xl leading-none tracking-tight group-hover:scale-110 transition-transform">
                  {cls}
                </div>
                <div className="text-[10px] sm:text-xs font-extrabold text-slate-500 mt-1 uppercase tracking-wider">
                  STANDARD
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
