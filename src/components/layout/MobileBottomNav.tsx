'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, BookOpen, ShoppingBag, User, ShieldCheck } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const MobileBottomNav = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { cartCount, user, setIsCartOpen, setIsAuthOpen } = useStore();

  const isHome = pathname === '/';
  const isProducts = pathname?.startsWith('/products');
  const isProfile = pathname === '/profile';
  const isAdmin = pathname === '/admin';

  const handleAccountClick = () => {
    if (user) {
      router.push('/profile');
    } else {
      setIsAuthOpen(true);
    }
  };

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-slate-200 shadow-2xl px-2 py-1.5 transition-all">
      <div className="flex items-center justify-around">
        {/* Home */}
        <Link
          href="/"
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
            isHome ? 'text-blue-600 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Home</span>
        </Link>

        {/* Shop Guides */}
        <Link
          href="/#products"
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all ${
            isProducts ? 'text-blue-600 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Guides</span>
        </Link>

        {/* Cart Button */}
        <button
          onClick={() => setIsCartOpen(true)}
          className="flex flex-col items-center justify-center py-1 px-3 rounded-xl text-slate-500 hover:text-blue-600 relative transition-all active:scale-95 cursor-pointer"
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 bg-blue-600 text-white font-black text-[9px] min-w-[16px] h-4 rounded-full flex items-center justify-center px-1 shadow-sm animate-pulse">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5 font-medium">Cart</span>
        </button>

        {/* Profile / Account */}
        <button
          onClick={handleAccountClick}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
            isProfile ? 'text-blue-600 font-extrabold scale-105' : 'text-slate-500 hover:text-slate-900 font-medium'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">{user ? 'Profile' : 'Login'}</span>
        </button>

        {/* Admin Shortcut if logged in as Admin */}
        {user?.role === 'admin' && (
          <Link
            href="/admin"
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
              isAdmin ? 'text-amber-600 font-extrabold scale-105' : 'text-amber-500 hover:text-amber-700 font-medium'
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Admin</span>
          </Link>
        )}
      </div>
    </div>
  );
};
