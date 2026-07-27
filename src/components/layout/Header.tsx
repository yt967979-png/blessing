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
    setQuickViewProduct,
  } = useStore();

  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Filter products live for instant search dropdown
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

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 md:gap-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0 group min-w-0 max-w-[55%] sm:max-w-none">
          <BrandLogo size={44} priority className="w-9 h-9 sm:w-11 sm:h-11 shadow-md group-hover:scale-105 transition-transform" />
          <div className="min-w-0">
            <h1 className="font-bold text-xs sm:text-lg text-[#001B3A] tracking-tight leading-tight truncate">
              BLESSING POWER GUIDE
            </h1>
            <p className="text-[9px] sm:text-[10px] text-blue-600 font-semibold tracking-wider uppercase hidden xs:block sm:block truncate">
              Your Success, Our Mission
            </p>
          </div>
        </Link>

        {/* Live Instant Search Bar (Desktop/Tablet) */}
        <div className="flex-1 max-w-xl hidden sm:block relative">
          <div className="flex border-2 border-slate-200 rounded-xl overflow-hidden focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 transition-all bg-white">
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-slate-50 border-r border-slate-200 text-xs font-bold text-slate-700 px-3 py-2 outline-none cursor-pointer"
            >
              <option value="all">All Classes</option>
              <option value="6th">6th Std</option>
              <option value="7th">7th Std</option>
              <option value="8th">8th Std</option>
              <option value="9th">9th Std</option>
              <option value="10th">10th Std</option>
              <option value="11th">11th Std</option>
              <option value="12th">12th Std</option>
            </select>
            <input
              type="text"
              placeholder="Search 6th-12th guides, subjects, model question banks..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => setShowSearchDropdown(true)}
              onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
              className="w-full px-3 py-2 text-xs md:text-sm outline-none bg-transparent"
            />
            <button className="bg-blue-600 hover:bg-[#001B3A] text-white px-4 flex items-center justify-center transition-colors">
              <Search className="w-4 h-4" />
            </button>
          </div>

          {/* Search Instant Dropdown */}
          {showSearchDropdown && searchQuery.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden text-xs">
              {filteredSearch.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {filteredSearch.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        router.push(`/products/${p.slug}`);
                        setShowSearchDropdown(false);
                      }}
                      className="p-3 hover:bg-blue-50/60 cursor-pointer flex items-center gap-3 transition-colors"
                    >
                      <img
                        src={p.image}
                        alt={p.title}
                        className="w-8 h-8 object-contain rounded bg-slate-100 p-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[#001B3A] truncate">{p.title}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.cls} • ₹{p.price}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-blue-600">VIEW</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-slate-500">
                  No matching books found for "{searchQuery}"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-0.5 sm:gap-2 flex-shrink-0">
          {user && user.role === 'admin' && (
            <Link
              href="/admin"
              className="hidden sm:flex bg-[#001B3A] hover:bg-blue-600 text-amber-400 font-extrabold text-[10px] sm:text-[11px] px-2.5 sm:px-3 py-1.5 rounded-xl transition-all shadow-xs items-center gap-1 border border-amber-400/30"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>ADMIN</span>
            </Link>
          )}

          {user ? (
            <Link
              href="/profile"
              className="p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors flex flex-col items-center gap-0.5 min-h-11 min-w-11 justify-center"
              aria-label="Profile"
            >
              <User className="w-5 h-5 text-blue-600" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors flex flex-col items-center gap-0.5 cursor-pointer min-h-11 min-w-11 justify-center"
              aria-label="Login"
            >
              <User className="w-5 h-5 text-slate-700" />
            </button>
          )}

          <Link
            href="/profile"
            className="relative p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors flex flex-col items-center gap-0.5 min-h-11 min-w-11 justify-center"
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
            className="relative p-2.5 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors flex flex-col items-center gap-0.5 cursor-pointer min-h-11 min-w-11 justify-center"
            aria-label="Cart"
          >
            <ShoppingBag className="w-5 h-5 text-slate-700" />
            {cartCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Mobile Touch-Friendly Search Input Bar (Visible on Phones < 640px) */}
      <div className="px-4 pb-2.5 sm:hidden bg-white border-t border-slate-100">
        <div className="relative">
          <div className="flex border border-slate-300 rounded-xl overflow-hidden focus-within:border-blue-600 bg-slate-50">
            <input
              type="text"
              placeholder="Search 6th-12th guides, question banks..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchDropdown(true);
              }}
              onFocus={() => setShowSearchDropdown(true)}
              onBlur={() => setTimeout(() => setShowSearchDropdown(false), 200)}
              className="w-full px-3 py-2 text-xs outline-none bg-transparent"
            />
            <button className="bg-blue-600 text-white px-3 flex items-center justify-center">
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mobile Instant Dropdown */}
          {showSearchDropdown && searchQuery.trim().length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden text-xs">
              {filteredSearch.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {filteredSearch.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        router.push(`/products/${p.slug}`);
                        setShowSearchDropdown(false);
                      }}
                      className="p-2.5 hover:bg-blue-50/60 cursor-pointer flex items-center gap-3 transition-colors"
                    >
                      <img
                        src={p.image}
                        alt={p.title}
                        className="w-8 h-8 object-contain rounded bg-slate-100 p-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[#001B3A] truncate">{p.title}</div>
                        <div className="text-[10px] text-slate-500">
                          {p.cls} • ₹{p.price}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-blue-600">VIEW</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 text-center text-slate-500 text-[11px]">
                  No matching books found
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
