'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Heart,
  ArrowLeft,
  ShoppingBag,
  Trash2,
  ExternalLink,
  Check,
  Sparkles,
  LogIn,
  AlertCircle,
  BookOpen,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { imageNeedsUnoptimized } from '@/lib/productImage';

export default function WishlistPage() {
  const {
    user,
    wishlist,
    products,
    productsLoading,
    setIsAuthOpen,
    addToCart,
    removeFromWishlist,
    clearWishlist,
    showToast,
  } = useStore();

  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});
  const [isAddingAll, setIsAddingAll] = useState(false);

  // String-safe matching so that string and number IDs always match reliably
  const items = products.filter((p) =>
    wishlist.some((w) => String(w) === String(p.id))
  );

  const inStockItems = items.filter((p) => p.inStock !== false && (p.stock ?? 1) > 0);

  const handleAddSingleToCart = (product: any) => {
    if (product.inStock === false || (product.stock ?? 0) <= 0) {
      showToast(`⚠️ "${product.title}" is currently out of stock`);
      return;
    }
    addToCart(product, 1);
    setAddedIds((prev) => ({ ...prev, [String(product.id)]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [String(product.id)]: false }));
    }, 1800);
  };

  const handleAddAllToCart = () => {
    if (inStockItems.length === 0) {
      showToast('No in-stock items to add');
      return;
    }
    setIsAddingAll(true);
    inStockItems.forEach((p) => {
      addToCart(p, 1);
    });
    showToast(`🎉 Added ${inStockItems.length} book${inStockItems.length > 1 ? 's' : ''} to your cart!`);
    setTimeout(() => setIsAddingAll(false), 1200);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />

      {/* Breadcrumb / Top Bar */}
      <div className="bg-white border-b border-slate-200 py-3">
        <div className="max-w-7xl mx-auto px-4 text-xs font-semibold text-slate-500 flex items-center justify-between">
          <Link
            href="/"
            className="hover:text-blue-600 inline-flex items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Continue Shopping</span>
          </Link>
          <span className="text-slate-400 font-medium text-[11px]">
            {items.length} saved guide{items.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 flex-1 w-full space-y-6">
        {/* Guest Informational Banner */}
        {!user && items.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center shrink-0 text-blue-600">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-950">
                  Guest Wishlist Active
                </p>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  Sign in with Google to sync your saved books across your phone, laptop, and tablet.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsAuthOpen(true)}
              className="px-4 py-2 bg-[#2874f0] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors shrink-0 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In to Sync</span>
            </button>
          </div>
        )}

        {/* Header Title and Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading font-black text-2xl sm:text-3xl text-slate-900 flex items-center gap-2.5">
              <span>My Wishlist</span>
              <span className="text-base font-extrabold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                {items.length}
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Keep track of books you want to order later or compare for upcoming school exams.
            </p>
          </div>

          {items.length > 0 && (
            <div className="flex items-center gap-2">
              {inStockItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleAddAllToCart}
                  disabled={isAddingAll}
                  className="px-4 py-2.5 bg-[#2874f0] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer disabled:opacity-75"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>{isAddingAll ? 'Adding All...' : `Add All to Cart (${inStockItems.length})`}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (confirm('Are you sure you want to remove all books from your wishlist?')) {
                    clearWishlist();
                  }
                }}
                className="px-3 py-2.5 bg-white hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title="Clear all saved books"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            </div>
          )}
        </div>

        {/* Content Loading Skeleton */}
        {productsLoading && items.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse space-y-4 shadow-xs"
              >
                <div className="w-full h-48 bg-slate-100 rounded-xl" />
                <div className="h-4 bg-slate-100 rounded-md w-3/4" />
                <div className="h-3 bg-slate-100 rounded-md w-1/2" />
                <div className="h-9 bg-slate-100 rounded-xl w-full" />
              </div>
            ))}
          </div>
        )}

        {/* Empty Wishlist State */}
        {!productsLoading && items.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-14 text-center max-w-md mx-auto shadow-sm space-y-4 my-8">
            <div className="w-16 h-16 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto text-red-500 shadow-xs">
              <Heart className="w-8 h-8 fill-red-500/20" />
            </div>
            <div>
              <h2 className="font-heading font-black text-xl text-slate-900">
                Your Wishlist is Empty
              </h2>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                You haven&apos;t saved any guides yet. Click the heart icon on any guide book to save it for quick review and checkout.
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/search"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#2874f0] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer w-full sm:w-auto"
              >
                <BookOpen className="w-4 h-4" />
                <span>Explore Guide Books →</span>
              </Link>
            </div>
          </div>
        )}

        {/* Wishlist Items Grid */}
        {items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {items.map((product) => {
              const sId = String(product.id);
              const isAdded = Boolean(addedIds[sId]);
              const isOOS = product.inStock === false || (product.stock ?? 0) <= 0;
              const disc =
                product.mrp > product.price
                  ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
                  : 0;

              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col relative group p-4 shadow-xs hover:shadow-md ${
                    isOOS ? 'border-slate-200 opacity-90' : 'border-slate-200 hover:border-blue-300'
                  }`}
                >
                  {/* Remove Button */}
                  <button
                    type="button"
                    onClick={() => removeFromWishlist(product.id)}
                    className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 hover:bg-red-50 text-slate-400 hover:text-red-600 border border-slate-200 hover:border-red-200 flex items-center justify-center transition-colors shadow-2xs cursor-pointer"
                    title="Remove from wishlist"
                    aria-label={`Remove ${product.title} from wishlist`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Book Cover Image */}
                  <Link
                    href={`/products/${product.slug}`}
                    className="w-full h-44 sm:h-48 bg-slate-50 rounded-xl p-3 flex items-center justify-center overflow-hidden mb-3 border border-slate-100 relative group-hover:scale-[1.02] transition-transform"
                  >
                    <Image
                      src={
                        product.image ||
                        'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'
                      }
                      alt={product.title}
                      width={240}
                      height={240}
                      className="max-h-full max-w-full object-contain"
                      unoptimized={imageNeedsUnoptimized(product.image || '')}
                    />
                    {product.badge && (
                      <span className="absolute top-2 left-2 text-[9px] font-black text-white px-2 py-0.5 rounded-md bg-blue-600 uppercase shadow-xs">
                        {product.badge}
                      </span>
                    )}
                  </Link>

                  {/* Standard & Subject Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                    <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                      {product.cls || '10th'} Standard
                    </span>
                    {product.subject && (
                      <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                        {product.subject}
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <Link
                    href={`/products/${product.slug}`}
                    className="font-bold text-xs sm:text-sm text-slate-900 line-clamp-2 hover:text-blue-600 transition-colors mb-2 flex-1"
                  >
                    {product.title}
                  </Link>

                  {/* Price & Savings */}
                  <div className="flex items-baseline gap-2 mb-3 pt-2 border-t border-slate-100">
                    <span className="font-extrabold text-base text-slate-900">
                      ₹{product.price}
                    </span>
                    {product.mrp > product.price && (
                      <span className="line-through text-xs text-slate-400">
                        ₹{product.mrp}
                      </span>
                    )}
                    {disc > 0 && (
                      <span className="text-[10px] font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                        {disc}% OFF
                      </span>
                    )}
                  </div>

                  {/* Stock Indicator */}
                  <div className="flex items-center gap-1.5 text-[11px] mb-3">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isOOS ? 'bg-slate-400' : 'bg-emerald-500 animate-pulse'
                      }`}
                    />
                    <span className={isOOS ? 'text-slate-400 font-medium' : 'text-emerald-700 font-bold'}>
                      {isOOS ? 'Out of Stock' : 'In Stock & Ready for ST Courier'}
                    </span>
                  </div>

                  {/* Add / Move to Cart Button */}
                  <button
                    type="button"
                    disabled={isOOS}
                    onClick={() => handleAddSingleToCart(product)}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs ${
                      isOOS
                        ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                        : isAdded
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#2874f0] hover:bg-blue-700 text-white active:scale-98'
                    }`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Added to Cart!</span>
                      </>
                    ) : isOOS ? (
                      <span>Out of Stock</span>
                    ) : (
                      <>
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>Add to Cart</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Footer />
    </main>
  );
}
