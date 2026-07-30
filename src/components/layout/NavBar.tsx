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
    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const chip = (active: boolean) =>
    `px-3.5 py-2.5 sm:px-4 sm:py-3 text-[11px] sm:text-xs font-extrabold tracking-wider uppercase whitespace-nowrap touch-manipulation shrink-0 transition-colors ${
      active
        ? 'bg-white/15 text-amber-300 border-b-2 border-amber-400'
        : 'text-slate-200 active:bg-white/10'
    }`;

  return (
    <nav
      className="bg-[#002859] text-white sticky z-30 shadow-md border-b border-white/10"
      style={{ top: 'var(--header-sticky-offset)' }}
    >
      <div className="max-w-7xl mx-auto px-2 sm:px-4 flex items-center justify-between gap-2">
        <div className="flex items-center overflow-x-auto scroll-chips flex-1 min-w-0">
          <button
            type="button"
            onClick={() => handleSelectFilter('all', 'all')}
            className={chip(selectedClass === 'all' && selectedCategory === 'all')}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => handleSelectFilter('10th', 'all')}
            className={chip(selectedClass === '10th')}
          >
            10th
          </button>
          <button
            type="button"
            onClick={() => handleSelectFilter('12th', 'all')}
            className={chip(selectedClass === '12th')}
          >
            12th
          </button>
          <button
            type="button"
            onClick={() => handleSelectFilter('all', 'combo')}
            className={chip(selectedCategory === 'combo')}
          >
            Combos
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('why')}
            className={chip(false)}
          >
            Why Us
          </button>
        </div>

        <button
          type="button"
          onClick={() => handleSelectFilter('10th', 'combo')}
          className="hidden md:flex items-center gap-1.5 bg-gradient-to-r from-amber-400 to-amber-500 text-[#001226] px-3.5 py-1.5 rounded-full text-xs font-black shrink-0"
        >
          <Tag className="w-3.5 h-3.5" />
          Combo Packs
        </button>
      </div>
    </nav>
  );
};
