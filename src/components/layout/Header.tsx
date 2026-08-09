'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Search, Heart, ShoppingBag, User, Bell, CheckCheck, RefreshCw } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { useCartBadgeBump } from '@/hooks/useCartBadgeBump';
import { authHeaders } from '@/lib/clientAuth';

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
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const cartBump = useCartBadgeBump(cartCount);

  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [notificationsList, setNotificationsList] = useState<any[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/notifications', { headers: authHeaders(user) });
      if (res.ok) {
        const data = await res.json();
        setNotificationsList(data.notifications || []);
        setUnreadNotifCount(data.unreadCount || 0);
      }
    } catch {
      /* best-effort */
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const timer = setInterval(fetchNotifications, 20000);
      return () => clearInterval(timer);
    } else {
      setNotificationsList([]);
      setUnreadNotifCount(0);
    }
  }, [user]);

  const handleMarkAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: authHeaders(user, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ markAllRead: true }),
      });
      setUnreadNotifCount(0);
      setNotificationsList((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      /* best-effort */
    }
  };

  useEffect(() => {
    setLocalQuery(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(localQuery), 160);
    return () => clearTimeout(t);
  }, [localQuery, setSearchQuery]);

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
        .slice(0, 6)
    : [];

  const goSearch = () => {
    const q = localQuery.trim() || searchQuery.trim();
    if (!q) return;
    setSearchQuery(q);
    router.push(`/search?q=${encodeURIComponent(q)}`);
    setShowSearchDropdown(false);
  };

  const prefetchProduct = (slug: string) => {
    router.prefetch(`/products/${slug}`);
  };

  const onQueryChange = (value: string) => {
    setLocalQuery(value);
    setShowSearchDropdown(true);
  };

  const searchHit = (p: (typeof products)[number]) => (
    <button
      type="button"
      key={p.id}
      onPointerEnter={() => prefetchProduct(p.slug)}
      onClick={() => {
        router.push(`/products/${p.slug}`);
        setShowSearchDropdown(false);
      }}
      className="w-full p-3 hover:bg-blue-50/60 active:bg-blue-50 cursor-pointer flex items-center gap-3 text-left touch-manipulation"
    >
      <Image
        src={
          p.image ||
          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=80&q=80'
        }
        alt=""
        width={36}
        height={36}
        className="w-9 h-9 object-contain rounded bg-slate-100 p-0.5 flex-shrink-0"
        unoptimized={imageNeedsUnoptimized(p.image || '')}
      />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-[#001B3A] truncate">{p.title}</div>
        <div className="text-[10px] text-slate-500 flex items-center gap-2">
          <span>{p.cls}</span>
          <span className="font-extrabold text-slate-800">₹{p.price}</span>
          {p.mrp > p.price ? (
            <span className="line-through text-slate-400">₹{p.mrp}</span>
          ) : null}
        </div>
      </div>
    </button>
  );

  const dropdownBody = (
    <>
      {filteredSearch.length > 0 ? (
        <div className="divide-y divide-slate-100">
          {filteredSearch.map(searchHit)}
          <button
            type="button"
            onClick={goSearch}
            className="w-full px-3 py-2.5 text-center text-[11px] font-extrabold text-blue-600 hover:bg-blue-50"
          >
            View all results for &ldquo;{queryText}&rdquo;
          </button>
        </div>
      ) : (
        <div className="p-4 text-center text-slate-500 text-[11px]">No matching books found</div>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm mobile-no-blur md:bg-white/95 md:backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 flex-shrink-0 group min-w-0 max-w-[72%] sm:max-w-none"
        >
          <BrandLogo
            size={40}
            priority
            className="w-9 h-9 sm:w-11 sm:h-11 shadow-md"
          />
          <div className="min-w-0">
            <h1 className="font-heading font-bold text-sm sm:text-lg text-[#001B3A] tracking-tight leading-tight truncate">
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
              value={localQuery}
              onChange={(e) => onQueryChange(e.target.value)}
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
              {dropdownBody}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {user && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  setShowNotifDropdown(!showNotifDropdown);
                  if (!showNotifDropdown) fetchNotifications();
                }}
                className="relative flex p-2 rounded-xl text-slate-700 hover:bg-slate-100 min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center cursor-pointer touch-manipulation"
                aria-label="Notifications"
              >
                <Bell className="w-5 h-5 text-slate-700" />
                {unreadNotifCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-amber-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-xs animate-pulse">
                    {unreadNotifCount > 9 ? '9+' : unreadNotifCount}
                  </span>
                )}
              </button>

              {showNotifDropdown && (
                <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden text-xs">
                  <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <Bell className="w-4 h-4 text-amber-400" />
                      <span>Notifications</span>
                      {unreadNotifCount > 0 && (
                        <span className="bg-amber-500 text-white px-2 py-0.5 rounded-full text-[10px] font-extrabold">
                          {unreadNotifCount} new
                        </span>
                      )}
                    </div>
                    {unreadNotifCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] text-amber-300 hover:text-white flex items-center gap-1 font-semibold"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark read
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notificationsList.length === 0 ? (
                      <div className="p-6 text-center text-slate-500">
                        <Bell className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                        <p className="font-medium text-slate-600">No notifications yet</p>
                        <p className="text-[11px] text-slate-400 mt-1">Order status and refund updates will appear here.</p>
                      </div>
                    ) : (
                      notificationsList.map((n) => (
                        <div
                          key={n.id}
                          className={`p-3.5 transition-colors ${
                            !n.isRead ? 'bg-amber-50/60 border-l-4 border-l-amber-500' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-bold text-[#001B3A] text-xs">{n.title}</h4>
                            <span className="text-[10px] text-slate-400 shrink-0">
                              {new Date(n.createdAt).toLocaleDateString('en-IN', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[11px] leading-relaxed mt-1">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Profile + Cart live in bottom nav on phones — keep wishlist + notifs here */}
          <Link
            href={user ? '/profile' : '#'}
            onClick={(e) => {
              if (!user) {
                e.preventDefault();
                setIsAuthOpen(true);
              }
            }}
            className="hidden sm:flex p-2 rounded-xl text-slate-700 hover:bg-slate-100 min-h-11 min-w-11 items-center justify-center shrink-0 cursor-pointer"
            aria-label={user ? 'Profile' : 'Login'}
          >
            <User className="w-5 h-5 text-blue-600" />
          </Link>

          <Link
            href="/wishlist"
            className="relative flex p-2 rounded-xl text-slate-700 hover:bg-slate-100 min-h-10 min-w-10 sm:min-h-11 sm:min-w-11 items-center justify-center shrink-0 cursor-pointer"
            aria-label="Wishlist"
          >
            <Heart
              className={`w-5 h-5 ${
                wishlist.length > 0 ? 'text-red-500 fill-red-500' : 'text-slate-700'
              }`}
            />
            {wishlist.length > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-xs">
                {wishlist.length}
              </span>
            )}
          </Link>

          <Link
            href="/cart"
            onPointerEnter={() => router.prefetch('/cart')}
            className="relative hidden sm:flex p-2 rounded-xl text-slate-700 hover:bg-slate-100 min-h-11 min-w-11 items-center justify-center shrink-0 cursor-pointer"
            aria-label="Cart"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span
                className={`absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-extrabold rounded-full flex items-center justify-center shadow-xs ${
                  cartBump ? 'cart-badge-bump' : ''
                }`}
              >
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
              value={localQuery}
              onChange={(e) => onQueryChange(e.target.value)}
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
              {dropdownBody}
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
