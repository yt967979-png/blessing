'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Heart, Star, ShoppingBag, Eye, ShieldCheck, Truck, Zap } from 'lucide-react';
import { Product } from '@/lib/products';
import { useStore } from '@/context/StoreContext';

export const ProductCard = ({ product }: { product: Product }) => {
  const { wishlist, toggleWishlist, addToCart, setQuickViewProduct, setIsCheckoutOpen, user, setIsAuthOpen } = useStore();
  const [isHovered, setIsHovered] = useState(false);

  const isWishlisted = wishlist.includes(product.id);
  const rupeesSaved = product.mrp - product.price;

  return (
    <motion.div
      whileHover={{ y: -6 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="bg-white/90 backdrop-blur-md border border-slate-200/90 rounded-2xl p-3 sm:p-4 flex flex-col relative group transition-all duration-300 hover:shadow-xl hover:border-blue-300 hover:bg-white"
    >
      {/* Offer Badge Ribbon */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
        <span
          className={`text-[9px] font-black text-white px-2.5 py-0.5 rounded-full shadow-md uppercase tracking-wider ${
            product.badgeColor || 'bg-blue-600'
          }`}
        >
          {product.badge}
        </span>
      </div>

      {/* Wishlist Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleWishlist(product.id);
        }}
        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 backdrop-blur-md border border-slate-200 flex items-center justify-center shadow-md hover:bg-red-50 hover:border-red-300 transition-colors cursor-pointer"
      >
        <Heart
          className={`w-4 h-4 ${
            isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'
          }`}
        />
      </button>

      {/* Image Box with Subtle Glass Backing */}
      <Link
        href={`/products/${product.slug}`}
        className="relative h-44 sm:h-52 bg-gradient-to-b from-slate-50 to-blue-50/30 rounded-xl flex items-center justify-center mb-3 overflow-hidden cursor-pointer p-3 mt-4 border border-slate-100/80"
      >
        <img
          src={isHovered ? product.hoverImage || product.image : product.image}
          alt={product.title}
          className="max-h-[92%] max-w-[92%] object-contain transition-transform duration-300 group-hover:scale-108 drop-shadow-md"
        />

        {/* Quick View Hover Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setQuickViewProduct(product);
          }}
          className="absolute inset-x-3 bottom-2.5 bg-[#001226]/90 hover:bg-[#001226] text-white text-[11px] font-extrabold py-2 rounded-xl text-center flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-md cursor-pointer border border-white/10 shadow-lg"
        >
          <Eye className="w-3.5 h-3.5 text-amber-400" />
          <span>QUICK VIEW</span>
        </button>
      </Link>

      {/* Class Tag */}
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

      {/* Title */}
      <Link
        href={`/products/${product.slug}`}
        className="font-heading font-black text-xs sm:text-sm text-[#001226] leading-snug mb-1.5 cursor-pointer line-clamp-2 hover:text-blue-600 transition-colors min-h-[36px]"
      >
        {product.title}
      </Link>

      {/* Rating & Delivery Tag */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/80">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="text-[10px] font-black text-slate-900">
            {product.rating || 5.0}
          </span>
          <span className="text-[9px] text-slate-500 font-bold">
            ({product.reviews || 120})
          </span>
        </div>

        <span className="text-[9px] font-extrabold text-emerald-700 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          <Truck className="w-3 h-3 text-emerald-600" />
          <span>ST COURIER</span>
        </span>
      </div>

      {/* Pricing */}
      <div className="flex items-baseline gap-1.5 mt-auto mb-3">
        <span className="text-lg sm:text-xl font-black text-[#001226]">
          ₹{product.price}
        </span>
        <span className="text-xs text-slate-400 line-through font-semibold">
          ₹{product.mrp}
        </span>
        <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full uppercase tracking-wider">
          {product.discount}% OFF
        </span>
      </div>

      {/* Action Buttons: Add to Cart & Buy Now */}
      <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
        <button
          onClick={() => {
            if (!user) { setIsAuthOpen(true); return; }
            addToCart(product);
          }}
          className="bg-[#002B5B] hover:bg-[#001226] text-white font-black text-[10px] sm:text-[11px] py-2.5 sm:py-3 rounded-xl flex items-center justify-center gap-1 transition-all uppercase tracking-wider shadow-md cursor-pointer px-1 min-w-0 border border-blue-900/40"
        >
          <ShoppingBag className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="truncate">ADD TO CART</span>
        </button>

        <button
          onClick={() => {
            if (!user) { setIsAuthOpen(true); return; }
            addToCart(product);
            setIsCheckoutOpen(true);
          }}
          className="bg-gradient-to-r from-amber-400 via-amber-450 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001226] font-black text-[10px] sm:text-[11px] py-2.5 sm:py-3 rounded-xl flex items-center justify-center gap-1 transition-all shadow-md uppercase tracking-wider cursor-pointer px-1 min-w-0 border border-amber-300"
        >
          <Zap className="w-3.5 h-3.5 text-[#001226] fill-[#001226] flex-shrink-0" />
          <span className="truncate">BUY NOW</span>
        </button>
      </div>
    </motion.div>
  );
};
