'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Compass, BookOpen, ShoppingBag, ArrowRight, Sparkles, Check, Eye } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { openSamplePdfModal } from '@/components/books/SampleChapterReaderModal';

const CLASSES = ['6th', '7th', '8th', '9th', '10th', '11th', '12th'];

const SUBJECTS_BY_CLASS: Record<string, string[]> = {
  '6th': ['Tamil', 'English', 'Mathematics', 'Science', 'Social Science'],
  '7th': ['Tamil', 'English', 'Mathematics', 'Science', 'Social Science'],
  '8th': ['Tamil', 'English', 'Mathematics', 'Science', 'Social Science'],
  '9th': ['Tamil', 'English', 'Mathematics', 'Science', 'Social Science'],
  '10th': ['Tamil', 'English', 'Mathematics', 'Science', 'Social Science'],
  '11th': ['Tamil', 'English', 'Physics', 'Chemistry', 'Biology', 'Mathematics'],
  '12th': ['Tamil', 'English', 'Physics', 'Chemistry', 'Biology', 'Mathematics'],
};

export const ExamPrepCompass: React.FC = () => {
  const { products, addToCart } = useStore();
  const [selectedClass, setSelectedClass] = useState<string>('10th');
  const [selectedSubject, setSelectedSubject] = useState<string>('Tamil');

  const availableSubjects = useMemo(() => {
    return SUBJECTS_BY_CLASS[selectedClass] || SUBJECTS_BY_CLASS['10th'];
  }, [selectedClass]);

  // Match book from store catalog
  const matchedBook = useMemo(() => {
    if (!products || products.length === 0) return null;
    const clsLower = selectedClass.toLowerCase();
    const subLower = selectedSubject.toLowerCase();

    // 1. Direct class & subject match
    const exact = products.find(
      (b: any) =>
        (b.cls?.toLowerCase() === clsLower || b.title.toLowerCase().includes(clsLower)) &&
        (b.subject?.toLowerCase().includes(subLower) || b.title.toLowerCase().includes(subLower))
    );
    if (exact) return exact;

    // 2. Class match
    const classOnly = products.find(
      (b: any) => b.cls?.toLowerCase() === clsLower || b.title.toLowerCase().includes(clsLower)
    );
    return classOnly || products[0];
  }, [products, selectedClass, selectedSubject]);

  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    const validSubs = SUBJECTS_BY_CLASS[cls] || [];
    if (!validSubs.includes(selectedSubject)) {
      setSelectedSubject(validSubs[0] || 'Tamil');
    }
  };

  const handleOpenSample = () => {
    if (!matchedBook) return;
    openSamplePdfModal({
      title: matchedBook.title,
      pdfUrl: matchedBook.samplePdfUrl || '/uploads/samples/sample-1789880962433-hztl1x.pdf',
      price: matchedBook.price,
      mrp: matchedBook.mrp,
      bookId: String(matchedBook.id),
      coverImage: matchedBook.image,
      cls: matchedBook.cls,
    });
  };

  const handleAddToCart = () => {
    if (!matchedBook) return;
    addToCart(matchedBook);
  };

  return (
    <section className="py-12 bg-gradient-to-b from-slate-900 to-slate-950 text-white relative overflow-hidden border-y border-slate-800">
      {/* Background Glow Accents */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold mb-3">
            <Compass className="w-3.5 h-3.5" />
            <span>Interactive Exam Prep Finder</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Find Your Exact Standard & Subject Guide
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            1-Click instant match for Tamil Nadu State Board & Samacheer Kalvi school students.
          </p>
        </div>

        {/* Step 1: Standard / Class Pills */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 text-center">
            Step 1: Choose Your Class
          </label>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {CLASSES.map((cls) => {
              const active = selectedClass === cls;
              return (
                <button
                  key={cls}
                  onClick={() => handleClassChange(cls)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105 border border-blue-400'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700'
                  }`}
                >
                  Class {cls}
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Subject Pills */}
        <div className="mb-8">
          <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 text-center">
            Step 2: Choose Subject
          </label>
          <div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl mx-auto">
            {availableSubjects.map((sub) => {
              const active = selectedSubject === sub;
              return (
                <button
                  key={sub}
                  onClick={() => setSelectedSubject(sub)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    active
                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-bold'
                      : 'bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>
        </div>

        {/* Matching Result Showcase Card */}
        {matchedBook ? (
          <div className="max-w-2xl mx-auto bg-slate-900/90 border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-2xl backdrop-blur-xl animate-fade-in">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative w-32 h-44 sm:w-36 sm:h-48 shrink-0 bg-slate-800 rounded-xl overflow-hidden shadow-lg border border-slate-700">
                <Image
                  src={matchedBook.image || '/logo.png'}
                  alt={matchedBook.title}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 128px, 144px"
                />
                <span className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-xs">
                  {selectedClass} Std
                </span>
              </div>

              <div className="flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Official 2026 Edition
                  </span>
                  <span className="text-[11px] text-slate-400">Doorstep Delivery in 24-48h</span>
                </div>

                <h3 className="text-lg font-bold text-white leading-snug">{matchedBook.title}</h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                  Complete Tamil Nadu State Board guide with chapter notes, book back solutions & solved question bank.
                </p>

                <div className="flex items-baseline justify-center sm:justify-start gap-2.5 mt-3">
                  <span className="text-2xl font-black text-white">₹{matchedBook.price}</span>
                  {matchedBook.mrp && matchedBook.mrp > matchedBook.price && (
                    <span className="text-sm text-slate-500 line-through">₹{matchedBook.mrp}</span>
                  )}
                  {matchedBook.discount > 0 && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {matchedBook.discount}% OFF
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 mt-5">
                  <button
                    onClick={handleAddToCart}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Add to Cart
                  </button>
                  <button
                    onClick={handleOpenSample}
                    className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    Read Sample PDF
                  </button>
                  <Link
                    href={`/products/${matchedBook.slug || matchedBook.id}`}
                    className="px-3 py-2.5 text-xs text-slate-400 hover:text-white transition flex items-center gap-1 font-medium"
                  >
                    Details <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
