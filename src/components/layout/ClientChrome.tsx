'use client';

import React from 'react';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Toast } from '@/components/ui/Toast';
import { FloatingActions } from '@/components/layout/FloatingActions';
import { ScrollRestore } from '@/components/layout/ScrollRestore';
import { Modals } from '@/components/modals/Modals';
import { BlessingChatWidget } from '@/components/chat/BlessingChatWidget';
import { SampleChapterReaderModal } from '@/components/books/SampleChapterReaderModal';
import { LivePurchaseNotification } from '@/components/ui/LivePurchaseNotification';
import { NetworkResilienceIndicator } from '@/components/ui/NetworkResilienceIndicator';

/** Shared storefront chrome — mount once from root layout */
export function ClientChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NetworkResilienceIndicator />
      <ScrollRestore />
      {children}
      <Toast />
      <CartDrawer />
      <Modals />
      <SampleChapterReaderModal />
      <LivePurchaseNotification />
      <BlessingChatWidget />
      <FloatingActions />
      <MobileBottomNav />
    </>
  );
}
