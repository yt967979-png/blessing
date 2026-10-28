'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Home, BookOpen, Truck, MessageCircle, ArrowRight } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';

export default function NotFound() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push('/search');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-12 sm:py-16 flex flex-col items-center justify-center text-center">
        {/* Visual Badge & Logo */}
        <div className="relative mb-6">
          <div className="w-24 h-24 rounded-3xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto shadow-inner">
            <BrandLogo size={56} className="w-14 h-14" />
          </div>
          <span className="absolute -bottom-2 -right-2 bg-amber-400 text-[#001B3A] text-xs font-black px-2.5 py-1 rounded-full shadow-md border border-amber-300">
            404
          </span>
        </div>

        {/* Headings */}
        <p className="text-xs font-bold text-amber-700 tracking-wider uppercase mb-1.5">
          Page Not Found
        </p>
        <h1 className="font-heading font-black text-2xl sm:text-4xl text-[#001B3A] mb-3 tracking-tight">
          Oops! This Page Has Gone Missing
        </h1>
        <p className="text-sm text-slate-600 max-w-lg mb-8 leading-relaxed">
          The guide book or page you are looking for may have moved, been renamed, or is temporarily unavailable. Let&apos;s get you back on track.
        </p>

        {/* Working Search Bar */}
        <form onSubmit={handleSearch} className="w-full max-w-md mb-6 relative">
          <input
            type="text"
            placeholder="Search 10th guides, subjects, combos..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-11 pr-24 py-3.5 bg-white border border-slate-300 rounded-2xl text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none focus:border-[#2874f0] focus:ring-2 focus:ring-blue-100 transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-4 py-2 bg-[#001B3A] hover:bg-blue-900 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Search
          </button>
        </form>

        {/* Quick Suggestion Chips */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-8 max-w-md">
          <span className="text-[11px] font-semibold text-slate-400">Popular:</span>
          <Link
            href="/search?q=combo"
            className="text-[11px] font-semibold bg-white border border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600 px-3 py-1 rounded-lg transition-colors"
          >
            🎁 10th Combo Pack
          </Link>
          <Link
            href="/search?class=10th"
            className="text-[11px] font-semibold bg-white border border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600 px-3 py-1 rounded-lg transition-colors"
          >
            📚 10th Standard Guides
          </Link>
          <Link
            href="/track"
            className="text-[11px] font-semibold bg-white border border-slate-200 hover:border-blue-400 text-slate-700 hover:text-blue-600 px-3 py-1 rounded-lg transition-colors flex items-center gap-1"
          >
            <Truck className="w-3 h-3 text-amber-500" /> Track Order
          </Link>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md mb-8">
          <Link
            href="/"
            className="flex-1 bg-[#001B3A] hover:bg-blue-900 active:scale-98 text-white font-bold text-xs py-3.5 px-6 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer min-h-12"
          >
            <Home className="w-4 h-4" />
            Return to Home
          </Link>
          <Link
            href="/search"
            className="flex-1 bg-amber-400 hover:bg-amber-500 active:scale-98 text-[#001B3A] font-extrabold text-xs py-3.5 px-6 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer min-h-12 border border-amber-300"
          >
            <BookOpen className="w-4 h-4" />
            Explore Our Books
          </Link>
        </div>

        {/* Reassurance & Support Helpline */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl max-w-md w-full shadow-2xs text-left flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-slate-800">Looking for a specific guide?</p>
            <p className="text-[11px] text-slate-500">Contact our student helpline on WhatsApp</p>
          </div>
          <a
            href="https://wa.me/919486017820?text=Hi%20Blessing%20Power%20Guide%2C%20I%20am%20looking%20for%20a%20book%20on%20your%20website"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
            WhatsApp
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
