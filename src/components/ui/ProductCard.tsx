'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Heart, Star, ShoppingBag, Truck, Check } from 'lucide-react';
import { Product } from '@/lib/products';
import { useStore } from '@/context/StoreContext';
import { imageNeedsUnoptimized } from '@/lib/productImage';

export const ProductCard = ({ product }: { product: Product }) => {
  const router = useRouter();
  const {
    wishlist,
    toggleWishlist,
    addToCart,
    setIsCheckoutOpen,
    user,
    setIsAuthOpen,
  } = useStore();

  const [isAdded, setIsAdded] = useState(false);

  const isWishlisted = wishlist.includes(product.id);
  const rupeesSaved = product.mrp - product.price;
  const imgSrc = product.image;
  const productHref = `/products/${product.slug}`;

  const prefetchProduct = () => {
    router.prefetch(productHref);
  };

  const handleAddToCart = () => {
    addToCart(product);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1800);
  };

  return (
    <article
      className="product-card-shell group bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-4 flex flex-col relative h-full shadow-sm hover:shadow-xl hover:border-blue-300/80 transition-all duration-300 hover:-translate-y-1"
      onPointerEnter={prefetchProduct}
    >
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        {product.inStock === false ? (
          <span className="text-[9px] font-black text-white px-2 py-0.5 rounded-md bg-slate-700 shadow-sm">
            OUT OF STOCK
          </span>
        ) : product.badge ? (
          <span
            className={`text-[9px] font-black text-white px-2 py-0.5 rounded-md uppercase shadow-sm ${
              product.badgeColor || 'bg-blue-600'
            }`}
          >
            {product.badge}
          </span>
        ) : (product.stock ?? 99) <= 5 && (product.stock ?? 0) > 0 ? (
          <span className="text-[9px] font-black text-white px-2 py-0.5 rounded-md bg-amber-500 shadow-sm animate-pulse">
            ONLY {product.stock} LEFT
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleWishlist(product.id);
        }}
        className="absolute top-1.5 right-1.5 z-10 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-slate-200/80 flex items-center justify-center shadow-sm touch-manipulation hover:scale-110 active:scale-95 transition-all"
        aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      >
        <Heart
          className={`w-4 h-4 transition-colors ${
            isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400 hover:text-red-400'
          }`}
        />
      </button>

      <Link
        href={productHref}
        className="relative h-36 sm:h-52 bg-slate-50/80 rounded-xl flex items-center justify-center mb-2.5 overflow-hidden mt-1 border border-slate-100"
      >
        <Image
          src={
            imgSrc ||
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'
          }
          alt={product.title}
          width={200}
          height={200}
          className="max-h-[90%] max-w-[90%] object-contain transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 640px) 42vw, 200px"
          loading="lazy"
          unoptimized={imageNeedsUnoptimized(imgSrc || '')}
        />
      </Link>

      <div className="flex items-center justify-between mb-1 gap-1">
        <span className="text-[9px] sm:text-[10px] font-black text-blue-600 uppercase tracking-wide truncate">
          {product.cls} • {product.subject}
        </span>
        {rupeesSaved > 0 && (
          <span className="text-[9px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded shrink-0">
            SAVE ₹{rupeesSaved}
          </span>
        )}
      </div>

      <Link
        href={productHref}
        className="font-heading font-black text-xs sm:text-sm text-[#001226] leading-snug mb-1.5 line-clamp-2 min-h-[2.5rem] group-hover:text-blue-700 transition-colors"
      >
        {product.title}
      </Link>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded-full">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="text-[10px] font-black text-slate-900">
            {(product.reviews ?? 0) > 0 ? (product.rating || 0).toFixed(1) : 'New'}
          </span>
        </div>
        <span className="text-[9px] font-extrabold text-emerald-700 flex items-center gap-0.5">
          <Truck className="w-3 h-3 text-emerald-600" />
          <span className="hidden xs:inline sm:inline">ST Courier</span>
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 mt-auto mb-2.5">
        <span className="font-black text-base sm:text-lg text-[#001226]">₹{product.price}</span>
        {product.mrp > product.price && (
          <span className="text-[11px] text-slate-400 line-through font-bold">₹{product.mrp}</span>
        )}
        {product.mrp > product.price && product.discount > 0 && (
          <span className="text-[10px] font-black text-emerald-600">{product.discount}% OFF</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
        <button
          type="button"
          disabled={product.inStock === false}
          onClick={handleAddToCart}
          className={`font-extrabold text-[10px] sm:text-xs py-2.5 sm:py-3 rounded-xl flex items-center justify-center gap-1 uppercase touch-manipulation disabled:cursor-not-allowed min-h-11 transition-all duration-300 ${
            isAdded
              ? 'bg-emerald-600 text-white animate-success-pop shadow-md shadow-emerald-600/30'
              : 'bg-[#0044AA] hover:bg-[#003388] active:bg-[#001B3A] disabled:bg-slate-300 text-white'
          }`}
        >
          {isAdded ? (
            <>
              <Check className="w-4 h-4 text-white animate-bounce" />
              <span>ADDED!</span>
            </>
          ) : (
            <>
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>ADD</span>
            </>
          )}
        </button>
        <button
          type="button"
          disabled={product.inStock === false}
          onClick={() => {
            if (!user) {
              setIsAuthOpen(true);
              return;
            }
            addToCart(product);
            setIsCheckoutOpen(true);
            router.push('/checkout');
          }}
          className="bg-amber-400 hover:bg-amber-500 active:bg-amber-600 disabled:bg-slate-200 text-[#001B3A] font-extrabold text-[10px] sm:text-xs py-2.5 sm:py-3 rounded-xl uppercase touch-manipulation disabled:cursor-not-allowed min-h-11 shadow-sm hover:shadow-md transition-all"
        >
          BUY NOW
        </button>
      </div>
    </article>
  );
};
