'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, BookOpen, ShoppingBag, User, ShieldCheck } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const MobileBottomNav = () => {
  const pathname = usePathname() || '';
  const router = useRouter();
  const { cartCount, user, setIsAuthOpen, isCheckoutOpen, isAuthOpen } = useStore();

  if (pathname.startsWith('/admin')) return null;
  // Keep bar visible on cart page; only hide under full-screen auth/checkout
  if (isCheckoutOpen || isAuthOpen) return null;

  const isHome = pathname === '/';
  const isGuides = pathname.startsWith('/search') || pathname.startsWith('/products');
  const isCart = pathname === '/cart';
  const isAccount =
    pathname.startsWith('/profile') ||
    pathname.startsWith('/orders') ||
    pathname.startsWith('/track');

  const handleAccountClick = () => {
    if (user) {
      router.push('/profile');
    } else {
      setIsAuthOpen(true);
    }
  };

  const itemClass = (active: boolean) =>
    [
      'flex flex-1 flex-col items-center justify-center gap-0.5',
      'min-h-[52px] max-w-[88px] mx-auto px-1 py-1 rounded-xl',
      'transition-colors duration-150 touch-manipulation select-none',
      'active:scale-95',
      active
        ? 'bg-blue-50 text-blue-700 font-extrabold'
        : 'bg-transparent text-slate-500 font-semibold',
    ].join(' ');

  const iconClass = (active: boolean) =>
    `w-[22px] h-[22px] ${active ? 'stroke-[2.5px] text-blue-600' : 'stroke-2 text-slate-500'}`;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[55] border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-stretch justify-between gap-0.5 px-1 pt-1 w-full max-w-lg mx-auto">
        <Link href="/" className={itemClass(isHome)} aria-current={isHome ? 'page' : undefined}>
          <Home className={iconClass(isHome)} />
          <span className={`text-[10px] leading-none ${isHome ? 'text-blue-700' : 'text-slate-500'}`}>
            Home
          </span>
        </Link>

        <Link
          href="/search"
          className={itemClass(isGuides)}
          aria-current={isGuides ? 'page' : undefined}
        >
          <BookOpen className={iconClass(isGuides)} />
          <span className={`text-[10px] leading-none ${isGuides ? 'text-blue-700' : 'text-slate-500'}`}>
            Guides
          </span>
        </Link>

        <Link href="/cart" className={itemClass(isCart)} aria-current={isCart ? 'page' : undefined}>
          <span className="relative inline-flex">
            <ShoppingBag className={iconClass(isCart)} />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-blue-600 text-white font-black text-[9px] min-w-[16px] h-4 rounded-full flex items-center justify-center px-1">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </span>
          <span className={`text-[10px] leading-none ${isCart ? 'text-blue-700' : 'text-slate-500'}`}>
            Cart
          </span>
        </Link>

        <button
          type="button"
          onClick={handleAccountClick}
          className={itemClass(isAccount)}
          aria-current={isAccount ? 'page' : undefined}
        >
          <User className={iconClass(isAccount)} />
          <span className={`text-[10px] leading-none ${isAccount ? 'text-blue-700' : 'text-slate-500'}`}>
            {user ? 'Profile' : 'Login'}
          </span>
        </button>

        {user?.role === 'admin' && (
          <Link
            href="/admin"
            className={[
              'flex flex-1 flex-col items-center justify-center gap-0.5',
              'min-h-[52px] max-w-[88px] mx-auto px-1 py-1 rounded-xl',
              'bg-amber-50 text-amber-700 font-extrabold touch-manipulation',
            ].join(' ')}
          >
            <ShieldCheck className="w-[22px] h-[22px] text-amber-600 stroke-[2.5px]" />
            <span className="text-[10px] leading-none text-amber-700">Admin</span>
          </Link>
        )}
      </div>
    </nav>
  );
};
