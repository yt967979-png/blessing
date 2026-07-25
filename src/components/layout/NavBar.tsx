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
    <nav className="bg-[#0044AA] text-white sticky top-[65px] z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-start overflow-x-auto no-scrollbar relative">
        {/* Navigation Links */}
        <div className="flex items-center text-xs font-bold tracking-wide">
          <button
            onClick={() => handleSelectFilter('all', 'all')}
            className={`px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap ${
              selectedClass === 'all' && selectedCategory === 'all'
                ? 'bg-white/15 border-b-2 border-amber-400 text-amber-300'
                : ''
            }`}
          >
            Home
          </button>
          <button
            onClick={() => handleSelectFilter('all', 'guide')}
            className={`px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap ${
              selectedCategory === 'guide' ? 'bg-white/15 border-b-2 border-amber-400 text-amber-300' : ''
            }`}
          >
            Books
          </button>
          <button
            onClick={() => handleSelectFilter('10th', 'all')}
            className={`px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap ${
              selectedClass === '10th' ? 'bg-white/15 border-b-2 border-amber-400 text-amber-300' : ''
            }`}
          >
            6th - 12th Guides
          </button>
          <button
            onClick={() => handleSelectFilter('all', 'combo')}
            className={`px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap ${
              selectedCategory === 'combo' ? 'bg-white/15 border-b-2 border-amber-400 text-amber-300' : ''
            }`}
          >
            Combo Packs
          </button>
          <button
            onClick={() => handleSelectFilter('12th', 'combo')}
            className="px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap flex items-center gap-1"
          >
            <Tag className="w-3.5 h-3.5 text-amber-400" />
            <span>Offers</span>
          </button>
          <button
            onClick={() => scrollToSection('why')}
            className="px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            About Us
          </button>
          <button
            onClick={() => scrollToSection('footer')}
            className="px-4 py-3 hover:bg-white/10 transition-colors whitespace-nowrap"
          >
            Contact Us
          </button>
        </div>
      </div>
    </nav>
  );
};
