'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, ChevronDown, BookOpen, Layers, Award, Tag, Sparkles } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const NavBar = () => {
  const {
    selectedClass,
    selectedCategory,
    setSelectedClass,
    setSelectedCategory,
    setSearchQuery,
  } = useStore();

  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);

  const handleSelectFilter = (cls: string, cat: string) => {
    setSelectedClass(cls);
    setSelectedCategory(cat);
    setSearchQuery('');
    setIsCategoryMenuOpen(false);

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
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between overflow-x-auto no-scrollbar relative">
        {/* ALL CATEGORIES Interactive Dropdown */}
        <div className="relative flex-shrink-0">
          <button
            onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
            className="bg-[#001B3A] hover:bg-[#001226] text-white font-extrabold text-xs px-5 py-3 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Menu className="w-4 h-4 text-amber-400" />
            <span>ALL CATEGORIES</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform ${isCategoryMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Mega Dropdown Menu */}
          {isCategoryMenuOpen && (
            <div
              onMouseLeave={() => setIsCategoryMenuOpen(false)}
              className="absolute top-full left-0 w-72 bg-white text-slate-800 rounded-b-2xl shadow-2xl border border-slate-200 z-50 p-4 space-y-4"
            >
              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                  <span>By Class Standard</span>
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((cls) => (
                    <button
                      key={cls}
                      onClick={() => handleSelectFilter(cls, 'all')}
                      className={`text-left px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        selectedClass === cls
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-blue-50 text-slate-700'
                      }`}
                    >
                      {cls} Standard
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-amber-500" />
                  <span>By Guide Category</span>
                </h4>
                <div className="space-y-1">
                  <button
                    onClick={() => handleSelectFilter('all', 'guide')}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold hover:bg-amber-50 text-slate-800 flex items-center justify-between"
                  >
                    <span>Subject Guide Books</span>
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                  </button>
                  <button
                    onClick={() => handleSelectFilter('all', 'combo')}
                    className="w-full text-left px-3 py-2 rounded-lg text-xs font-bold hover:bg-emerald-50 text-slate-800 flex items-center justify-between"
                  >
                    <span>5-Subject Combo Bundles</span>
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

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
