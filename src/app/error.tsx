'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, Home, MessageCircle, AlertTriangle } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reloading, setReloading] = useState(false);

  const isChunkError =
    error?.name === 'ChunkLoadError' ||
    /failed to load chunk|loading chunk|cannot find module|missing chunk/i.test(
      error?.message || ''
    );

  useEffect(() => {
    // When a new build is deployed, old chunks in an open tab can become stale.
    // Automatically perform a hard reload immediately to fetch the latest assets.
    if (isChunkError && typeof window !== 'undefined') {
      const key = 'bpg_chunk_reload_lock';
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 4000) {
        sessionStorage.setItem(key, String(now));
        setReloading(true);
        window.location.reload();
      }
    }
  }, [isChunkError]);

  const handleTryAgain = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-12 sm:py-16 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-3xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-6 shadow-inner text-amber-600">
          {reloading || isChunkError ? (
            <RefreshCw className="w-10 h-10 animate-spin text-blue-600" />
          ) : (
            <AlertTriangle className="w-10 h-10 text-amber-600" />
          )}
        </div>

        <span className="text-[10px] font-black uppercase tracking-wider bg-amber-100 text-[#001B3A] border border-amber-300 px-3 py-1 rounded-full mb-3">
          {reloading || isChunkError ? 'Updating Catalog' : 'System Notice'}
        </span>

        <h1 className="font-heading font-black text-2xl sm:text-3xl text-[#001B3A] mb-3">
          {reloading || isChunkError
            ? 'Updating to Latest Version…'
            : 'We Encountered an Unexpected Issue'}
        </h1>

        <p className="text-sm text-slate-600 max-w-md mb-8 leading-relaxed">
          {reloading || isChunkError
            ? 'Loading the newest version of the catalog. Refreshing your page now…'
            : 'A temporary glitch occurred while loading this page. Don’t worry — your cart, pending orders, and book reservations remain safe.'}
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm mb-8">
          <button
            type="button"
            onClick={handleTryAgain}
            disabled={reloading}
            className="flex-1 bg-[#001B3A] hover:bg-blue-900 active:scale-98 text-white font-bold text-xs py-3.5 px-6 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer min-h-12 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${reloading ? 'animate-spin' : ''}`} />
            {reloading || isChunkError ? 'Refreshing…' : 'Try Again'}
          </button>
          <Link
            href="/"
            className="flex-1 bg-white hover:bg-slate-100 active:scale-98 text-[#001B3A] border border-slate-300 font-bold text-xs py-3.5 px-6 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer min-h-12"
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
        </div>

        {/* WhatsApp Helpline */}
        <div className="p-4 bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xs text-left flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-slate-800">Need immediate help?</p>
            <p className="text-[11px] text-slate-500">Call / Chat on WhatsApp</p>
          </div>
          <a
            href="https://wa.me/919486017820?text=Hi%20Blessing%20Power%20Guide%2C%20I%20got%20an%20issue%20on%20the%20website"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
            WhatsApp
          </a>
        </div>
      </main>

      <Footer />
    </div>
  );
}
