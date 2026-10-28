'use client';

import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export function NetworkOfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOffline = () => {
      setIsOffline(true);
      setWasOffline(true);
    };

    const handleOnline = () => {
      setIsOffline(false);
      // Auto-hide the "back online" state after 4 seconds
      const timer = setTimeout(() => {
        setWasOffline(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    // Initial check
    if (!navigator.onLine) {
      setIsOffline(true);
      setWasOffline(true);
    }

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const handleRetry = () => {
    setIsRetrying(true);
    fetch('/api/health', { cache: 'no-store' })
      .then((res) => {
        if (res.ok) {
          setIsOffline(false);
          setWasOffline(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsRetrying(false);
      });
  };

  if (!isOffline && !wasOffline) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 max-w-md w-full animate-in slide-in-from-bottom-5 duration-300">
      {isOffline ? (
        <div className="bg-[#001B3A] text-white p-4 rounded-2xl shadow-2xl border border-amber-400/40 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-400/10 text-amber-400 border border-amber-400/20 shrink-0">
              <WifiOff className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">You&apos;re currently offline</p>
              <p className="text-[11px] text-slate-300">
                Your cart is saved. Reconnect to place orders.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 active:scale-95 text-[#001B3A] font-extrabold text-[11px] rounded-xl flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
            {isRetrying ? 'Checking…' : 'Retry'}
          </button>
        </div>
      ) : (
        <div className="bg-emerald-900 text-white p-3.5 rounded-2xl shadow-2xl border border-emerald-500/40 flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
            <Wifi className="w-4 h-4" />
          </div>
          <p className="text-xs font-bold text-emerald-100">
            ✓ Back online! Latest prices and stock synchronized.
          </p>
        </div>
      )}
    </div>
  );
}
