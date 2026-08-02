'use client';

import React from 'react';
import { CLASSES, CLASS_COLORS } from '@/lib/products';
import { useStore } from '@/context/StoreContext';
import { GraduationCap } from 'lucide-react';

export const ClassPicker = () => {
  const { selectedClass, setSelectedClass, setSelectedCategory } = useStore();

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    setSelectedCategory('all');

    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <section className="py-8 sm:py-12 bg-gradient-to-b from-slate-50 to-blue-50/40 border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-6 sm:mb-9">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-blue-700 bg-blue-100/80 border border-blue-300/80 px-3.5 py-1 rounded-full inline-flex items-center gap-1.5 mb-2 shadow-sm">
            <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
            ACADEMIC SELECTION
          </span>
          <h2 className="font-heading font-black text-xl sm:text-3xl md:text-4xl text-[#001226] tracking-tight uppercase">
            SELECT YOUR STANDARD
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1 px-2">
            State Board & CBSE guides tailored for 6th–12th standard students
          </p>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 sm:gap-4">
          {CLASSES.map((cls) => {
            const isSelected = selectedClass === cls;
            return (
              <button
                key={cls}
                type="button"
                onClick={() => handleSelectClass(cls)}
                className={`p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border text-center touch-manipulation active:scale-95 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                  CLASS_COLORS[cls]
                } ${
                  isSelected
                    ? 'ring-2 ring-blue-600 shadow-lg font-bold border-blue-500 bg-white scale-[1.03]'
                    : 'bg-white shadow-sm border-slate-200/80 hover:border-blue-300'
                }`}
              >
                <div className="font-heading font-black text-2xl sm:text-3xl md:text-4xl leading-none tracking-tight text-slate-900">
                  {cls}
                </div>
                <div className="text-[10px] sm:text-xs font-extrabold text-slate-500 mt-1 uppercase tracking-wider">
                  Std
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
