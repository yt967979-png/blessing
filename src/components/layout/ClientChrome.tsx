'use client';

import React, { useEffect } from 'react';
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
  useEffect(() => {
    // When a newer Next.js build is deployed to production, stale client sessions
    // trying to fetch previous content-hashed chunks get a 404 ChunkLoadError.
    // Intercept this globally and seamlessly hard-reload once to refresh the HTML & chunk graph.
    const isChunkError = (err: any) => {
      const msg = String(err?.message || err?.reason?.message || err?.reason || err || '');
      return /chunkloaderror|failed to load chunk|loading chunk|cannot find module/i.test(msg);
    };

    const attemptReload = () => {
      if (typeof window === 'undefined') return;
      const key = 'bpg_chunk_resilience_reload';
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 12000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
    };

    const handleRejection = (e: PromiseRejectionEvent) => {
      if (isChunkError(e.reason)) {
        e.preventDefault();
        attemptReload();
      }
    };

    const handleError = (e: ErrorEvent) => {
      if (isChunkError(e.error || e.message)) {
        attemptReload();
      }
    };

    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);
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
