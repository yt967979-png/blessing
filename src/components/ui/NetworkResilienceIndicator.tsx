'use client';

import React, { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw } from 'lucide-react';

export const NetworkResilienceIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [showReconnected, setShowReconnected] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  return (
    <div
      role="alert"
      className={`fixed top-0 inset-x-0 z-[100] px-4 py-2 text-center text-xs font-semibold flex items-center justify-center gap-2 transition-all duration-300 shadow-md ${
        !isOnline
          ? 'bg-amber-600 text-white'
          : 'bg-emerald-600 text-white animate-fade-in'
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4 animate-pulse shrink-0" />
          <span>Offline mode active — your cart and progress are preserved safely. Waiting for network...</span>
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0 opacity-80" />
        </>
      ) : (
        <>
          <Wifi className="w-4 h-4 shrink-0" />
          <span>Connection restored! All catalog data & cart synchronized.</span>
        </>
      )}
    </div>
  );
};
