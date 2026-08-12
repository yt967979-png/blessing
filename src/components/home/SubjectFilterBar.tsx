'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Filter, ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

const SUBJECTS = [
  { id: 'all', label: 'All Subjects', icon: '📚' },
  { id: 'Maths', label: 'Mathematics', icon: '📐' },
  { id: 'Science', label: 'Science', icon: '🧪' },
  { id: 'Social Science', label: 'Social Science', icon: '🌍' },
  { id: 'English', label: 'English', icon: '🔤' },
  { id: 'Tamil', label: 'Tamil', icon: '📜' },
  { id: 'Physics', label: 'Physics', icon: '⚡' },
  { id: 'Chemistry', label: 'Chemistry', icon: '🔬' },
  { id: 'Biology', label: 'Biology', icon: '🧬' },
];

const CLASSES_QUICK = [
  { id: 'all', label: 'All Std' },
  { id: '10th', label: '10th' },
  { id: '12th', label: '12th' },
];

export const SubjectFilterBar = () => {
  const { searchQuery, setSearchQuery, selectedClass, setSelectedClass, products } = useStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, []);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const scrollAmount = direction === 'left' ? -240 : 240;
    el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    setTimeout(checkScroll, 320);
  };

  const handleSelectSubject = (subjId: string) => {
    if (subjId === 'all') {
      setSearchQuery('');
    } else {
      setSearchQuery(subjId);
    }
    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSelectClass = (clsId: string) => {
    setSelectedClass(clsId);
    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedClass('all');
  };

  const hasActiveFilters = searchQuery !== '' || (selectedClass !== 'all' && selectedClass !== '');

  // Calculate matching product count for active badge
  const activeProductCount = (products || []).filter((p) => {
    const matchesClass =
      selectedClass === 'all' || !selectedClass || p.cls?.toLowerCase() === selectedClass.toLowerCase();
    const matchesSubject =
      !searchQuery ||
      p.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.title?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesClass && matchesSubject;
  }).length;

  return (
    <div className="bg-white/95 backdrop-blur-md border-y border-slate-200/90 py-2 sm:py-2.5 sticky top-14 sm:top-16 z-30 shadow-xs transition-all w-full overflow-hidden select-none">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 relative flex items-center gap-1.5 sm:gap-2">
        
        {/* Quick Class Selector Pills */}
        <div className="flex items-center gap-1 shrink-0 border-r border-slate-200/90 pr-2">
          <div className="hidden md:flex items-center gap-1 text-[11px] font-black text-slate-700 uppercase tracking-wide mr-1">
            <Filter className="w-3.5 h-3.5 text-blue-600 animate-pulse" />
            <span>FILTER:</span>
          </div>

          <div className="flex items-center gap-0.5 sm:gap-1 bg-slate-100/90 p-0.5 sm:p-1 rounded-xl border border-slate-200/80">
            {CLASSES_QUICK.map((c) => {
              const isClsActive = (c.id === 'all' && (selectedClass === 'all' || !selectedClass)) || selectedClass === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectClass(c.id)}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-[11px] font-extrabold transition-all cursor-pointer select-none touch-manipulation active:scale-95 ${
                    isClsActive
                      ? 'bg-blue-600 text-white shadow-xs scale-[1.02]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scroll Left Button (Desktop/Tablet) */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => handleScroll('left')}
            className="absolute left-28 sm:left-48 z-40 bg-white/95 hover:bg-white text-slate-800 p-1.5 rounded-full shadow-md border border-slate-200 backdrop-blur-sm cursor-pointer transition-all hover:scale-110 active:scale-95 hidden sm:flex items-center justify-center"
            aria-label="Scroll left"
          >
            <ChevronLeft className="w-4 h-4 stroke-[3]" />
          </button>
        )}

        {/* Edge Fade Mask - Left (Mobile & Desktop) */}
        {canScrollLeft && (
          <div className="absolute left-24 sm:left-48 top-0 bottom-0 w-6 sm:w-8 bg-gradient-to-r from-white via-white/80 to-transparent pointer-events-none z-30" />
        )}

        {/* Horizontal Subject Pills Container (Touch Optimized for Mobile) */}
        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1 flex-1 select-none touch-pan-x"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {SUBJECTS.map((s) => {
            const isActive =
              (s.id === 'all' && !searchQuery) ||
              (s.id !== 'all' && searchQuery.toLowerCase() === s.id.toLowerCase());

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectSubject(s.id)}
                className={`px-3 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-extrabold flex items-center gap-1 sm:gap-1.5 transition-all cursor-pointer shrink-0 touch-manipulation active:scale-95 select-none min-h-[34px] ${
                  isActive
                    ? 'bg-[#001E3D] text-amber-300 shadow-md shadow-blue-950/20 ring-2 ring-amber-400/50 scale-[1.02] border border-amber-400/40'
                    : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/90 hover:text-slate-900 border border-slate-200/70 hover:border-slate-300'
                }`}
              >
                <span className="text-xs sm:text-sm">{s.icon}</span>
                <span className="whitespace-nowrap">{s.label}</span>
                {isActive && searchQuery && (
                  <span className="ml-0.5 bg-amber-400/20 text-amber-300 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full font-black">
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Edge Fade Mask - Right (Mobile & Desktop) */}
        {canScrollRight && (
          <div className="absolute right-12 top-0 bottom-0 w-6 sm:w-8 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none z-30" />
        )}

        {/* Scroll Right Button (Desktop/Tablet) */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => handleScroll('right')}
            className="absolute right-14 z-40 bg-white/95 hover:bg-white text-slate-800 p-1.5 rounded-full shadow-md border border-slate-200 backdrop-blur-sm cursor-pointer transition-all hover:scale-110 active:scale-95 hidden sm:flex items-center justify-center"
            aria-label="Scroll right"
          >
            <ChevronRight className="w-4 h-4 stroke-[3]" />
          </button>
        )}

        {/* Reset Filter Button & Active Count Badge */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 ml-auto border-l border-slate-200/90 pl-1.5 sm:pl-2.5">
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-extrabold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md">
              <Sparkles className="w-3 h-3 text-blue-600" />
              {activeProductCount} Guides
            </span>

            <button
              type="button"
              onClick={clearAllFilters}
              className="px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-black text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 flex items-center gap-1 transition-all cursor-pointer shrink-0 active:scale-95 touch-manipulation"
              title="Clear all filters"
            >
              <X className="w-3.5 h-3.5 stroke-[3]" />
              <span>Reset</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
