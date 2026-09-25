'use client';

import { useEffect, useState } from 'react';

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
    /failed to load chunk|loading chunk|cannot find module/i.test(
      error?.message || ''
    );

  useEffect(() => {
    // When a new build is deployed, old chunks on user's open tab become stale.
    // Automatically perform a hard reload once to get the newest assets.
    if (isChunkError && typeof window !== 'undefined') {
      const storageKey = 'bpg_chunk_err_reload';
      const lastReload = sessionStorage.getItem(storageKey);
      const now = Date.now();
      if (!lastReload || now - Number(lastReload) > 15000) {
        sessionStorage.setItem(storageKey, String(now));
        setReloading(true);
        window.location.reload();
      }
    }
  }, [isChunkError]);

  const handleTryAgain = () => {
    if (isChunkError && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-[#001B3A] px-3 py-1 rounded-full">
        Blessing Power Guide
      </span>
      <h1 className="font-heading font-black text-2xl text-[#001B3A]">
        {reloading ? 'Updating to Latest Version…' : 'Something went wrong'}
      </h1>
      <p className="text-sm text-slate-600 max-w-md">
        {reloading
          ? 'A newer version of the shop was just deployed. Refreshing your page now…'
          : isChunkError
            ? 'A newer version of the shop is available. Please click below to refresh and load the latest updates.'
            : error.message ||
              'A temporary issue occurred. Your cart and orders are safe — please try again.'}
      </p>
      <button
        type="button"
        onClick={handleTryAgain}
        disabled={reloading}
        className="bg-[#001B3A] hover:bg-blue-900 active:scale-95 text-white font-bold text-xs px-6 py-3 rounded-xl uppercase tracking-wider min-h-12 transition-all cursor-pointer shadow-md disabled:opacity-50"
      >
        {reloading ? 'Reloading…' : isChunkError ? 'Refresh Page' : 'Try again'}
      </button>
    </div>
  );
}
