'use client';

import React from 'react';
import { CLASSES, CLASS_COLORS } from '@/lib/products';
import { useStore } from '@/context/StoreContext';

export const ClassPicker = () => {
  const { selectedClass, setSelectedClass, setSelectedCategory } = useStore();

  return (
    <section className="py-10 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-[#001B3A] uppercase tracking-wide inline-flex items-center gap-4">
            <span className="w-8 h-0.5 bg-slate-300 hidden sm:inline-block" />
            CHOOSE YOUR CLASS
            <span className="w-8 h-0.5 bg-slate-300 hidden sm:inline-block" />
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {CLASSES.map((cls) => {
            const isSelected = selectedClass === cls;
            return (
              <button
                key={cls}
                onClick={() => {
                  setSelectedClass(cls);
                  setSelectedCategory('all');
                }}
                className={`p-5 rounded-xl border-2 text-center transition-all duration-200 ${
                  CLASS_COLORS[cls]
                } ${
                  isSelected
                    ? 'ring-2 ring-blue-600 shadow-md scale-105 font-bold'
                    : 'bg-white shadow-xs hover:-translate-y-1 hover:shadow-md'
                }`}
              >
                <div className="font-heading font-black text-2xl md:text-3xl leading-none">
                  {cls}
                </div>
                <div className="text-xs font-bold text-slate-500 mt-1">
                  Standard
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
