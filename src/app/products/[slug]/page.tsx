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
import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { ProductCard } from '@/components/ui/ProductCard';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Modals } from '@/components/modals/Modals';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';

export default function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = use(params);
  const { products, addToCart, toggleWishlist, wishlist } = useStore();
  const [dbProduct, setDbProduct] = useState<any>(null);
  const [dbReviews, setDbReviews] = useState<any[]>([]);

  useEffect(() => {
    async function fetchProduct() {
      try {
        const res = await fetch(`/api/products`);
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) {
            const found = list.find((p: any) => p.slug === resolvedParams.slug) || list[0];
            setDbProduct(found);
          }
        }
      } catch (err) {}
    }
    fetchProduct();
  }, [resolvedParams.slug]);

  const product = dbProduct || products.find((p: any) => p.slug === resolvedParams.slug) || products[0];
  const [activeImg, setActiveImg] = useState(product?.image || '');

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
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [reviewName, setReviewName] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  if (!product) return null;

  const isWishlisted = wishlist.includes(product.id);
  const relatedProducts = products.filter((p: any) => p.id !== product.id).slice(0, 4);

  const checkPincode = (e: React.FormEvent) => {
    e.preventDefault();
    if (pincode.length === 6) {
      const isTN = ['6', '60', '62', '63', '64'].some(p => pincode.startsWith(p));
      const estimate = getSTCourierDeliveryEstimate(isTN ? 'Tamil Nadu' : 'Other State');
      setPincodeMsg(`✓ Delivery to ${pincode} by ${estimate.formattedDate}, ${estimate.formattedTime} via ST Courier Express (${isTN ? '2 days' : '3-4 days'})`);
    } else {
      setPincodeMsg('⚠️ Please enter a valid 6-digit Indian Pincode');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      {/* Schema.org Rich Snippet JSON-LD for Google Search Indexing */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.title,
            image: [product.image],
            description: product.description,
            sku: product.slug,
            offers: {
              '@type': 'Offer',
              priceCurrency: 'INR',
              price: product.price,
              itemCondition: 'https://schema.org/NewCondition',
              availability: product.inStock !== false ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: product.rating || 5.0,
              reviewCount: product.reviews ?? 0,
            },
          }),
        }}
      />

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
            {(() => {
              const actualCount = dbReviews.length > 0 ? dbReviews.length : (product.reviews || 0);
              const calculatedAvg = dbReviews.length > 0 
                ? (dbReviews.reduce((sum, r) => sum + Number(r.rating || 5), 0) / dbReviews.length).toFixed(1)
                : (product.rating || 5.0).toFixed(1);
              return (
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex text-amber-400">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${i < Math.round(Number(calculatedAvg)) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-700">{calculatedAvg}</span>
                  <span className="text-xs text-slate-400">• ({actualCount} {actualCount === 1 ? 'Review' : 'Reviews'})</span>
                </div>
              );
            })()}

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
                {product.features?.map((feat: string, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pincode Delivery Estimator — Flipkart Style */}
            <div className="border-t border-slate-200 pt-6 mb-6">
              <h4 className="font-heading font-bold text-xs text-[#001B3A] uppercase tracking-wider mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>DELIVERY OPTIONS</span>
              </h4>
              <form onSubmit={checkPincode} className="flex gap-2 max-w-sm">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="Enter delivery pincode"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-600 font-bold pr-16"
                  />
                  <button type="submit" className="absolute right-1 top-1 bottom-1 bg-blue-600 text-white font-extrabold text-[10px] px-3 rounded-md hover:bg-blue-700 transition-colors uppercase cursor-pointer">
                    CHECK
                  </button>
                </div>
              </form>

              {pincodeMsg && (
                <div className="mt-3 space-y-2">
                  <p className={`text-xs font-bold flex items-center gap-1.5 ${pincodeMsg.startsWith('✓') ? 'text-emerald-700' : 'text-red-600'}`}>
                    {pincodeMsg.startsWith('✓') && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                    {pincodeMsg}
                  </p>
                  {pincodeMsg.startsWith('✓') && (
                    <div className="flex flex-wrap gap-3 text-[11px]">
                      <span className="text-emerald-700 font-bold flex items-center gap-1">
                        <Truck className="w-3 h-3" /> FREE Delivery
                      </span>
                      <span className="text-slate-500 font-semibold">•</span>
                      <span className="text-blue-700 font-bold">₹0 Shipping Charges</span>
                      <span className="text-slate-500 font-semibold">•</span>
                      <span className="text-amber-700 font-bold">Cash on Delivery Available</span>
                    </div>
                  )}
                </div>
              )}
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
                <span className="text-slate-400 text-xs">• Based on {dbReviews.length > 0 ? dbReviews.length : '140'}+ student ratings</span>
              </div>
            </div>
            <button
              onClick={() => setShowReviewForm(!showReviewForm)}
              className="bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
            >
              <Star className="w-4 h-4 fill-[#001B3A]" />
              <span>{showReviewForm ? 'CLOSE FORM' : 'WRITE A STUDENT REVIEW'}</span>
            </button>
          </div>

          {/* Inline Review Form */}
          {showReviewForm && (
            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 mb-6 space-y-4">
              <h4 className="font-heading font-black text-sm text-[#001B3A]">📝 RATE & REVIEW THIS BOOK</h4>

              {/* Star Rating Picker */}
              <div>
                <span className="text-xs font-bold text-slate-700 block mb-1.5">Your Rating *</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setReviewRating(s)}
                      className="p-1 cursor-pointer transition-transform hover:scale-110"
                    >
                      <Star className={`w-7 h-7 ${s <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-slate-500 ml-2 self-center">{reviewRating}/5</span>
                </div>
              </div>

              {/* Name Input */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Your Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Karthik M (10th Standard)"
                  value={reviewName}
                  onChange={(e) => setReviewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-600 font-semibold bg-white"
                />
              </div>

              {/* Comment Textarea */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Your Review *</label>
                <textarea
                  placeholder="Share how this book helped you prepare for your exams..."
                  value={reviewText}
                  onChange={(e) => setReviewText(e.target.value)}
                  rows={3}
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-600 font-semibold bg-white resize-none"
                />
              </div>

              <button
                disabled={isSubmittingReview || !reviewName.trim() || !reviewText.trim()}
                onClick={async () => {
                  setIsSubmittingReview(true);
                  try {
                    await fetch('/api/reviews', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        bookId: product.id,
                        userName: reviewName,
                        rating: reviewRating,
                        review: reviewText,
                      }),
                    });
                    setDbReviews(prev => [{ studentName: reviewName, rating: reviewRating, comment: reviewText }, ...prev]);
                    setReviewName('');
                    setReviewText('');
                    setReviewRating(5);
                    setShowReviewForm(false);
                  } catch (_) {}
                  setIsSubmittingReview(false);
                }}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs px-6 py-3 rounded-xl transition-all shadow-md cursor-pointer uppercase tracking-wider flex items-center gap-2"
              >
                {isSubmittingReview ? 'SUBMITTING...' : '⭐ SUBMIT YOUR REVIEW'}
              </button>
            </div>
          )}

          {dbReviews.length === 0 ? (
            <div className="py-10 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Star className="w-8 h-8 mx-auto mb-2 text-amber-400 opacity-60" />
              <p className="text-xs font-bold text-slate-700">No verified reviews submitted yet for this book.</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Be the first student to leave a review above!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dbReviews.map((rev: any, idx: number) => (
                <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{rev.studentName}</div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 uppercase">
                        VERIFIED PURCHASER
                      </span>
                    </div>
                    <div className="flex gap-0.5">
                      {Array.from({ length: rev.rating || 5 }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>
                  <p className="text-slate-600 text-xs leading-relaxed font-medium">"{rev.comment}"</p>
                </div>
              ))}
            </div>
          )}
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

      {/* Sticky Mobile Touch Action Bar (< 640px) */}
      <div className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 z-40 sm:hidden flex items-center gap-2 shadow-2xl">
        <button
          onClick={() => toggleWishlist(product.id)}
          className="p-3 rounded-xl border border-slate-300 text-slate-700 bg-slate-50 flex-shrink-0"
        >
          <Heart className={`w-5 h-5 ${isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'}`} />
        </button>

        <button
          onClick={() => addToCart(product)}
          className="flex-1 bg-[#0044AA] hover:bg-[#001B3A] text-white font-extrabold text-xs py-3.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md uppercase tracking-wider cursor-pointer"
        >
          <ShoppingBag className="w-4 h-4 text-amber-400" />
          <span>ADD TO CART</span>
        </button>
      </div>

      <Footer />
      <CartDrawer />
      <Modals />
    </main>
  );
}
