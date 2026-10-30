'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { CLASSES, CLASS_COLORS } from '@/lib/products';
import { useStore } from '@/context/StoreContext';
import {
  GraduationCap,
  BookOpen,
  Sparkles,
  ArrowRight,
  Layers,
  CheckCircle2,
  Truck,
  ShieldCheck,
} from 'lucide-react';

import { getComboIncludedSubjects } from '@/lib/comboMetadata';

function cleanSlug(val?: string | number): string {
  const s = String(val || '').trim().toLowerCase();
  return s.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function imageNeedsUnoptimized(src: string): boolean {
  if (!src) return false;
  if (src.startsWith('data:')) return true;
  if (src.endsWith('.webp') || src.endsWith('.svg') || src.endsWith('.gif')) return true;
  return false;
}

export const ClassPicker = () => {
  const { selectedClass, setSelectedClass, setSelectedCategory, products } = useStore();

  // If no class is explicitly picked or 'all', default to 10th to showcase curriculum
  const activeClass = selectedClass && selectedClass !== 'all' ? selectedClass : '10th';

  const handleSelectClass = (cls: string) => {
    setSelectedClass(cls);
    setSelectedCategory('all');
  };

  // Find products matching the active standard
  const classProducts = useMemo(() => {
    return products.filter((p) => p.cls?.toLowerCase() === activeClass.toLowerCase());
  }, [products, activeClass]);

  // Find the primary featured combo pack for this standard
  const comboProduct = useMemo(() => {
    return (
      classProducts.find((p) => p.category === 'combo') ||
      classProducts.find((p) => Array.isArray(p.images) && p.images.length > 1) ||
      classProducts[0] ||
      null
    );
  }, [classProducts]);

  const targetSlug = comboProduct ? cleanSlug(comboProduct.slug || comboProduct.id) : '';
  const mainCoverUrl = comboProduct?.image || (Array.isArray(comboProduct?.images) ? comboProduct.images[0] : '') || '';

  // Extract separate subject guide covers dynamically from DB
  const subjectGuideCards = useMemo(() => {
    if (!comboProduct) return [];

    const dbImages: string[] = Array.isArray(comboProduct.images)
      ? comboProduct.images.filter((img) => Boolean(img && typeof img === 'string' && !img.startsWith('data:')))
      : [];

    // Filter out the combo cover from subject guides list if distinct
    const subjectCovers = dbImages.filter((img) => img !== comboProduct.image);
    const finalCovers = subjectCovers.length > 0 ? subjectCovers : dbImages;

    // Dynamically retrieve subjects from product's combo_subjects in DB
    const subjects = getComboIncludedSubjects(comboProduct);

    // If there are covers or subjects, pair them up dynamically
    const count = Math.max(finalCovers.length, subjects.length);
    if (count === 0) return [];

    return Array.from({ length: count }, (_, idx) => {
      const sub = subjects[idx] || {
        name: `Subject ${idx + 1}`,
        shortName: `Sub ${idx + 1}`,
        tamilName: '',
        icon: '📖',
        tag: 'Guide',
        color: 'bg-blue-50 text-blue-800 border-blue-200',
        description: 'Complete guide book with solved papers.',
      };

      const coverUrl = finalCovers[idx] || comboProduct.image || '';
      const badge = (sub.shortName || sub.name || `SUBJECT ${idx + 1}`).toUpperCase();
      const tamilTitle = sub.tamilName
        ? (sub.tamilName.includes('வழிகாட்டி') ? sub.tamilName : `${sub.tamilName} வழிகாட்டி`)
        : '';

      return {
        id: `${comboProduct.id}-subj-${idx}`,
        subjectNumber: idx + 1,
        name: sub.name,
        tamilName: tamilTitle,
        badge,
        coverUrl,
        // Cover param: 0 is main box cover, 1..N are subject guides
        href: `/products/${targetSlug}?cover=${idx + 1}`,
      };
    }).filter((card) => Boolean(card.coverUrl));
  }, [comboProduct, targetSlug]);

  return (
    <section className="py-8 sm:py-12 bg-gradient-to-b from-slate-50 via-blue-50/25 to-slate-50 border-t border-slate-200/80">
      <div className="max-w-7xl mx-auto px-4">
        {/* Section Heading */}
        <div className="text-center mb-6 sm:mb-8">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-blue-700 bg-blue-100/80 border border-blue-300/80 px-3.5 py-1 rounded-full inline-flex items-center gap-1.5 mb-2 shadow-2xs">
            <GraduationCap className="w-3.5 h-3.5 text-blue-600" />
            ACADEMIC SELECTION
          </span>
          <h2 className="font-heading font-black text-xl sm:text-3xl md:text-4xl text-[#001226] tracking-tight uppercase">
            SELECT YOUR STANDARD
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1 px-2">
            State Board & CBSE exam preparation guides tailored for 6th–12th standard students
          </p>
        </div>

        {/* 6th - 12th Standard Selector Pills */}
        <div className="flex sm:grid sm:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-4 overflow-x-auto scroll-chips pb-2 -mx-1 px-1 sm:mx-0 sm:px-0 justify-start sm:justify-center mb-8">
          {CLASSES.map((cls) => {
            const isSelected = activeClass === cls;
            return (
              <button
                key={cls}
                type="button"
                onClick={() => handleSelectClass(cls)}
                className={`flex-shrink-0 w-[72px] min-[360px]:w-[78px] sm:w-auto p-2.5 min-[360px]:p-3 sm:p-5 rounded-2xl border text-center touch-manipulation active:scale-95 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer ${
                  CLASS_COLORS[cls]
                } ${
                  isSelected
                    ? 'ring-2 ring-[#0044AA] shadow-md font-bold border-[#0044AA] bg-white scale-[1.03]'
                    : 'bg-white shadow-xs border-slate-200/80 hover:border-blue-300'
                }`}
              >
                <div className="font-heading font-black text-xl min-[360px]:text-2xl sm:text-3xl md:text-4xl leading-none tracking-tight text-slate-900">
                  {cls}
                </div>
                <div className="text-[10px] sm:text-xs font-extrabold text-slate-500 mt-1 uppercase tracking-wider">
                  Std
                </div>
              </button>
            );
          })}
        </div>

        {/* Subject Guides Showcase Display */}
        {subjectGuideCards.length > 0 && comboProduct ? (
          <div className="bg-white rounded-3xl border border-slate-200/90 p-4 sm:p-6 lg:p-8 shadow-md">
            {/* Header above the guides */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center gap-1 shadow-2xs">
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    2026–27 Academic Curriculum
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">•</span>
                  <span className="text-xs font-extrabold text-slate-600">
                    {subjectGuideCards.length} Core Subjects Included
                  </span>
                </div>
                <h3 className="font-heading font-black text-lg sm:text-2xl text-[#001B3A] mt-1.5 tracking-tight">
                  {activeClass} Standard Official Subject Guides Series
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Complete centum-oriented study guides with solved papers & unit test banks
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const elem = document.getElementById('products');
                    if (elem) elem.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 px-3.5 py-2 rounded-xl hover:bg-blue-50 transition-colors cursor-pointer border border-blue-200/60"
                >
                  <span>Explore Full Catalog Below</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Dynamic Subject Guides Cards Row (Mobile: swipe scroll, Desktop: grid) */}
            <div className="flex sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4 overflow-x-auto scroll-chips pb-4 -mx-2 px-2 sm:mx-0 sm:px-0">
              {subjectGuideCards.map((card) => (
                <Link
                  key={card.id}
                  href={card.href}
                  className="group flex-shrink-0 w-44 sm:w-auto bg-slate-50/70 hover:bg-white rounded-2xl border border-slate-200/80 hover:border-blue-400 p-3 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer"
                  title={`View ${card.name} Guide Details`}
                >
                  {/* Top Badge: Number & Subject Name */}
                  <div className="flex items-center justify-between mb-2 gap-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[#001B3A] text-white shadow-2xs shrink-0">
                      #{card.subjectNumber}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 bg-blue-100/80 px-2 py-0.5 rounded-md whitespace-nowrap overflow-hidden text-ellipsis">
                      {card.badge}
                    </span>
                  </div>

                  {/* High-Resolution Subject Guide Cover from DB */}
                  <div className="w-full h-56 sm:h-64 rounded-xl bg-white border border-slate-100 p-2 flex items-center justify-center overflow-hidden shadow-2xs group-hover:shadow-md transition-all">
                    <Image
                      src={card.coverUrl}
                      alt={`${activeClass} Standard ${card.name} Guide — Blessing Power Guide`}
                      width={220}
                      height={300}
                      priority={card.subjectNumber <= 2}
                      className="max-h-full max-w-full object-contain drop-shadow-md transition-transform duration-300 group-hover:scale-105"
                      unoptimized={imageNeedsUnoptimized(card.coverUrl)}
                    />
                  </div>

                  {/* Card Details */}
                  <div className="mt-3">
                    <h4 className="font-heading font-black text-xs text-[#001B3A] group-hover:text-blue-600 transition-colors truncate">
                      {card.name} Guide
                    </h4>
                    {card.tamilName && (
                      <p className="text-[11px] text-slate-500 font-bold truncate mt-0.5">
                        {card.tamilName}
                      </p>
                    )}
                    <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px]">
                      <span className="font-extrabold text-blue-700 group-hover:underline inline-flex items-center gap-1">
                        <span>View Details</span>
                        <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
                      </span>
                      <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded">
                        Centum Guide
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Complete Box Set Showcase Banner (Directly Below Subject Covers) */}
            <div className="mt-6 p-4 sm:p-6 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-purple-50/70 border border-blue-200/90 shadow-xs">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                {/* 3D Combo Book Cover Preview */}
                <div className="md:col-span-3 flex justify-center">
                  <Link
                    href={`/products/${targetSlug}?cover=0`}
                    className="group relative w-36 sm:w-44 aspect-[4/5] rounded-xl bg-white border border-slate-200 p-2 flex items-center justify-center overflow-hidden shadow-md hover:shadow-xl transition-all cursor-pointer hover:scale-102"
                    title={`View ${comboProduct.title} Cover`}
                  >
                    <div className="absolute top-1.5 left-1.5 z-10 flex flex-col gap-0.5">
                      <span className="text-[8.5px] font-black uppercase tracking-wider bg-[#001B3A] text-white px-1.5 py-0.5 rounded shadow-xs inline-flex items-center gap-1">
                        <Layers className="w-2.5 h-2.5 text-blue-400" />
                        <span>{subjectGuideCards.length > 1 ? `${subjectGuideCards.length} In 1` : 'Box Set'}</span>
                      </span>
                      <span className="text-[8px] font-black uppercase tracking-wider bg-amber-500 text-white px-1.5 py-0.2 rounded shadow-2xs">
                        Best Seller
                      </span>
                    </div>

                    {mainCoverUrl ? (
                      <Image
                        src={mainCoverUrl}
                        alt={`${comboProduct.title} Cover`}
                        width={180}
                        height={225}
                        className="max-h-full max-w-full object-contain drop-shadow-md group-hover:scale-105 transition-transform"
                        unoptimized={imageNeedsUnoptimized(mainCoverUrl)}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400">
                        <BookOpen className="w-10 h-10" />
                      </div>
                    )}
                  </Link>
                </div>

                {/* Box Set Description & Trust Perks */}
                <div className="md:col-span-6 flex flex-col justify-center text-center md:text-left">
                  <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200">
                      Official {subjectGuideCards.length > 1 ? `${subjectGuideCards.length}-in-1 ` : ''}Box Set
                    </span>
                  </div>

                  <h4 className="font-heading font-black text-base sm:text-lg text-[#001B3A] leading-tight">
                    Complete {comboProduct.title}
                  </h4>

                  <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                    {comboProduct.description || 'Receive all printed subject guide books with free ST Courier doorstep delivery across Tamil Nadu.'}
                  </p>

                  <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-slate-700 font-semibold text-left">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>All {subjectGuideCards.length > 0 ? subjectGuideCards.length : 'Core'} Books in 1 Pack</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>FREE Doorstep Delivery</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Solved Question Banks</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span>100% Genuine Publisher</span>
                    </div>
                  </div>
                </div>

                {/* Pricing & CTA Button */}
                <div className="md:col-span-3 flex flex-col items-center md:items-end justify-center pt-2 md:pt-0 border-t md:border-t-0 md:border-l border-blue-200/80 md:pl-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Complete Box Set Price
                  </div>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="font-heading font-black text-2xl text-[#001B3A]">
                      ₹{comboProduct.price}
                    </span>
                    {comboProduct.mrp && comboProduct.mrp > comboProduct.price && (
                      <span className="text-xs font-bold text-slate-400 line-through">
                        ₹{comboProduct.mrp}
                      </span>
                    )}
                  </div>
                  {comboProduct.mrp && comboProduct.mrp > comboProduct.price && (
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded mt-1">
                      SAVE ₹{comboProduct.mrp - comboProduct.price} ({Math.round(((comboProduct.mrp - comboProduct.price) / comboProduct.mrp) * 100)}% OFF)
                    </span>
                  )}

                  <Link
                    href={`/products/${targetSlug}`}
                    className="w-full mt-3 px-5 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-[#001B3A] font-black text-xs shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5 uppercase tracking-wider cursor-pointer min-h-12"
                  >
                    <span>Order {subjectGuideCards.length > 1 ? `${subjectGuideCards.length}-in-1 ` : ''}Set</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>

                  <Link
                    href={`/products/${targetSlug}`}
                    className="text-[11px] font-bold text-blue-700 hover:underline mt-2 flex items-center gap-1"
                  >
                    <span>View all {subjectGuideCards.length > 0 ? subjectGuideCards.length : ''} books inside</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Friendly Coming Soon state for standards without live books yet */
          <div className="bg-white rounded-3xl border border-dashed border-slate-300 p-8 text-center max-w-xl mx-auto shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-black text-base text-[#001B3A]">
              Class {activeClass} Standard Editions In Print (2026–27)
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1 mb-4">
              The newly revised syllabus editions for {activeClass} Standard are currently in final binding and press. Orders will open shortly.
            </p>
            <button
              type="button"
              onClick={() => handleSelectClass('10th')}
              className="px-4 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-extrabold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Explore Available 10th Standard Guides</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
