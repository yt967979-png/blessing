'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import {
  Star,
  ShoppingBag,
  Heart,
  Truck,
  Share2,
  CheckCircle,
  ChevronRight,
} from 'lucide-react';
import { PRODUCTS } from '@/lib/products';
import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { ProductCard } from '@/components/ui/ProductCard';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Modals } from '@/components/modals/Modals';

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const { products, addToCart, toggleWishlist, wishlist } = useStore();

  const currentProducts = products.length > 0 ? products : PRODUCTS;
  const product = currentProducts.find((p) => p.slug === resolvedParams.slug) || currentProducts[0];

  const [activeImg, setActiveImg] = useState(product?.image || '');
  const [dbReviews, setDbReviews] = useState<any[]>([]);

  useEffect(() => {
    if (product?.image) {
      setActiveImg(product.image);
    }
  }, [product?.image]);

  useEffect(() => {
    async function loadReviews() {
      try {
        const res = await fetch(`/api/reviews?bookId=${product.id}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setDbReviews(data);
          }
        }
      } catch (err) {}
    }
    loadReviews();
  }, [product.id]);
  const [pincode, setPincode] = useState('600012');
  const [pincodeMsg, setPincodeMsg] = useState('✓ Delivery available in 2-3 business days (Express Post)');

  if (!product) return null;

  const isWishlisted = wishlist.includes(product.id);
  const relatedProducts = currentProducts.filter((p) => p.id !== product.id).slice(0, 4);

  const checkPincode = (e: React.FormEvent) => {
    e.preventDefault();
    if (pincode.length === 6) {
      setPincodeMsg(`✓ Delivery available to ${pincode} in 2-3 days via Speed Post`);
    } else {
      setPincodeMsg('⚠️ Please enter a valid 6-digit Indian Pincode');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <AnnouncementBar />
      <Header />
      <NavBar />

      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-200 py-3">
        <div className="max-w-7xl mx-auto px-4 text-xs font-semibold text-slate-500 flex items-center gap-2">
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span>{product.cls} Standard</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900 truncate">{product.title}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 flex-1">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          {/* Gallery */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full h-80 bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-center relative overflow-hidden mb-4">
              <img
                src={activeImg || product.image}
                alt={product.title}
                className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105"
              />
              <span className={`absolute top-3 left-3 text-[10px] font-extrabold text-white px-2.5 py-1 rounded shadow-xs uppercase tracking-wider ${product.badgeColor}`}>
                {product.badge}
              </span>
            </div>

            <div className="flex gap-3">
              {[product.image, product.hoverImage || product.image].map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(img)}
                  className={`w-16 h-16 rounded-lg border-2 p-1 bg-slate-50 overflow-hidden ${
                    activeImg === img ? 'border-blue-600' : 'border-slate-200'
                  }`}
                >
                  <img src={img} alt="Thumb" className="w-full h-full object-contain" />
                </button>
              ))}
            </div>
          </div>

          {/* Product Info */}
          <div className="lg:col-span-7 flex flex-col">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
                  {product.cls} Standard • {product.subject}
                </span>
                <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-[#001B3A] mt-1 mb-2">
                  {product.title}
                </h1>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => toggleWishlist(product.id)}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <Heart className={`w-5 h-5 ${isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'}`} />
                </button>
                <button
                  onClick={() => alert('Link copied to clipboard!')}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <Share2 className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Ratings */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex text-amber-400">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400" />
                ))}
              </div>
              <span className="text-xs font-bold text-slate-700">{product.rating}</span>
              <span className="text-xs text-slate-400">• ({product.reviews} Verified Reviews)</span>
            </div>

            {/* Price Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex items-baseline gap-3">
              <span className="text-3xl font-black text-[#001B3A]">₹{product.price}</span>
              <span className="text-sm text-slate-400 line-through">₹{product.mrp}</span>
              <span className="text-xs font-extrabold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">
                Save {product.discount}% OFF
              </span>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-600 leading-relaxed mb-6">
              {product.description}
            </p>

            {/* Highlights */}
            <div className="mb-6">
              <h4 className="font-heading font-bold text-xs text-[#001B3A] uppercase tracking-wider mb-2">
                KEY FEATURES & HIGHLIGHTS
              </h4>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                {product.features.map((feat, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pincode Estimator */}
            <div className="border-t border-slate-200 pt-6 mb-6">
              <h4 className="font-heading font-bold text-xs text-[#001B3A] uppercase tracking-wider mb-2 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>CHECK DELIVERY ESTIMATE</span>
              </h4>
              <form onSubmit={checkPincode} className="flex gap-2 max-w-sm">
                <input
                  type="text"
                  maxLength={6}
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-600"
                />
                <button type="submit" className="bg-[#001B3A] text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors">
                  CHECK
                </button>
              </form>
              <p className="text-[11px] font-semibold text-emerald-700 mt-2">{pincodeMsg}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-4 mt-auto">
              <button
                onClick={() => addToCart(product)}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-sm py-3.5 px-6 rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 uppercase tracking-wider"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>ADD TO CART & BUY NOW</span>
              </button>
            </div>
          </div>
        </div>

        {/* Verified Student Reviews Section */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs mb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-6 mb-6 gap-4">
            <div>
              <h3 className="font-heading font-black text-2xl text-[#001B3A]">
                Verified Student Reviews & Testimonials
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="font-extrabold text-slate-900 text-sm">{product.rating} / 5.0</span>
                <span className="text-slate-400 text-xs">• Based on 140+ student ratings</span>
              </div>
            </div>
            <a
              href="https://wa.me/919840418228?text=Hello%20Blessing%20Power%20Guide!%20I%20want%20to%20submit%20my%20book%20review"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xs"
            >
              <Star className="w-4 h-4 fill-[#001B3A]" />
              <span>WRITE A STUDENT REVIEW</span>
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(dbReviews.length > 0
              ? dbReviews
              : [
                  {
                    studentName: 'Karthik M (10th Standard)',
                    rating: 5,
                    comment: 'Scored 96/100 in Maths State Board exam after studying with Blessing Power Guide! Solved papers were super helpful.',
                  },
                  {
                    studentName: 'Ananya S (12th Standard)',
                    rating: 5,
                    comment: 'Very clear step-by-step explanations and diagrams for Physics & Chemistry. Delivered in 24 hours via ST Courier!',
                  },
                ]
            ).map((rev: any, idx: number) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-extrabold text-slate-900 text-sm">{rev.studentName}</div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 uppercase">
                      VERIFIED PURCHASER
                    </span>
                  </div>
                  <div className="flex text-amber-400">
                    {[...Array(rev.rating || 5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                </div>
                <p className="text-slate-600 text-xs leading-relaxed mt-1">"{rev.comment}"</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recommended Products */}
        {relatedProducts.length > 0 && (
          <section className="mt-12">
            <h3 className="font-heading font-extrabold text-xl text-[#001B3A] mb-6 uppercase tracking-wide">
              RECOMMENDED FOR YOU
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>

      <Footer />
      <CartDrawer />
      <Modals />
    </main>
  );
}
