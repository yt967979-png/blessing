'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { X, BookOpen, ShoppingBag, ShieldCheck, Truck, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export interface SamplePdfPayload {
  title: string;
  pdfUrl: string;
  price: number;
  mrp?: number;
  bookId: string;
  coverImage?: string;
  cls?: string;
}

export function openSamplePdfModal(payload: SamplePdfPayload) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bpg:open-sample-pdf', { detail: payload }));
  }
}

export const SampleChapterReaderModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<SamplePdfPayload | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { addToCart, setIsCheckoutOpen } = useStore();

  const handleOpen = useCallback((e: Event) => {
    const customEvent = e as CustomEvent<SamplePdfPayload>;
    if (customEvent.detail && customEvent.detail.pdfUrl) {
      setData(customEvent.detail);
      setIsOpen(true);
      setIsFullscreen(false);
    }
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setData(null);
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    window.addEventListener('bpg:open-sample-pdf', handleOpen);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('bpg:open-sample-pdf', handleOpen);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, handleOpen, handleClose]);

  if (!isOpen || !data) return null;

  const discount = data.mrp && data.mrp > data.price
    ? Math.round(((data.mrp - data.price) / data.mrp) * 100)
    : 0;

  const handleAddToCart = () => {
    addToCart({
      id: data.bookId,
      slug: data.bookId,
      title: data.title,
      price: data.price,
      mrp: data.mrp || data.price,
      image: data.coverImage || '/logo.png',
      cls: data.cls || '10th',
      category: 'guide',
      subject: 'General',
      discount: discount,
      inStock: true,
      stock: 50,
      rating: 5.0,
      reviews: 1,
      badge: 'Official Guide',
      badgeColor: 'bg-blue-600',
      description: data.title,
      features: ['Solved Papers', 'Chapter Notes'],
      hoverImage: data.coverImage || '/logo.png',
      isBestSeller: true,
    } as any);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    handleClose();
    setIsCheckoutOpen(true);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sample Chapter Reader"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 w-full ${
          isFullscreen
            ? 'h-[98vh] max-w-[98vw]'
            : 'h-[92vh] max-w-5xl'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white truncate">{data.title}</span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Sample Chapter Preview
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Blessing Power Guide — Official 2026 Edition</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <a
              href={data.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition hidden sm:inline-flex"
              title="Open in New Tab"
              aria-label="Open in New Tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-800 transition"
              title="Close Preview (Esc)"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PDF Viewer Container */}
        <div className="relative flex-1 bg-slate-950 overflow-hidden">
          <iframe
            src={`${data.pdfUrl}#toolbar=0&navpanes=0`}
            className="w-full h-full border-0 bg-slate-900"
            title={`${data.title} Sample Chapter`}
          />

          {/* Discreet Official Authenticity Watermark Strip */}
          <div className="absolute top-2 right-4 pointer-events-none opacity-40 hover:opacity-100 transition-opacity bg-slate-950/80 px-2.5 py-1 rounded-md border border-slate-800 text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Blessing Power Guide Official Sample</span>
          </div>
        </div>

        {/* Floating Conversion Footer */}
        <div className="px-4 py-3 bg-slate-950/95 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-white">₹{data.price}</span>
                {data.mrp && data.mrp > data.price && (
                  <span className="text-xs text-slate-400 line-through">₹{data.mrp}</span>
                )}
                {discount > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {discount}% OFF
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                <span className="flex items-center gap-1 text-slate-300">
                  <Truck className="w-3 h-3 text-blue-400" /> ST Courier Dispatch in 24h
                </span>
                <span>•</span>
                <span className="text-emerald-400 font-medium">In Stock</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleAddToCart}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-blue-400" />
              Add to Cart
            </button>
            <button
              onClick={handleBuyNow}
              className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-blue-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Order Full Guide Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
