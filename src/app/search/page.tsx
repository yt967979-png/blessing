'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, Filter, BookOpen, Sparkles, ArrowLeft, RefreshCcw, SlidersHorizontal } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { ProductCard } from '@/components/ui/ProductCard';
import { ProductCardSkeletonGrid } from '@/components/ui/ProductCardSkeleton';
import { useStore } from '@/context/StoreContext';

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryParam = searchParams.get('q') || '';
  const classParam = searchParams.get('class') || 'all';
  const categoryParam = searchParams.get('category') || 'all';

  const { products, productsLoading } = useStore();

  const [searchTerm, setSearchTerm] = useState(queryParam);
  const [selectedClass, setSelectedClass] = useState(classParam);
  const [selectedCategory, setSelectedCategory] = useState(categoryParam);
  const [maxPrice, setMaxPrice] = useState<number>(1000);
  const [sortBy, setSortBy] = useState<'relevance' | 'price-low' | 'price-high' | 'discount'>('relevance');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    setSearchTerm(queryParam);
    setSelectedClass(classParam);
    setSelectedCategory(categoryParam);
  }, [queryParam, classParam, categoryParam]);

  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      if (!p.inStock) return false;

      // Class Filter
      if (selectedClass !== 'all' && p.cls?.toLowerCase() !== selectedClass.toLowerCase()) {
        return false;
      }

      // Category Filter
      if (selectedCategory !== 'all' && p.category?.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
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
        if (!matchTitle && !matchSubject && !matchClass) return false;
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
    setMaxPrice(1000);
    setSortBy('relevance');
    router.push('/search');
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 page-mobile-nav" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AnnouncementBar />
      <Header />
      <NavBar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-6">
          <button onClick={() => router.push('/')} className="hover:text-blue-600 flex items-center gap-1 cursor-pointer">
            <ArrowLeft className="w-3.5 h-3.5" /> Home
          </button>
          <span>/</span>
          <span className="font-semibold text-slate-800">Search Catalog</span>
        </div>

        {/* Top Search Input Box */}
        <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-xs mb-8">
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
                  { id: 'all', label: 'All Products' },
                  { id: 'guide', label: 'Single Subject Guides' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-blue-50 text-[#2874f0] font-bold border border-blue-200'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Price Filter */}
            <div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-700 mb-2">
                <span>Max Price</span>
                <span className="text-[#2874f0]">₹{maxPrice}</span>
              </div>
              <input
                type="range"
                min={100}
                max={1000}
                step={20}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-[#2874f0] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-semibold">
                <span>₹100</span>
                <span>₹1,000</span>
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
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
                <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto border border-blue-100">
                  <BookOpen className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">No Matching Guide Books Found</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Try adjusting your search keywords, clearing standard filters, or resetting the price range slider.
                  </p>
                </div>
                <button
                  onClick={resetFilters}
                  className="px-4 py-2 bg-[#2874f0] text-white font-semibold text-xs rounded-xl shadow-xs hover:bg-blue-600 transition-colors cursor-pointer"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
