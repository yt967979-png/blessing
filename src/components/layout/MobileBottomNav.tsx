'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, BookOpen, ShoppingBag, User, ShieldCheck } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const MobileBottomNav = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { cartCount, user, setIsCartOpen, setIsAuthOpen, isCheckoutOpen, isAuthOpen, isCartOpen } = useStore();

  // Hide on admin and when full-screen modals are open
  if (pathname?.startsWith('/admin')) return null;
  if (isCartOpen || isCheckoutOpen || isAuthOpen) return null;

  const isHome = pathname === '/';
  const isProducts = pathname?.startsWith('/products') || pathname?.startsWith('/search');
  const isCart = pathname === '/cart';
  const isProfile = pathname === '/profile' || pathname === '/orders';

  const handleAccountClick = () => {
    if (user) {
      router.push('/profile');
    } else {
      setIsAuthOpen(true);
    }
  };

  const itemClass = (active: boolean) =>
    `flex flex-col items-center justify-center min-h-12 min-w-14 py-1.5 px-2 rounded-xl transition-all ${
      active ? 'text-blue-600 font-extrabold' : 'text-slate-500 hover:text-slate-900 font-medium'
    }`;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-slate-200 shadow-2xl px-1 pt-1"
      style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around">
        <Link href="/" className={itemClass(isHome)}>
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </Link>

        <Link href="/search" className={itemClass(!!isProducts)}>
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Guides</span>
        </Link>

        <button
          type="button"
          onClick={() => {
            if (pathname === '/cart') setIsCartOpen(true);
            else router.push('/cart');
          }}
          className={`${itemClass(!!isCart)} relative cursor-pointer`}
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-blue-600 text-white font-black text-[9px] min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 shadow-sm">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 font-medium">Cart</span>
        </button>

        <button type="button" onClick={handleAccountClick} className={`${itemClass(!!isProfile)} cursor-pointer`}>
          <User className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">{user ? 'Profile' : 'Login'}</span>
        </button>

        {user?.role === 'admin' && (
          <Link href="/admin" className={itemClass(false).replace('text-slate-500', 'text-amber-500')}>
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Admin</span>
          </Link>
        )}
      </div>
    </nav>
  );
};
