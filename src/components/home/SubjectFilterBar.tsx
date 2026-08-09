'use client';

import React from 'react';
import { BookMarked, Filter } from 'lucide-react';
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

export const SubjectFilterBar = () => {
  const { searchQuery, setSearchQuery } = useStore();

  const handleSelectSubject = (subjId: string) => {
    if (subjId === 'all') {
      setSearchQuery('');
    } else {
      setSearchQuery(subjId);
    }
    const elem = document.getElementById('products');
    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-white border-y border-slate-200/80 py-3 sticky top-16 z-30 shadow-xs backdrop-blur-md bg-white/90">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth">
        <div className="flex items-center gap-1.5 text-xs font-black text-slate-700 uppercase shrink-0 border-r border-slate-200 pr-3">
          <Filter className="w-3.5 h-3.5 text-blue-600" />
          <span>Filter:</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {SUBJECTS.map((s) => {
            const isActive =
              (s.id === 'all' && !searchQuery) ||
              (s.id !== 'all' && searchQuery.toLowerCase() === s.id.toLowerCase());

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectSubject(s.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 touch-manipulation active:scale-95 ${
                  isActive
                    ? 'bg-[#001B3A] text-amber-400 shadow-sm border border-amber-400/30'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60'
                }`}
              >
                <span>{s.icon}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
