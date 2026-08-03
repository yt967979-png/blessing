'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
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
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';
import { pincodeDeliveryMessage } from '@/lib/pincode';
import { authHeaders } from '@/lib/clientAuth';
import { imageNeedsUnoptimized } from '@/lib/productImage';

function applyReviewsPayload(
  data: any,
  setters: {
    setReviewStats: (v: { count: number; avgRating: number }) => void;
    setDbReviews: (v: any[]) => void;
    setCanReview: (v: boolean) => void;
    setUserReview: (v: any) => void;
    setReviewRating: (v: number) => void;
    setReviewText: (v: string) => void;
    setReviewImages: (v: string[]) => void;
  }
) {
  if (data?.stats) {
    setters.setReviewStats(data.stats);
    setters.setDbReviews(Array.isArray(data.reviews) ? data.reviews : []);
    setters.setCanReview(!!data.canReview);
    setters.setUserReview(data.userReview || null);
    if (data.userReview) {
      setters.setReviewRating(data.userReview.rating);
      setters.setReviewText(data.userReview.comment);
      setters.setReviewImages(data.userReview.images || []);
    }
  } else if (Array.isArray(data)) {
    setters.setDbReviews(data);
  }
}

export default function ProductDetailClient({ slug }: { slug: string }) {
  const router = useRouter();
  const { products, productsLoading, addToCart, toggleWishlist, wishlist, user, setIsAuthOpen, setIsCheckoutOpen } = useStore();
  const [dbProduct, setDbProduct] = useState<any>(null);
  const [productFetchDone, setProductFetchDone] = useState(false);
  const [dbReviews, setDbReviews] = useState<any[]>([]);
  const [reviewStats, setReviewStats] = useState({ count: 0, avgRating: 0 });
  const [canReview, setCanReview] = useState(false);
  const [userReview, setUserReview] = useState<any>(null);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [reviewImages, setReviewImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pincode, setPincode] = useState('600012');
  const [pincodeMsg, setPincodeMsg] = useState('✓ Deliverable via ST Courier — usually 2–3 days in Tamil Nadu.');
  const [pincodeOk, setPincodeOk] = useState(true);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  const storeProduct = products.find((p: any) => p.slug === slug || p.id === slug) || null;
  const product = dbProduct || storeProduct;
  const [activeImg, setActiveImg] = useState('');

  useEffect(() => {
    let cancelled = false;
    setProductFetchDone(false);
    setDbProduct(null);

    async function loadProductAndReviews() {
      const reviewHeaders: HeadersInit = user?.token
        ? { Authorization: `Bearer ${user.token}` }
        : {};
      const reviewSetters = {
        setReviewStats,
        setDbReviews,
        setCanReview,
        setUserReview,
        setReviewRating,
        setReviewText,
        setReviewImages,
      };

      // Catalog snapshot at request start — enables parallel reviews when already warm
      const knownId = products.find((p: any) => p.slug === slug || p.id === slug)?.id;

      const productPromise = fetch(`/api/products?slug=${encodeURIComponent(slug)}`)
        .then(async (res) => {
          if (!res.ok) return null;
          const list = await res.json();
          return Array.isArray(list) && list.length > 0 ? list[0] : null;
        })
        .catch(() => null);

      const reviewsPromise = knownId
        ? fetch(`/api/reviews?bookId=${knownId}&stats=1`, { headers: reviewHeaders })
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null)
        : Promise.resolve(null);

      const [found, earlyReviews] = await Promise.all([productPromise, reviewsPromise]);
      if (cancelled) return;

      setDbProduct(found);
      setProductFetchDone(true);

      if (earlyReviews) {
        applyReviewsPayload(earlyReviews, reviewSetters);
      } else {
        const id = found?.id;
        if (id) {
          try {
            const res = await fetch(`/api/reviews?bookId=${id}&stats=1`, { headers: reviewHeaders });
            if (!cancelled && res.ok) {
              applyReviewsPayload(await res.json(), reviewSetters);
            }
          } catch {
            /* ignore */
          }
        }
      }
    }

    void loadProductAndReviews();
    return () => {
      cancelled = true;
    };
    // products omitted on purpose — snapshot only at slug/auth change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user?.token]);

  useEffect(() => {
    if (product?.image) {
      setActiveImg(product.image);
    }
  }, [product?.image]);

  const stillLoading = !product && (!productFetchDone || productsLoading);

  const displayCount = reviewStats.count > 0 ? reviewStats.count : dbReviews.length;
  const calculatedAvg =
    reviewStats.count > 0
      ? Number(reviewStats.avgRating).toFixed(1)
      : dbReviews.length > 0
        ? (dbReviews.reduce((sum, r) => sum + Number(r.rating || 5), 0) / dbReviews.length).toFixed(1)
        : '0.0';

  const handleReviewImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || reviewImages.length >= 5) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'reviews');
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: user?.token ? { Authorization: `Bearer ${user.token}` } : {},
        body: fd,
      });
      const data = await res.json();
      if (res.ok && data.url) {
        setReviewImages((prev) => [...prev, data.url].slice(0, 5));
      }
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const submitReview = async () => {
    if (!product?.id || !user) return;
    setIsSubmittingReview(true);
    try {
      const isEdit = !!userReview;
      const res = await fetch('/api/reviews', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({
          id: userReview?.id,
          bookId: product.id,
          rating: reviewRating,
          comment: reviewText,
          images: reviewImages,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Could not save review.');
        return;
      }
      if (data.stats) setReviewStats(data.stats);
      if (data.review) {
        setUserReview(data.review);
        setDbReviews((prev) => {
          const without = prev.filter((r) => r.id !== data.review.id);
          return [data.review, ...without];
        });
      }
      setCanReview(false);
      setIsEditingReview(false);
      setShowReviewForm(false);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  if (stillLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col pb-36 md:pb-0">
        <AnnouncementBar />
        <Header />
        <NavBar />
        <div className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
          <div className="h-4 w-64 bg-slate-200 rounded animate-pulse mb-6" />
          <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-4">
              <div className="w-full h-80 bg-slate-100 rounded-xl animate-pulse" />
              <div className="flex gap-3">
                <div className="w-16 h-16 bg-slate-100 rounded-lg animate-pulse" />
                <div className="w-16 h-16 bg-slate-100 rounded-lg animate-pulse" />
              </div>
            </div>
            <div className="lg:col-span-7 space-y-4">
              <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
              <div className="h-8 w-3/4 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
              <div className="h-10 w-40 bg-slate-200 rounded animate-pulse mt-4" />
              <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
                <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col pb-36 md:pb-0">
        <AnnouncementBar />
        <Header />
        <NavBar />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-xl font-bold text-slate-800">Product not found</h1>
          <p className="text-sm text-slate-500">This book is not in the catalog.</p>
          <Link href="/search" className="text-sm font-semibold text-blue-600 hover:underline">Browse all books →</Link>
        </div>
        <Footer />
      </main>
    );
  }

  const isWishlisted = wishlist.includes(product.id);
  const relatedProducts = (() => {
    const others = products.filter((p: any) => p.id !== product.id && p.inStock !== false);
    const sameClass = others.filter((p: any) => p.cls === product.cls);
    const combos = others.filter((p: any) => p.category === 'combo');
    const pool = [...combos, ...sameClass, ...others];
    const seen = new Set<string | number>();
    return pool.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }).slice(0, 4);
  })();
  const comboUpsell = products.find(
    (p: any) =>
      p.id !== product.id &&
      p.category === 'combo' &&
      p.inStock !== false &&
      (p.cls === product.cls || String(p.title || '').includes(product.cls))
  );

  const checkPincode = (e: React.FormEvent) => {
    e.preventDefault();
    const result = pincodeDeliveryMessage(pincode);
    setPincodeOk(result.ok);
    if (result.ok) {
      const estimate = getSTCourierDeliveryEstimate(result.region === 'tn' ? 'Tamil Nadu' : 'Other State');
      setPincodeMsg(`✓ ${result.message} Est. ${estimate.formattedDate}.`);
    } else {
      setPincodeMsg(`⚠️ ${result.message}`);
    }
  };

  const shareProduct = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = `${product.title} — ₹${product.price} | Blessing Power Guide`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: product.title, text, url });
        return;
      }
    } catch {
      /* user cancelled or share failed — fall through */
    }
    try {
      await navigator.clipboard.writeText(url);
      alert('Link copied — share it with classmates!');
    } catch {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`,
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col pb-36 md:pb-0">
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
            aggregateRating:
              displayCount > 0
                ? {
                    '@type': 'AggregateRating',
                    ratingValue: calculatedAvg,
                    reviewCount: displayCount,
                  }
                : undefined,
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
              <Image
                src={
                  activeImg ||
                  product.image ||
                  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'
                }
                alt={product.title}
                width={480}
                height={480}
                priority
                className="max-h-full max-w-full object-contain transition-transform duration-300 hover:scale-105"
                sizes="(max-width: 1024px) 90vw, 480px"
                unoptimized={imageNeedsUnoptimized(activeImg || product.image || '')}
              />
              {product.badge ? (
                <span className={`absolute top-3 left-3 text-[10px] font-extrabold text-white px-2.5 py-1 rounded shadow-xs uppercase tracking-wider ${product.badgeColor || 'bg-blue-600'}`}>
                  {product.badge}
                </span>
              ) : null}
            </div>

            <div className="flex gap-3">
              {[product.image, product.hoverImage || product.image].map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveImg(img)}
                  className={`w-16 h-16 rounded-lg border-2 p-1 bg-slate-50 overflow-hidden relative ${
                    activeImg === img ? 'border-blue-600' : 'border-slate-200'
                  }`}
                >
                  <Image
                    src={img || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=80&q=80'}
                    alt=""
                    width={64}
                    height={64}
                    className="w-full h-full object-contain"
                    unoptimized={imageNeedsUnoptimized(img || '')}
                  />
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
                  type="button"
                  onClick={() => void shareProduct()}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                  aria-label="Share product"
                >
                  <Share2 className="w-5 h-5 text-slate-600" />
                </button>
              </div>
            </div>

            {/* Ratings */}
            {displayCount > 0 ? (
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
                <span className="text-xs text-slate-400">
                  • ({displayCount} verified {displayCount === 1 ? 'review' : 'reviews'})
                </span>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mb-4">No verified reviews yet</p>
            )}

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
                  <p className={`text-xs font-bold flex items-center gap-1.5 ${pincodeOk ? 'text-emerald-700' : 'text-red-600'}`}>
                    {pincodeOk && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                    {pincodeMsg}
                  </p>
                  {pincodeOk && (
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
            <div className="flex gap-3 mt-auto">
              {product.inStock === false ? (
                <button
                  disabled
                  className="w-full bg-slate-200 text-slate-500 font-extrabold text-sm py-3.5 px-6 rounded-xl uppercase tracking-wider cursor-not-allowed"
                >
                  OUT OF STOCK
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      addToCart(product);
                    }}
                    className="flex-1 bg-[#0044AA] text-white font-extrabold text-sm py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 uppercase tracking-wider"
                  >
                    <ShoppingBag className="w-4 h-4 text-amber-400" />
                    <span>ADD TO CART</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addToCart(product);
                      setIsCheckoutOpen(true);
                      router.push('/checkout');
                    }}
                    className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-sm py-3.5 px-4 rounded-xl shadow-md uppercase tracking-wider"
                  >
                    BUY NOW
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs mb-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-6 mb-6 gap-4">
            <div>
              <h3 className="font-heading font-black text-2xl text-[#001B3A]">
                Verified Student Reviews
              </h3>
              <div className="flex items-center gap-2 mt-1">
                {displayCount > 0 ? (
                  <>
                    <div className="flex text-amber-400">
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          className={`w-4 h-4 ${i < Math.round(Number(calculatedAvg)) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                        />
                      ))}
                    </div>
                    <span className="font-extrabold text-slate-900 text-sm">{calculatedAvg} / 5</span>
                    <span className="text-slate-400 text-xs">• {displayCount} verified reviews</span>
                  </>
                ) : (
                  <span className="text-slate-400 text-xs">Real ratings from delivered orders only</span>
                )}
              </div>
            </div>
            {userReview ? (
              <button
                onClick={() => {
                  setIsEditingReview(true);
                  setShowReviewForm(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-xs cursor-pointer"
              >
                EDIT YOUR REVIEW
              </button>
            ) : canReview ? (
              <button
                onClick={() => {
                  if (!user) { setIsAuthOpen(true); return; }
                  setShowReviewForm(!showReviewForm);
                }}
                className="bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
              >
                <Star className="w-4 h-4 fill-[#001B3A]" />
                <span>{showReviewForm ? 'CLOSE' : 'WRITE REVIEW'}</span>
              </button>
            ) : user ? (
              <p className="text-[10px] font-bold text-slate-500 max-w-xs text-right">
                Buy & receive delivery to leave a verified review
              </p>
            ) : (
              <button
                onClick={() => setIsAuthOpen(true)}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Login to review after purchase
              </button>
            )}
          </div>

          {(showReviewForm && (canReview || isEditingReview)) && (
            <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 mb-6 space-y-4">
              <h4 className="font-heading font-black text-sm text-[#001B3A]">
                {isEditingReview ? '✏️ Edit your verified review' : '📝 Rate this book (verified purchase)'}
              </h4>

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

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Photos (optional, max 5)</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {reviewImages.map((url, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                      <Image
                        src={url}
                        alt=""
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                        unoptimized={imageNeedsUnoptimized(url)}
                      />
                      <button
                        type="button"
                        onClick={() => setReviewImages((p) => p.filter((_, j) => j !== i))}
                        className="absolute top-0 right-0 bg-red-500 text-white text-[8px] px-1"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {reviewImages.length < 5 && (
                    <label className="w-16 h-16 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center cursor-pointer text-[10px] font-bold text-slate-500">
                      {uploadingImage ? '…' : '+ Photo'}
                      <input type="file" accept="image/*" className="hidden" onChange={handleReviewImageUpload} />
                    </label>
                  )}
                </div>
              </div>

              <button
                disabled={isSubmittingReview || reviewText.trim().length < 10}
                onClick={() => void submitReview()}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-extrabold text-xs px-6 py-3 rounded-xl transition-all shadow-md cursor-pointer uppercase tracking-wider"
              >
                {isSubmittingReview ? 'SAVING…' : isEditingReview ? 'UPDATE REVIEW' : 'SUBMIT REVIEW'}
              </button>
            </div>
          )}

          {dbReviews.length === 0 ? (
            <div className="py-10 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Star className="w-8 h-8 mx-auto mb-2 text-amber-400 opacity-60" />
              <p className="text-xs font-bold text-slate-700">No verified reviews yet.</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Only students who bought & received this book can review.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dbReviews.map((rev: any) => (
                <div key={rev.id || rev.studentName + rev.comment} className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{rev.studentName}</div>
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 uppercase">
                        Verified Purchase
                      </span>
                    </div>
                    <div className="flex gap-0.5">
                      {Array.from({ length: rev.rating || 5 }).map((_, i) => (
                        <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>
                  <p className="text-slate-600 text-xs leading-relaxed font-medium">&ldquo;{rev.comment}&rdquo;</p>
                  {rev.images?.length > 0 && (
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {rev.images.map((url: string, i: number) => (
                        <Image
                          key={i}
                          src={url}
                          alt=""
                          width={56}
                          height={56}
                          className="w-14 h-14 rounded-lg object-cover border"
                          unoptimized={imageNeedsUnoptimized(url)}
                        />
                      ))}
                    </div>
                  )}
                  {rev.createdAt && (
                    <p className="text-[10px] text-slate-400 mt-2">{rev.createdAt}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recommended Products */}
        {relatedProducts.length > 0 && (
          <section className="mt-12">
            <h3 className="font-heading font-extrabold text-xl text-[#001B3A] mb-6 uppercase tracking-wide">
              {comboUpsell || relatedProducts.some((p) => p.category === 'combo')
                ? 'COMBOS & RELATED GUIDES'
                : 'RECOMMENDED FOR YOU'}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Sticky Mobile CTA — sits above bottom nav + safe area */}
      <div
        className="fixed inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 z-40 sm:hidden flex items-center gap-2 shadow-2xl"
        style={{ bottom: 'calc(3.75rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={() => toggleWishlist(product.id)}
          className="p-3.5 rounded-xl border border-slate-300 text-slate-700 bg-slate-50 flex-shrink-0 min-h-12 min-w-12"
        >
          <Heart className={`w-5 h-5 ${isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'}`} />
        </button>

        <button
          onClick={() => {
            if (!user) { setIsAuthOpen(true); return; }
            if (product.inStock === false) return;
            addToCart(product);
          }}
          disabled={product.inStock === false}
          className="flex-1 bg-[#0044AA] hover:bg-[#001B3A] disabled:bg-slate-300 disabled:text-slate-500 text-white font-extrabold text-xs py-3.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md uppercase tracking-wider cursor-pointer disabled:cursor-not-allowed min-h-12"
        >
          <ShoppingBag className="w-4 h-4 text-amber-400" />
          <span>{product.inStock === false ? 'OUT OF STOCK' : 'ADD TO CART'}</span>
        </button>
      </div>

      <Footer />
    </main>
  );
}
