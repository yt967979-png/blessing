'use client';

import React from 'react';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Toast } from '@/components/ui/Toast';
import { FloatingActions } from '@/components/layout/FloatingActions';
import { ScrollRestore } from '@/components/layout/ScrollRestore';
import { Modals } from '@/components/modals/Modals';

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
