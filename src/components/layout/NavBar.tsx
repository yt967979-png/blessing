'use client';

import React from 'react';
import { Tag } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const NavBar = () => {
  const {
    selectedClass,
    selectedCategory,
    setSelectedClass,
    setSelectedCategory,
    setSearchQuery,
  } = useStore();

  const handleSelectFilter = (cls: string, cat: string) => {
    setSelectedClass(cls);
    setSelectedCategory(cat);
    setSearchQuery('');

    // Smooth scroll to products section
    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToSection = (id: string) => {
    const elem = document.getElementById(id);
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className="bg-[#002859]/90 text-white sticky top-[61px] sm:top-[65px] z-30 shadow-lg backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between overflow-x-auto no-scrollbar relative py-0.5">
        {/* Navigation Links */}
        <div className="flex items-center text-xs font-extrabold tracking-wider uppercase">
          <button
            onClick={() => handleSelectFilter('all', 'all')}
            className={`px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer ${
              selectedClass === 'all' && selectedCategory === 'all'
                ? 'bg-white/15 text-amber-300 border-b-2 border-amber-400 font-black'
                : 'text-slate-200'
            }`}
          >
            ALL GUIDES
          </button>

          <button
            onClick={() => handleSelectFilter('10th', 'all')}
            className={`px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer ${
              selectedClass === '10th' ? 'bg-white/15 text-amber-300 border-b-2 border-amber-400 font-black' : 'text-slate-200'
            }`}
          >
            10TH STD BOARD
          </button>

          <button
            onClick={() => handleSelectFilter('12th', 'all')}
            className={`px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer ${
              selectedClass === '12th' ? 'bg-white/15 text-amber-300 border-b-2 border-amber-400 font-black' : 'text-slate-200'
            }`}
          >
            12TH STD BOARD
          </button>

          <button
            onClick={() => scrollToSection('why')}
            className="px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap text-slate-200 cursor-pointer"
          >
            WHY US
          </button>
        </div>

        {/* Special Offer Pill Tag */}
        <button
          onClick={() => handleSelectFilter('10th', 'combo')}
          className="hidden md:flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-amber-500 text-[#001226] px-3.5 py-1.5 rounded-full text-xs font-black shadow-md hover:scale-105 transition-transform ml-auto my-1 cursor-pointer uppercase tracking-wider"
        >
          <Tag className="w-3.5 h-3.5" />
          <span>5-BOOK COMBO PACKS</span>
        </button>
      </div>
    </nav>
  );
};
