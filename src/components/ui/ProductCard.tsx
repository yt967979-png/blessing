'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Heart, Star, ShoppingBag, Eye, Truck } from 'lucide-react';
import { Product } from '@/lib/products';
import { useStore } from '@/context/StoreContext';

function imageNeedsUnoptimized(src: string) {
  if (!src || src.startsWith('/')) return false;
  try {
    const host = new URL(src).hostname;
    return !host.includes('cloudinary.com') && !host.includes('unsplash.com');
  } catch {
    return true;
  }
}

export const ProductCard = ({ product }: { product: Product }) => {
  const { wishlist, toggleWishlist, addToCart, setQuickViewProduct, setIsCheckoutOpen, user, setIsAuthOpen } = useStore();
  const [isHovered, setIsHovered] = useState(false);

  const isWishlisted = wishlist.includes(product.id);
  const rupeesSaved = product.mrp - product.price;
  const imgSrc = isHovered ? product.hoverImage || product.image : product.image;

  return (
    <motion.div
      whileHover={{ y: -6 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="bg-white/90 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3 sm:p-4 flex flex-col relative group transition-all duration-300 hover:shadow-xl hover:border-blue-300 hover:bg-white"
    >
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
        {product.inStock === false ? (
          <span className="text-[9px] font-black text-white px-2.5 py-0.5 rounded-full shadow-md uppercase tracking-wider bg-slate-700">
            OUT OF STOCK
          </span>
        ) : product.badge ? (
          <span
            className={`text-[9px] font-black text-white px-2.5 py-0.5 rounded-full shadow-md uppercase tracking-wider ${
              product.badgeColor || 'bg-blue-600'
            }`}
          >
            {product.badge}
          </span>
        ) : null}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          toggleWishlist(product.id);
        }}
        className="absolute top-3 right-3 z-10 w-11 h-11 rounded-full bg-white/90 backdrop-blur-md border border-slate-200 flex items-center justify-center shadow-md hover:bg-red-50 hover:border-red-300 transition-colors cursor-pointer"
        aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      >
        <Heart
          className={`w-4 h-4 ${
            isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'
          }`}
        />
      </button>

      <Link
        href={`/products/${product.slug}`}
        className="relative h-44 sm:h-52 bg-gradient-to-b from-slate-50 to-blue-50/30 rounded-xl flex items-center justify-center mb-3 overflow-hidden cursor-pointer p-3 mt-4 border border-slate-100/80"
      >
        <Image
          src={imgSrc || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'}
          alt={product.title}
          width={200}
          height={200}
          className="max-h-[92%] max-w-[92%] object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-md"
          sizes="(max-width: 640px) 45vw, 200px"
          unoptimized={imageNeedsUnoptimized(imgSrc || '')}
        />

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setQuickViewProduct(product);
          }}
          className="absolute inset-x-3 bottom-2.5 bg-[#001226]/90 hover:bg-[#001226] text-white text-[11px] font-extrabold py-2.5 rounded-xl text-center flex items-center justify-center gap-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-200 backdrop-blur-md cursor-pointer border border-white/10 shadow-lg min-h-11"
        >
          <Eye className="w-3.5 h-3.5 text-amber-400" />
          <span>QUICK VIEW</span>
        </button>
      </Link>

      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">
          {product.cls} Standard • {product.subject}
        </span>
        {rupeesSaved > 0 && (
          <span className="text-[9px] font-black text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded-full border border-emerald-200">
            SAVE ₹{rupeesSaved}
          </span>
        )}
      </div>

      <Link
        href={`/products/${product.slug}`}
        className="font-heading font-black text-xs sm:text-sm text-[#001226] leading-snug mb-1.5 cursor-pointer line-clamp-2 hover:text-blue-600 transition-colors min-h-[36px]"
      >
        {product.title}
      </Link>

      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/80">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="text-[10px] font-black text-slate-900">
            {(product.reviews ?? 0) > 0 ? (product.rating || 0).toFixed(1) : 'New'}
          </span>
          <span className="text-[9px] text-slate-500 font-bold">
            ({product.reviews ?? 0})
          </span>
        </div>

        <span className="text-[9px] font-extrabold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          <Truck className="w-3 h-3 text-emerald-600" />
          <span>ST COURIER</span>
        </span>
      </div>

      <div className="flex items-baseline gap-1.5 mt-auto mb-3">
        <span className="font-black text-lg text-[#001226]">₹{product.price}</span>
        {product.mrp > product.price && (
          <span className="text-xs text-slate-400 line-through font-bold">₹{product.mrp}</span>
        )}
        {product.mrp > product.price && product.discount > 0 && (
          <span className="text-[10px] font-black text-emerald-600">{product.discount}% OFF</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={product.inStock === false}
          onClick={() => {
            if (!user) { setIsAuthOpen(true); return; }
            addToCart(product);
          }}
          className="bg-[#0044AA] hover:bg-[#001B3A] disabled:bg-slate-300 text-white font-extrabold text-[10px] sm:text-xs py-3 rounded-xl flex items-center justify-center gap-1 uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed min-h-11"
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>ADD</span>
        </button>
        <button
          type="button"
          disabled={product.inStock === false}
          onClick={() => {
            if (!user) { setIsAuthOpen(true); return; }
            addToCart(product);
            setIsCheckoutOpen(true);
          }}
          className="bg-amber-400 hover:bg-amber-500 disabled:bg-slate-200 text-[#001B3A] font-extrabold text-[10px] sm:text-xs py-3 rounded-xl uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed min-h-11"
        >
          BUY
        </button>
      </div>
    </motion.div>
  );
};
