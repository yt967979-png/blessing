'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Heart, Star, ShoppingBag, Eye } from 'lucide-react';
import { Product } from '@/lib/products';
import { useStore } from '@/context/StoreContext';

export const ProductCard = ({ product }: { product: Product }) => {
  const { wishlist, toggleWishlist, addToCart, setQuickViewProduct } = useStore();
  const [isHovered, setIsHovered] = useState(false);

  const isWishlisted = wishlist.includes(product.id);

  return (
    <motion.div
      whileHover={{ y: -5 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      className="bg-white border border-slate-200 rounded-2xl p-3.5 flex flex-col relative group transition-all duration-200 hover:shadow-xl hover:border-slate-300"
    >
      {/* Offer Badge Ribbon */}
      <span
        className={`absolute top-3 left-3 z-10 text-[9px] font-black text-white px-2.5 py-0.5 rounded-full shadow-xs uppercase tracking-wider ${product.badgeColor}`}
      >
        {product.badge}
      </span>

      {/* Wishlist Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleWishlist(product.id);
        }}
        className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full bg-white/90 backdrop-blur-xs border border-slate-200 flex items-center justify-center shadow-xs hover:bg-red-50 hover:border-red-400 transition-colors"
      >
        <Heart
          className={`w-3.5 h-3.5 ${
            isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'
          }`}
        />
      </button>

      {/* Image Box */}
      <Link
        href={`/products/${product.slug}`}
        className="relative h-44 bg-gradient-to-b from-slate-50 to-slate-100/70 rounded-xl flex items-center justify-center mb-3 overflow-hidden cursor-pointer p-2"
      >
        <img
          src={isHovered ? product.hoverImage : product.image}
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
          className="absolute inset-x-3 bottom-2 bg-[#001B3A]/90 hover:bg-[#001B3A] text-white text-[11px] font-extrabold py-1.5 rounded-lg text-center flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-xs"
        >
          <Eye className="w-3.5 h-3.5 text-amber-400" />
          <span>QUICK VIEW</span>
        </button>
      </Link>

      {/* Class Tag */}
      <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider mb-0.5">
        {product.cls} Standard • {product.subject}
      </span>

      {/* Title */}
      <Link
        href={`/products/${product.slug}`}
        className="font-heading font-extrabold text-sm text-[#001B3A] leading-tight mb-1 cursor-pointer line-clamp-2 hover:text-blue-600 transition-colors min-h-[36px]"
      >
        {product.title}
      </Link>

      {/* Rating */}
      <div className="flex items-center gap-1 mb-2">
        <div className="flex text-amber-400">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="w-3 h-3 fill-amber-400" />
          ))}
        </div>
        <span className="text-[10px] text-slate-500 font-bold">
          ({product.reviews})
        </span>
      </div>

      {/* Pricing */}
      <div className="flex items-baseline gap-1.5 mt-auto mb-3">
        <span className="text-base font-black text-[#001B3A]">
          ₹{product.price}
        </span>
        <span className="text-xs text-slate-400 line-through">
          ₹{product.mrp}
        </span>
        <span className="text-[11px] font-extrabold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
          {product.discount}% OFF
        </span>
      </div>

      {/* Add to Cart Button */}
      <button
        onClick={() => addToCart(product)}
        className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs uppercase tracking-wider"
      >
        <ShoppingBag className="w-3.5 h-3.5" />
        <span>ADD TO CART</span>
      </button>
    </motion.div>
  );
};
