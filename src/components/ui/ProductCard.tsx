'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Heart, Star, ShoppingBag, Eye, ShieldCheck, Truck, Zap } from 'lucide-react';
import { Product } from '@/lib/products';
import { useStore } from '@/context/StoreContext';

export const ProductCard = ({ product }: { product: Product }) => {
  const { wishlist, toggleWishlist, addToCart, setQuickViewProduct, setIsCheckoutOpen } = useStore();
  const [isHovered, setIsHovered] = useState(false);

  const isWishlisted = wishlist.includes(product.id);
  const rupeesSaved = product.mrp - product.price;

  return (
    <motion.div
      whileHover={{ y: -5 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col relative group transition-all duration-200 hover:shadow-xl hover:border-slate-300"
    >
      {/* Offer Badge Ribbon */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1">
        <span
          className={`text-[9px] font-black text-white px-2.5 py-0.5 rounded-full shadow-xs uppercase tracking-wider ${
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
        className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/95 backdrop-blur-xs border border-slate-200 flex items-center justify-center shadow-xs hover:bg-red-50 hover:border-red-400 transition-colors cursor-pointer"
      >
        <Heart
          className={`w-4 h-4 ${
            isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'
          }`}
        />
      </button>

      {/* Image Box */}
      <Link
        href={`/products/${product.slug}`}
        className="relative h-48 bg-gradient-to-b from-slate-50 to-slate-100/70 rounded-xl flex items-center justify-center mb-3 overflow-hidden cursor-pointer p-2 mt-4"
      >
        <img
          src={isHovered ? product.hoverImage || product.image : product.image}
          alt={product.title}
          className="max-h-[90%] max-w-[90%] object-contain transition-transform duration-300 group-hover:scale-105"
        />

        {/* Quick View Hover Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setQuickViewProduct(product);
          }}
          className="absolute inset-x-3 bottom-2 bg-[#001B3A]/90 hover:bg-[#001B3A] text-white text-[11px] font-extrabold py-1.5 rounded-lg text-center flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-xs cursor-pointer"
        >
          <Eye className="w-3.5 h-3.5 text-amber-400" />
          <span>QUICK VIEW</span>
        </button>
      </Link>

      {/* Class Tag */}
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">
          {product.cls} Standard • {product.subject}
        </span>
        {rupeesSaved > 0 && (
          <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
            SAVE ₹{rupeesSaved}
          </span>
        )}
      </div>

      {/* Title */}
      <Link
        href={`/products/${product.slug}`}
        className="font-heading font-extrabold text-sm text-[#001B3A] leading-tight mb-1 cursor-pointer line-clamp-2 hover:text-blue-600 transition-colors min-h-[36px]"
      >
        {product.title}
      </Link>

      {/* Rating & Delivery Tag */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
          <span className="text-[10px] font-black text-slate-800">
            {product.rating || 5.0}
          </span>
          <span className="text-[9px] text-slate-500 font-semibold">
            ({product.reviews || 120})
          </span>
        </div>

        <span className="text-[9px] font-bold text-slate-500 flex items-center gap-1">
          <Truck className="w-3 h-3 text-emerald-600" />
          <span>Free Express</span>
        </span>
      </div>

      {/* Pricing */}
      <div className="flex items-baseline gap-1.5 mt-auto mb-3">
        <span className="text-lg font-black text-[#001B3A]">
          ₹{product.price}
        </span>
        <span className="text-xs text-slate-400 line-through">
          ₹{product.mrp}
        </span>
        <span className="text-[11px] font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
          {product.discount}% OFF
        </span>
      </div>

      {/* Action Buttons: Add to Cart & Buy Now */}
      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => addToCart(product)}
          className="bg-[#0044AA] hover:bg-[#001B3A] text-white font-extrabold text-[11px] py-2.5 rounded-xl flex items-center justify-center gap-1 transition-colors uppercase tracking-wider shadow-xs cursor-pointer"
        >
          <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
          <span>ADD TO CART</span>
        </button>

        <button
          onClick={() => {
            addToCart(product);
            setIsCheckoutOpen(true);
          }}
          className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-[11px] py-2.5 rounded-xl flex items-center justify-center gap-1 transition-all shadow-xs uppercase tracking-wider cursor-pointer"
        >
          <Zap className="w-3.5 h-3.5 text-[#001B3A]" />
          <span>BUY NOW</span>
        </button>
      </div>
    </motion.div>
  );
};
