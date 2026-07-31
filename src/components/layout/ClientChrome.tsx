'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Toast } from '@/components/ui/Toast';
import { FloatingActions } from '@/components/layout/FloatingActions';
import { ScrollRestore } from '@/components/layout/ScrollRestore';

const Modals = dynamic(
  () => import('@/components/modals/Modals').then((m) => ({ default: m.Modals })),
  { ssr: false }
);

/** Shared storefront chrome — mount once from root layout */
export function ClientChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ScrollRestore />
      {children}
      <Toast />
      <CartDrawer />
      <Modals />
      <FloatingActions />
      <MobileBottomNav />
    </>
  );
}
