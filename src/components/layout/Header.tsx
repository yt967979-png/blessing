'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Heart, ShoppingBag, User, ShieldCheck } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { BrandLogo } from '@/components/ui/BrandLogo';

export const Header = () => {
  const router = useRouter();
  const {
    products,
    wishlist,
    cartCount,
    searchQuery,
    setSearchQuery,
    selectedClass,
    setSelectedClass,
    setIsAuthOpen,
    user,
  } = useStore();

  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  const queryText = (searchQuery || '').trim();
  const filteredSearch = queryText
    ? products
        .filter(
          (p) =>
            p.inStock &&
            (p.title.toLowerCase().includes(queryText.toLowerCase()) ||
              p.cls.toLowerCase().includes(queryText.toLowerCase()) ||
              p.subject.toLowerCase().includes(queryText.toLowerCase()))
        )
        .slice(0, 5)
    : [];

  const goSearch = () => {
    if (!searchQuery.trim()) return;
    router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    setShowSearchDropdown(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm mobile-no-blur md:bg-white/95 md:backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 flex-shrink-0 group min-w-0 max-w-[58%] sm:max-w-none"
        >
          <BrandLogo
            size={40}
            priority
            className="w-9 h-9 sm:w-11 sm:h-11 shadow-md"
          />
          <div className="min-w-0">
            <h1 className="font-heading font-bold text-[11px] sm:text-lg text-[#001B3A] tracking-tight leading-tight truncate">
              BLESSING POWER GUIDE
            </h1>
            <p className="text-[9px] text-blue-600 font-semibold tracking-wider uppercase hidden sm:block truncate">
              Your Success, Our Mission
            </p>
          </div>
        </Link>

        {/* Desktop search */}
        <div className="flex-1 max-w-xl hidden sm:block relative">
          <div className="flex border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-blue-600 bg-white">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-slate-50 border-r border-slate-200 text-xs font-bold text-slate-700 px-3 py-2 outline-none cursor-pointer"
            >
              <option value="all">All Classes</option>
              {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => (
                <option key={c} value={c}>
                  {c} Std
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search guides, subjects…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => setShowSearchDropdown(true)}
              onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
              className="w-full px-3 py-2 text-sm outline-none bg-transparent"
            />
            <button
              type="button"
              onClick={goSearch}
              className="bg-blue-600 hover:bg-[#001B3A] text-white px-4 flex items-center justify-center"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          {showSearchDropdown && queryText.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden text-xs">
              {filteredSearch.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {filteredSearch.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        router.push(`/products/${p.slug}`);
                        setShowSearchDropdown(false);
                      }}
                      className="w-full p-3 hover:bg-blue-50/60 cursor-pointer flex items-center gap-3 text-left"
                    >
                      <img
                        src={p.image}
                        alt=""
                        className="w-8 h-8 object-contain rounded bg-slate-100 p-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[#001B3A] truncate">{p.title}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.cls} • ₹{p.price}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-slate-500">No matching books found</div>
              )}
            </div>
          )}
        </div>

        {/* Actions — cart/profile live in bottom nav on mobile */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {user && user.role === 'admin' && (
            <Link
              href="/admin"
              className="hidden sm:flex bg-[#001B3A] text-amber-400 font-extrabold text-[11px] px-3 py-1.5 rounded-xl items-center gap-1 border border-amber-400/30"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              ADMIN
            </Link>
          )}

          <Link
            href={user ? '/profile' : '#'}
            onClick={(e) => {
              if (!user) {
                e.preventDefault();
                setIsAuthOpen(true);
              }
            }}
            className="hidden sm:flex p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 min-h-11 min-w-11 items-center justify-center"
            aria-label={user ? 'Profile' : 'Login'}
          >
            <User className="w-5 h-5 text-blue-600" />
          </Link>

          <Link
            href="/wishlist"
            className="relative hidden sm:flex p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 min-h-11 min-w-11 items-center justify-center"
            aria-label="Wishlist"
          >
            <Heart
              className={`w-5 h-5 ${
                wishlist.length > 0 ? 'text-red-500 fill-red-500' : 'text-slate-700'
              }`}
            />
            {wishlist.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center">
                {wishlist.length}
              </span>
            )}
          </Link>

          <Link
            href="/cart"
            className="relative hidden sm:flex p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 min-h-11 min-w-11 items-center justify-center"
            aria-label="Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Mobile search — single clean bar */}
      <div className="px-3 pb-2.5 sm:hidden">
        <div className="relative">
          <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-slate-50 focus-within:border-blue-600 focus-within:bg-white">
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Search 10th, 12th guides…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') goSearch();
              }}
              onFocus={() => setShowSearchDropdown(true)}
              onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
              className="w-full pl-3 pr-2 py-2.5 text-base outline-none bg-transparent min-h-[44px]"
            />
            <button
              type="button"
              onClick={goSearch}
              className="bg-blue-600 text-white px-3.5 flex items-center justify-center touch-manipulation"
              aria-label="Search"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>

          {showSearchDropdown && queryText.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden text-xs max-h-[50vh] overflow-y-auto">
              {filteredSearch.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {filteredSearch.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        router.push(`/products/${p.slug}`);
                        setShowSearchDropdown(false);
                      }}
                      className="w-full p-3 active:bg-blue-50 flex items-center gap-3 text-left touch-manipulation"
                    >
                      <img
                        src={p.image}
                        alt=""
                        className="w-9 h-9 object-contain rounded bg-slate-100 p-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[#001B3A] truncate">{p.title}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.cls} • ₹{p.price}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-center text-slate-500 text-[11px]">No matching books</div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
