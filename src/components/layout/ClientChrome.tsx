'use client';

import React from 'react';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';

/** Shared mobile chrome (bottom nav) for all storefront pages */
export function ClientChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MobileBottomNav />
    </>
  );
}
