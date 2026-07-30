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

  const items = [
    { key: 'home', label: 'Home', href: '/', active: isHome, icon: Home, onClick: undefined as (() => void) | undefined },
    { key: 'guides', label: 'Guides', href: '/search', active: isGuides, icon: BookOpen, onClick: undefined },
    { key: 'cart', label: 'Cart', href: '/cart', active: isCart, icon: ShoppingBag, onClick: undefined, badge: cartCount },
    { key: 'account', label: user ? 'Profile' : 'Login', href: undefined, active: isAccount, icon: User, onClick: handleAccountClick },
  ];

  if (user?.role === 'admin') {
    items.push({
      key: 'admin',
      label: 'Admin',
      href: '/admin',
      active: false,
      icon: ShieldCheck,
      onClick: undefined,
    });
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[55] border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(0,27,58,0.08)] mobile-no-blur"
      style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}
      aria-label="Mobile navigation"
    >
      <div className="flex items-stretch justify-around px-1 pt-1 w-full max-w-lg mx-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const inner = (
            <>
              <span
                className={`relative flex items-center justify-center w-9 h-9 rounded-xl ${
                  item.active ? 'bg-[#2874f0] text-white' : 'text-slate-500'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={item.active ? 2.5 : 2} />
                {'badge' in item && item.badge != null && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white font-black text-[9px] min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-0.5 border-2 border-white">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </span>
              <span
                className={`text-[10px] leading-none mt-0.5 font-bold ${
                  item.active ? 'text-[#2874f0]' : 'text-slate-500'
                }`}
              >
                {item.label}
              </span>
            </>
          );

          const className =
            'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[52px] max-w-[76px] py-1 rounded-xl touch-manipulation select-none active:opacity-70';

          if (item.onClick) {
            return (
              <button
                key={item.key}
                type="button"
                onClick={item.onClick}
                className={className}
                aria-current={item.active ? 'page' : undefined}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href!}
              className={className}
              aria-current={item.active ? 'page' : undefined}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
