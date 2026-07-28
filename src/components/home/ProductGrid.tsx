'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, Sparkles, Filter } from 'lucide-react';
import { ProductCard } from '@/components/ui/ProductCard';
import { useStore } from '@/context/StoreContext';

export const ProductGrid = () => {
  const {
    products,
    productsLoading,
    searchQuery,
    selectedClass,
    selectedCategory,
    setSelectedClass,
    setSelectedCategory,
    setSearchQuery,
  } = useStore();

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Hide out-of-stock products from storefront
      if (!product.inStock) return false;

      const clsFilter = (selectedClass || 'all').toLowerCase();
      const catFilter = (selectedCategory || 'all').toLowerCase();

      if (clsFilter !== 'all' && product.cls?.toLowerCase() !== clsFilter) return false;
      if (catFilter !== 'all' && product.category?.toLowerCase() !== catFilter) return false;
      if (
        searchQuery &&
        !product.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !product.subject?.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      return true;
    });
  }, [products, selectedClass, selectedCategory, searchQuery]);

  return (
    <section id="products" className="py-12 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">
                Official Catalog
              </span>
            </div>
            <h2 className="font-heading font-black text-2xl md:text-3xl text-[#001B3A] tracking-tight">
              FEATURED STUDY GUIDES
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {filteredProducts.length} Guide Books in Catalog
            </p>
          </div>

          {/* Filter Pills — horizontal scroll on mobile */}
          <div className="flex flex-nowrap sm:flex-wrap items-center gap-2 overflow-x-auto scroll-chips w-full sm:w-auto pb-1 -mx-1 px-1">
            <button
              onClick={() => {
                setSelectedClass('all');
                setSelectedCategory('all');
                setSearchQuery('');
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all shrink-0 min-h-[40px] ${
                selectedClass === 'all' && selectedCategory === 'all' && !searchQuery
                  ? 'bg-[#001B3A] text-amber-400 shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Books
            </button>

            {['6th', '8th', '10th', '12th'].map((cls) => (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all shrink-0 min-h-[40px] ${
                  selectedClass === cls
                    ? 'bg-[#001B3A] text-amber-400 shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cls} Std
              </button>
            ))}

            <button
              onClick={() => setSelectedCategory('combo')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all shrink-0 min-h-[40px] ${
                selectedCategory === 'combo'
                  ? 'bg-[#001B3A] text-amber-400 shadow-md'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Combos
            </button>
          </div>
        </div>

        {/* Grid or Clean Empty State */}
        {productsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 bg-white p-3 h-72 animate-pulse">
                <div className="h-40 bg-slate-100 rounded-xl mb-3" />
                <div className="h-3 bg-slate-100 rounded w-2/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-1/2 mb-4" />
                <div className="h-10 bg-slate-100 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center bg-slate-50/70 border border-dashed border-slate-300 rounded-2xl p-8 max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-200">
              <BookOpen className="w-8 h-8" />
            </div>
            <h3 className="font-heading font-black text-xl text-[#001B3A] mb-1">
              Catalog is Ready for Books
            </h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto mb-6 leading-relaxed">
              No books match the selected filter right now. Check back soon or browse all classes.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => {
                  setSelectedClass('all');
                  setSelectedCategory('all');
                  setSearchQuery('');
                }}
                className="bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition-colors shadow-sm"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
