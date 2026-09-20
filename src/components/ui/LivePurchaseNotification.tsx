'use client';

import React, { useEffect, useState } from 'react';
import { Truck, CheckCircle2, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

interface DispatchEvent {
  location: string;
  item: string;
  timeAgo: string;
  courier: string;
}

const EVENTS: DispatchEvent[] = [
  { location: 'Coimbatore', item: '10th Tamil Guide', timeAgo: '8m ago', courier: 'ST Courier' },
  { location: 'Madurai', item: 'Class 10 Combo Pack', timeAgo: '14m ago', courier: 'Doorstep Delivery' },
  { location: 'Tirunelveli', item: '10th Standard Guide', timeAgo: '22m ago', courier: 'ST Courier' },
  { location: 'Salem', item: '10th Tamil Guide', timeAgo: '35m ago', courier: 'Express Dispatch' },
  { location: 'Chennai, Anna Nagar', item: 'Class 10 Tamil Guide', timeAgo: '41m ago', courier: 'ST Courier' },
  { location: 'Trichy', item: '10th Guide Book', timeAgo: '50m ago', courier: 'ST Courier' },
];

export const LivePurchaseNotification: React.FC = () => {
  const pathname = usePathname() || '';
  const [eventIndex, setEventIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('bpg_dismiss_ticker')) {
      setIsDismissed(true);
    }
  }, []);

  useEffect(() => {
    if (isDismissed) return;
    if (
      pathname.startsWith('/admin') ||
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/track') ||
      pathname.startsWith('/orders')
    ) {
      return;
    }

    // Show first toast after 8 seconds of browsing
    const initialTimer = setTimeout(() => {
      setIsVisible(true);
    }, 8000);

    // Interval to cycle through events every 28 seconds
    const cycleInterval = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        setEventIndex((prev) => (prev + 1) % EVENTS.length);
        setIsVisible(true);
      }, 800);
    }, 28000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(cycleInterval);
    };
  }, [isDismissed, pathname]);

  // Auto-hide each notification after 6.5 seconds
  useEffect(() => {
    if (!isVisible) return;
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
    }, 6500);
    return () => clearTimeout(hideTimer);
  }, [isVisible, eventIndex]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('bpg_dismiss_ticker', 'true');
    }
  };

  if (isDismissed || !isVisible) return null;
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/checkout') ||
    pathname.startsWith('/track') ||
    pathname.startsWith('/orders')
  ) {
    return null;
  }

  const current = EVENTS[eventIndex];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-6 left-3 md:left-6 z-40 max-w-[340px] animate-slide-up transition-all duration-300"
    >
      <div className="relative flex items-center gap-3 p-3 bg-white/95 border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-900/10 backdrop-blur-md">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-600 shrink-0">
          <Truck className="w-5 h-5 text-[#2874f0]" />
        </div>

        <div className="flex-1 min-w-0 pr-4">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-800">Verified Order Dispatched</span>
            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
            <span className="text-[10px] text-slate-400 font-mono ml-auto">{current.timeAgo}</span>
          </div>
          <p className="text-xs font-semibold text-slate-900 truncate">{current.item}</p>
          <p className="text-[11px] text-slate-500 truncate">
            To <span className="font-medium text-slate-700">{current.location}</span> via {current.courier}
          </p>
        </div>

        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600 rounded-md transition"
          title="Dismiss"
          aria-label="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
