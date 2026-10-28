'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Filter, BookOpen, Sparkles, ArrowLeft, RefreshCcw, SlidersHorizontal } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { ProductCard } from '@/components/ui/ProductCard';
import { ProductCardSkeletonGrid } from '@/components/ui/ProductCardSkeleton';
import { useStore } from '@/context/StoreContext';
import { isComboItem } from '@/lib/deliveryRules';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryParam = searchParams.get('q') || '';
  const classParam = searchParams.get('class') || 'all';
  const categoryParam = searchParams.get('category') || 'all';

  const { products, productsLoading } = useStore();

  const highestCatalogPrice = useMemo(() => {
    if (!products || products.length === 0) return 3000;
    const max = Math.max(...products.map((p) => p.price || 0));
    return Math.max(3000, Math.ceil(max / 500) * 500);
  }, [products]);

  const [searchTerm, setSearchTerm] = useState(queryParam);
  const [selectedClass, setSelectedClass] = useState(classParam);
  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [maxPrice, setMaxPrice] = useState<number>(3000);
  const [userChangedPrice, setUserChangedPrice] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'price-low' | 'price-high' | 'discount'>('relevance');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    setSearchTerm(queryParam);
    setSelectedClass(classParam);
    setSelectedCategory(categoryParam);
  }, [queryParam, classParam, categoryParam]);

  useEffect(() => {
    if (!userChangedPrice && highestCatalogPrice > 0) {
      setMaxPrice(highestCatalogPrice);
    }
  }, [highestCatalogPrice, userChangedPrice]);

  const categoryCounts = useMemo(() => {
    const total = products.length;
    let combos = 0;
    let guides = 0;
    for (const p of products) {
      if (isComboItem(p)) combos++;
      else guides++;
    }
    return { all: total, combo: combos, guide: guides };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const result = products.filter((p) => {
      // Keep OOS visible (grey card) — same as home Featured grid

      // Class Filter
      if (selectedClass !== 'all' && p.cls?.toLowerCase() !== selectedClass.toLowerCase()) {
        return false;
      }

      // Category Filter (Combo vs Single Guides vs Specific)
      if (selectedCategory !== 'all') {
        const isCombo = isComboItem(p);
        if (selectedCategory === 'combo' && !isCombo) {
          return false;
        }
        if (selectedCategory === 'guide' && isCombo) {
          return false;
        }
        if (
          selectedCategory !== 'combo' &&
          selectedCategory !== 'guide' &&
          p.category?.toLowerCase() !== selectedCategory.toLowerCase() &&
          (p as { category_id?: string }).category_id !== selectedCategory
        ) {
          return false;
        }
      }

      // Max Price Filter
      if (p.price > maxPrice) {
        return false;
      }

      // Search Query Filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchSubject = p.subject?.toLowerCase().includes(q) || false;
        const matchClass = p.cls?.toLowerCase().includes(q) || false;
        const matchComboSub =
          isComboItem(p) &&
          Array.isArray(p.comboSubjects) &&
          p.comboSubjects.some((sub) => sub.toLowerCase().includes(q));
        const matchCategory =
          p.category?.toLowerCase().includes(q) ||
          ((q.includes('combo') ||
            q.includes('all in one') ||
            q.includes('all-in-one') ||
            q.includes('all in 1') ||
            q.includes('full set') ||
            q.includes('box set') ||
            q.includes('5 in 1') ||
            q.includes('6 in 1')) &&
            isComboItem(p));
        if (!matchTitle && !matchSubject && !matchClass && !matchCategory && !matchComboSub) return false;
      }

      return true;
    });

    // Sorting
    if (sortBy === 'price-low') {
      result.sort((a, b) => a.price - b.price);
    } else if (sortBy === 'price-high') {
      result.sort((a, b) => b.price - a.price);
    } else if (sortBy === 'discount') {
      result.sort((a, b) => (b.discount || 0) - (a.discount || 0));
    }

    return result;
  }, [products, searchTerm, selectedClass, selectedCategory, maxPrice, sortBy]);

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedClass('all');
    setSelectedCategory('all');
    setMaxPrice(highestCatalogPrice);
    setUserChangedPrice(false);
    setSortBy('relevance');
    router.push('/search');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 page-mobile-nav">
      <AnnouncementBar />
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-4 sm:mb-6">
          <button onClick={() => router.push('/')} className="hover:text-blue-600 flex items-center gap-1 cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </button>
          <span>/</span>
          <span className="font-semibold text-slate-800">Search Catalog</span>
        </div>

        {/* Desktop/tablet search — phones use header search bar */}
        <div className="hidden sm:block bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs mb-8">
          <div className="relative max-w-2xl mx-auto">
            <Search className="w-5 h-5 absolute left-4 top-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by book title, standard (10th, 12th), or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-28 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:border-[#2874f0] focus:bg-white transition-all shadow-inner"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-3 text-xs text-slate-400 hover:text-slate-600 font-bold bg-slate-200 px-2 py-1 rounded-md"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Mobile filter toggle */}
          <button
            type="button"
            onClick={() => setShowMobileFilters((v) => !v)}
            className="lg:hidden flex items-center justify-center gap-2 w-full py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 shadow-xs touch-target"
          >
            <Filter className="w-4 h-4 text-[#2874f0]" />
            {showMobileFilters ? 'Hide Filters' : 'Show Filters & Sort'}
          </button>

          {/* Sidebar Filters */}
          <aside
            className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-xs h-fit space-y-6 ${
              showMobileFilters ? 'block' : 'hidden lg:block'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#2874f0]" /> Filters
              </h3>
              <button
                onClick={resetFilters}
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
              >
                <RefreshCcw className="w-3 h-3" /> Reset
              </button>
            </div>

            {/* Class Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Class Standard</label>
              <div className="flex flex-wrap gap-1.5">
                {['all', '6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((cls) => (
                  <button
                    key={cls}
                    onClick={() => setSelectedClass(cls)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                      selectedClass === cls
                        ? 'bg-[#2874f0] text-white border-[#2874f0] shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {cls === 'all' ? 'All Classes' : `${cls} Std`}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Category</label>
              <div className="space-y-1.5">
                {[
                  { id: 'all', label: 'All Products', count: categoryCounts.all },
                  { id: 'combo', label: '🎁 All-in-1 Combo Packs', count: categoryCounts.combo },
                  { id: 'guide', label: 'Single Subject Guides', count: categoryCounts.guide },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-blue-50 text-[#2874f0] font-bold border border-blue-200'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                        selectedCategory === cat.id
                          ? 'bg-[#2874f0] text-white'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {cat.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Price Filter */}
            <div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-2">
                <span>Max Price</span>
                <span className="text-[#2874f0] font-bold">₹{maxPrice.toLocaleString('en-IN')}</span>
              </div>
              <input
                type="range"
                min={0}
                max={highestCatalogPrice}
                step={50}
                value={maxPrice}
                onChange={(e) => {
                  setUserChangedPrice(true);
                  setMaxPrice(Number(e.target.value));
                }}
                className="w-full accent-[#2874f0] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-semibold">
                <span>₹0</span>
                <span>₹{highestCatalogPrice.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </aside>

          {/* Results Main Grid */}
          <div className="lg:col-span-3 space-y-4">
            {/* Top Bar: Count & Sort */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div>
                <h1 className="text-base font-bold text-slate-900">
                  {searchTerm ? `Search results for "${searchTerm}"` : 'All Study Guides'}
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Showing {filteredProducts.length} result(s)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-[#2874f0]"
                >
                  <option value="relevance">Relevance</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="discount">Biggest Discount</option>
                </select>
              </div>
            </div>

            {/* Products Grid — skeleton until catalog hydrates; never blank white */}
            {productsLoading && products.length === 0 ? (
              <ProductCardSkeletonGrid count={8} />
            ) : filteredProducts.length === 0 ? (
              <div className="space-y-8">
                <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center space-y-5 shadow-2xs">
                  <div className="w-16 h-16 bg-blue-50 text-[#0044AA] rounded-2xl flex items-center justify-center mx-auto border border-blue-200/80 shadow-inner">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-heading font-black text-slate-900 text-lg sm:text-xl">
                      No Matching Guide Books Found
                    </h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                      We couldn&apos;t find any books matching your exact search. Try selecting a popular topic or reset your filters.
                    </p>
                  </div>

                  {/* Popular quick chips */}
                  <div className="flex flex-wrap items-center justify-center gap-2 max-w-md mx-auto pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedClass('all');
                        setSelectedCategory('all');
                      }}
                      className="text-[11px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      📚 All Guides
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('Combo');
                        setSelectedClass('all');
                        setSelectedCategory('combo');
                      }}
                      className="text-[11px] font-bold bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      🎁 10th Combo Pack
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setSelectedClass('10th');
                        setSelectedCategory('all');
                      }}
                      className="text-[11px] font-bold bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-800 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Class 10 (SSLC)
                    </button>
                  </div>

                  <div>
                    <button
                      onClick={resetFilters}
                      className="px-6 py-2.5 bg-[#001B3A] hover:bg-blue-900 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      Reset All Filters
                    </button>
                  </div>
                </div>

                {/* Popular Books Fallback Shelf */}
                {products && products.length > 0 && (
                  <div>
                    <h4 className="font-heading font-black text-sm text-slate-900 mb-3">
                      Recommended Tamil Nadu State Board Guides
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4">
                      {products
                        .filter((p) => p.inStock !== false)
                        .slice(0, 4)
                        .map((product) => (
                          <ProductCard key={product.id} product={product} />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8fafc] page-mobile-nav">
          <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6">
            <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse mb-4" />
            <ProductCardSkeletonGrid count={8} />
          </div>
        </div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
