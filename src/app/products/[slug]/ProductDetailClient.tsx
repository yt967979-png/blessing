'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  FileText,
  Download,
  ThumbsUp,
  X,
  Camera,
  ArrowUpDown,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { ProductCard } from '@/components/ui/ProductCard';
import { FrequentlyBoughtTogether } from '@/components/products/FrequentlyBoughtTogether';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';
import { pincodeDeliveryMessage } from '@/lib/pincode';
import { authHeaders, authFormHeaders } from '@/lib/clientAuth';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { MIN_BOOKS_PER_ORDER, booksUntilMinOrder, minOrderCheckoutMessage } from '@/lib/deliveryRules';

function applyReviewsPayload(
  data: any,
  setters: {
    setReviewStats: (v: any) => void;
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

export default function ProductDetailClient({ slug, initialProduct }: { slug: string; initialProduct?: any }) {
  const router = useRouter();
  const { products, productsLoading, addToCart, toggleWishlist, wishlist, user, setIsAuthOpen, setIsCheckoutOpen, cartCount, showToast } = useStore();
  const [dbProduct, setDbProduct] = useState<any>(initialProduct || null);
  const [productFetchDone, setProductFetchDone] = useState(Boolean(initialProduct));
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
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<number | null>(null);
  const [reviewSort, setReviewSort] = useState<'newest' | 'highest' | 'lowest' | 'helpful'>('newest');
  const [photosOnlyFilter, setPhotosOnlyFilter] = useState(false);
  const [helpfulVoted, setHelpfulVoted] = useState<Record<string, boolean>>({});
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const storeProduct = products.find((p: any) => p.slug === slug || p.id === slug) || null;
  // dbProduct is fetched once; storeProduct is kept live by the catalog poll in
  // StoreContext — always prefer its stock/inStock so this page reflects an
  // admin stock change without a manual refresh.
  const product = dbProduct
    ? {
        ...dbProduct,
        price: storeProduct && typeof storeProduct.price === 'number' ? storeProduct.price : dbProduct.price,
        mrp: storeProduct && typeof storeProduct.mrp === 'number' ? storeProduct.mrp : dbProduct.mrp,
        discount: storeProduct && typeof storeProduct.discount === 'number' ? storeProduct.discount : dbProduct.discount,
        inStock: storeProduct ? storeProduct.inStock : dbProduct.inStock,
        stock: storeProduct ? storeProduct.stock : dbProduct.stock,
      }
    : storeProduct;
  const [activeImg, setActiveImg] = useState('');
  const minOrderMsg = minOrderCheckoutMessage(cartCount);

  const tryBuyNow = () => {
    if (!product) return;
    addToCart(product);
    if (!user) {
      setIsAuthOpen(true);
      showToast('Book added to cart! Please sign in with Google to proceed.');
      return;
    }
    const need = booksUntilMinOrder(cartCount + 1);
    if (need > 0) {
      showToast(`Added to cart. Minimum ${MIN_BOOKS_PER_ORDER} books — add ${need} more to checkout.`);
      return;
    }
    setIsCheckoutOpen(true);
    router.push('/checkout');
  };

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
      const knownId = initialProduct?.id || products.find((p: any) => p.slug === slug || p.id === slug)?.id;

      const productPromise = initialProduct
        ? Promise.resolve(initialProduct)
        : fetch(`/api/products?slug=${encodeURIComponent(slug)}`)
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
     
  }, [slug, user?.token]);

  useEffect(() => {
    if (product?.image) {
      setActiveImg(product.image);
    }
  }, [product?.image]);

  useEffect(() => {
    if (product?.title) {
      const cls = product.cls ? ` | ${product.cls} Standard` : '';
      document.title = `${product.title}${cls} | Blessing Power Guide`;
    }
  }, [product?.title, product?.cls]);

  const stillLoading = !product && (!productFetchDone || productsLoading);

  const displayCount = reviewStats.count > 0 ? reviewStats.count : dbReviews.length;
  const calculatedAvg =
    reviewStats.count > 0
      ? Number(reviewStats.avgRating).toFixed(1)
      : dbReviews.length > 0
        ? (dbReviews.reduce((sum, r) => sum + Number(r.rating || 5), 0) / dbReviews.length).toFixed(1)
        : '0.0';

  const ratingBreakdown = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const rawBreakdown = (reviewStats as any)?.breakdown;
    if (rawBreakdown && typeof rawBreakdown === 'object') {
      for (let s = 1; s <= 5; s++) {
        counts[s] = Number(rawBreakdown[s] || 0);
      }
    } else {
      dbReviews.forEach((r) => {
        const star = Math.round(Number(r.rating || 5));
        if (star >= 1 && star <= 5) counts[star] = (counts[star] || 0) + 1;
      });
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return { counts, total };
  }, [reviewStats, dbReviews]);

  const handleHelpfulVote = async (revId: string) => {
    if (helpfulVoted[revId]) return;
    setHelpfulVoted((prev) => ({ ...prev, [revId]: true }));
    setDbReviews((prev) =>
      prev.map((r) =>
        r.id === revId ? { ...r, helpfulCount: (Number(r.helpfulCount) || 0) + 1 } : r
      )
    );
    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vote_helpful', reviewId: revId }),
      });
    } catch (_) {}
  };

  const displayedReviews = useMemo(() => {
    let list = [...dbReviews];
    if (selectedRatingFilter !== null) {
      list = list.filter((r) => Math.round(Number(r.rating || 5)) === selectedRatingFilter);
    }
    if (photosOnlyFilter) {
      list = list.filter((r) => Array.isArray(r.images) && r.images.length > 0);
    }
    list.sort((a, b) => {
      if (reviewSort === 'highest') return (Number(b.rating) || 0) - (Number(a.rating) || 0);
      if (reviewSort === 'lowest') return (Number(a.rating) || 0) - (Number(b.rating) || 0);
      if (reviewSort === 'helpful') return (Number(b.helpfulCount) || 0) - (Number(a.helpfulCount) || 0);
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
    return list;
  }, [dbReviews, selectedRatingFilter, photosOnlyFilter, reviewSort]);

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
        headers: authFormHeaders(user),
        credentials: 'include',
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
        credentials: 'include',
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
      <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav md:pb-0">
        <AnnouncementBar />
        <Header />
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
      <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav md:pb-0">
        <AnnouncementBar />
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-xl font-bold text-slate-800">Product not found</h1>
          <p className="text-sm text-slate-500">This book is not in the catalog.</p>
          <Link href="/search" className="text-sm font-semibold text-blue-600 hover:underline">Browse all books →</Link>
        </div>
        <Footer />
      </main>
    );
  }

  const isWishlisted = Boolean(product?.id && wishlist.some((id) => String(id) === String(product.id)));
  const relatedProducts = (() => {
    const others = products.filter((p: any) => String(p.id) !== String(product.id) && p.inStock !== false);
    const sameClass = others.filter((p: any) => p.cls === product.cls);
    const pool = [...sameClass, ...others];
    const seen = new Set<string | number>();
    return pool.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    }).slice(0, 4);
  })();

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

  const shareViaWhatsApp = () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const discountText = product.discount > 0 ? ` (Save ${product.discount}% OFF)` : '';
    const text = `📚 *${product.title}*\n🎯 ${product.cls ? `${product.cls} Standard • ` : ''}${product.subject || 'Tamil Nadu Guide'}\n💰 Special Price: ₹${product.price}${discountText}\n🚚 Fast ST Courier Delivery across Tamil Nadu\n👉 Order directly here:\n${url}`;
    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener,noreferrer'
    );
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
      shareViaWhatsApp();
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav-pdp md:pb-0">
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

      <div className="max-w-7xl mx-auto px-4 py-5 sm:py-8 flex-1">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 md:p-8 shadow-xs grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8 mb-12">
          {/* Gallery */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="w-full h-80 bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-center relative overflow-hidden mb-4">
              <Image
                src={
                  activeImg ||
                  product.image ||
                  'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'
                }
                alt={`${product.title}${product.cls ? ` Class ${product.cls}` : ''} Guide Book Cover — Blessing Power Guide`}
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
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                  aria-label="Wishlist"
                >
                  <Heart className={`w-5 h-5 ${isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'}`} />
                </button>
                <button
                  type="button"
                  onClick={shareViaWhatsApp}
                  className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-[#25D366] transition-colors cursor-pointer"
                  title="Share on WhatsApp with classmates"
                  aria-label="Share on WhatsApp with classmates"
                >
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => void shareProduct()}
                  className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
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
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-3 flex items-baseline gap-3">
              <span className="text-3xl font-black text-[#001B3A]">₹{product.price}</span>
              {product.mrp > product.price && (
                <>
                  <span className="text-sm text-slate-400 line-through">₹{product.mrp}</span>
                  {product.discount > 0 && (
                    <span className="text-xs font-extrabold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">
                      Save {product.discount}% OFF
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Live Stock Urgency Pill */}
            {product.inStock !== false && typeof product.stock === 'number' && product.stock > 0 && product.stock <= 8 && (
              <div className="flex items-center gap-2 text-xs font-extrabold text-amber-800 bg-amber-50 border border-amber-200/80 px-3.5 py-2 rounded-xl mb-4 shadow-2xs">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                </span>
                <span>🔥 High Demand: Only {product.stock} {product.stock === 1 ? 'copy' : 'copies'} remaining!</span>
              </div>
            )}

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
              <form onSubmit={checkPincode} className="flex gap-2 max-w-sm items-stretch">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter delivery pincode"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 min-h-12 px-3.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-blue-600 font-bold"
                />
                <button
                  type="submit"
                  className="min-h-12 px-4 bg-blue-600 text-white font-extrabold text-xs rounded-lg hover:bg-blue-700 transition-colors uppercase cursor-pointer touch-manipulation shrink-0"
                >
                  CHECK
                </button>
              </form>

              {pincodeMsg && (
                <div className="mt-3 space-y-2">
                  <p className={`text-xs font-bold flex items-center gap-1.5 ${pincodeOk ? 'text-emerald-700' : 'text-red-600'}`}>
                    {pincodeOk && <CheckCircle className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />}
                    {pincodeMsg}
                  </p>
                  {pincodeOk && (
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="text-emerald-700 font-extrabold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                        <Truck className="w-3 h-3" /> FREE Delivery on 5+ Books
                      </span>
                      <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                        Min. Order: 4 Books
                      </span>
                      <span className="text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                        100% Secure Online Payment
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>



            {/* Sample PDF Preview / Free Download */}
            {product.samplePdfUrl && (
              <div className="mb-4">
                <a
                  href={product.samplePdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 px-4 bg-[#001B3A]/5 hover:bg-[#001B3A]/10 text-[#001B3A] border border-[#001B3A]/15 rounded-xl text-xs sm:text-sm font-black flex items-center justify-between gap-2.5 transition-all cursor-pointer shadow-2xs hover:shadow-xs group"
                  title="Preview or download sample pages before buying"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-[#001B3A] text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-extrabold text-[#001B3A]">
                        Preview sample pages
                      </div>
                      <div className="text-[11px] font-semibold text-slate-600">
                        Free PDF — check chapters before buying
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#001B3A] bg-white border border-[#001B3A]/20 px-3 py-1.5 rounded-lg shrink-0">
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    <span>View PDF</span>
                  </span>
                </a>
              </div>
            )}

            {/* Actions — desktop/tablet; mobile uses sticky bar below */}
            <div className="hidden sm:flex gap-3 mt-auto">
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
                    className="flex-1 bg-[#0044AA] text-white font-extrabold text-sm py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 uppercase tracking-wider min-h-12"
                  >
                    <ShoppingBag className="w-4 h-4 text-amber-400" />
                    <span>ADD TO CART</span>
                  </button>
                  <button
                    type="button"
                    onClick={tryBuyNow}
                    className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-sm py-3.5 px-4 rounded-xl shadow-md uppercase tracking-wider min-h-12"
                  >
                    BUY NOW
                  </button>
                </>
              )}
            </div>
            {/* 1-Click WhatsApp Share for Students & Classmates */}
            <button
              type="button"
              onClick={shareViaWhatsApp}
              className="hidden sm:flex w-full mt-3 py-3 px-4 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#128C7E] border border-[#25D366]/30 rounded-xl text-xs font-extrabold items-center justify-center gap-2 transition-all cursor-pointer shadow-2xs hover:shadow-xs"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
              </svg>
              <span>Share Book with Classmates on WhatsApp</span>
            </button>
            {minOrderMsg && product.inStock !== false && (
              <p className="hidden sm:block mt-3 text-[11px] text-amber-800 font-medium bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {minOrderMsg} Same title can be added multiple times.
              </p>
            )}
          </div>
        </div>

        {/* Same Standard Frequently Bought Together Bundle */}
        <FrequentlyBoughtTogether currentProduct={product} />

        <section className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs mb-12">
          {/* Section Heading & Review CTA */}
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-200 pb-6 mb-6 gap-4">
            <div>
              <h3 className="font-heading font-black text-2xl text-[#001B3A]">
                Customer & Student Reviews
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Authentic feedback from verified students who received this textbook
              </p>
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
                        className="absolute top-0 right-0 bg-red-500 text-white text-[8px] px-1 cursor-pointer"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {reviewImages.length < 5 && (
                    <label className="w-16 h-16 border-2 border-dashed border-slate-300 rounded-lg flex items-center justify-center cursor-pointer text-[10px] font-bold text-slate-500 hover:border-blue-500 transition-colors">
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

          {/* Rating Summary & Star Distribution Breakdown */}
          {displayCount > 0 && (
            <div className="bg-slate-50/80 border border-slate-200 rounded-2xl p-5 md:p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                {/* Score Column */}
                <div className="md:col-span-4 flex flex-col items-center justify-center text-center md:border-r md:border-slate-200 md:pr-6">
                  <div className="text-4xl md:text-5xl font-black text-[#001B3A] tracking-tight">
                    {calculatedAvg}
                  </div>
                  <div className="flex text-amber-400 my-2">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-5 h-5 ${i < Math.round(Number(calculatedAvg)) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                      />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-slate-700">
                    {displayCount} Verified Student {displayCount === 1 ? 'Review' : 'Reviews'}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    100% genuine delivered purchases
                  </span>
                </div>

                {/* Rating Distribution Bar Chart */}
                <div className="md:col-span-8 space-y-2">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = ratingBreakdown.counts[star] || 0;
                    const percent = ratingBreakdown.total > 0 ? Math.round((count / ratingBreakdown.total) * 100) : 0;
                    const isSelected = selectedRatingFilter === star;

                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setSelectedRatingFilter(isSelected ? null : star)}
                        className={`w-full flex items-center gap-3 p-1.5 rounded-lg transition-colors text-left group cursor-pointer ${
                          isSelected ? 'bg-amber-100/70 ring-1 ring-amber-300' : 'hover:bg-slate-100'
                        }`}
                      >
                        <span className="text-xs font-bold text-slate-700 w-12 shrink-0 flex items-center gap-1">
                          <span>{star}</span>
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        </span>

                        {/* Progress bar track */}
                        <div className="flex-1 h-3 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isSelected ? 'bg-amber-500' : 'bg-amber-400 group-hover:bg-amber-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        <span className="text-xs font-semibold text-slate-500 w-12 text-right shrink-0">
                          {percent}%
                        </span>
                        <span className="text-[11px] text-slate-400 w-8 text-right shrink-0">
                          ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Active Filter Pill indicator if filtered */}
              {selectedRatingFilter !== null && (
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-600">
                    Showing only <strong className="text-amber-600">{selectedRatingFilter}-Star</strong> reviews ({displayedReviews.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedRatingFilter(null)}
                    className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    Reset Filter (Show All)
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Sort & Filter Controls Bar */}
          {dbReviews.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  Sort:
                </span>
                {(
                  [
                    { key: 'newest', label: 'Most Recent' },
                    { key: 'highest', label: 'Highest Rated' },
                    { key: 'lowest', label: 'Lowest Rated' },
                    { key: 'helpful', label: 'Most Helpful' },
                  ] as const
                ).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setReviewSort(s.key)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      reviewSort === s.key
                        ? 'bg-[#2874f0] text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setPhotosOnlyFilter(!photosOnlyFilter)}
                className={`self-start sm:self-auto px-3 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                  photosOnlyFilter
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Photos Only ({dbReviews.filter((r) => r.images?.length > 0).length})</span>
              </button>
            </div>
          )}

          {/* Reviews Grid */}
          {displayedReviews.length === 0 ? (
            <div className="py-10 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
              <Star className="w-8 h-8 mx-auto mb-2 text-amber-400 opacity-60" />
              <p className="text-xs font-bold text-slate-700">
                {selectedRatingFilter !== null || photosOnlyFilter
                  ? 'No reviews match your selected filter.'
                  : 'No verified reviews yet.'}
              </p>
              {(selectedRatingFilter !== null || photosOnlyFilter) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRatingFilter(null);
                    setPhotosOnlyFilter(false);
                  }}
                  className="text-xs font-bold text-blue-600 hover:underline mt-2 cursor-pointer"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {displayedReviews.map((rev: any) => (
                <div key={rev.id || rev.studentName + rev.comment} className="bg-slate-50 border border-slate-200 rounded-xl p-5 flex flex-col justify-between hover:border-slate-300 transition-colors">
                  <div>
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
                          <button
                            key={i}
                            type="button"
                            onClick={() => setLightboxImg(url)}
                            className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 hover:opacity-90 hover:scale-105 transition-transform cursor-pointer"
                          >
                            <Image
                              src={url}
                              alt="Review image"
                              width={56}
                              height={56}
                              className="w-full h-full object-cover"
                              unoptimized={imageNeedsUnoptimized(url)}
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-3 mt-3 text-[11px] text-slate-400">
                    <span>{rev.createdAt || 'Delivered order'}</span>

                    <button
                      type="button"
                      onClick={() => handleHelpfulVote(rev.id)}
                      disabled={helpfulVoted[rev.id]}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors cursor-pointer ${
                        helpfulVoted[rev.id]
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span>
                        {helpfulVoted[rev.id] ? 'Helpful ✓' : 'Helpful'}
                        {Number(rev.helpfulCount || 0) > 0 ? ` (${rev.helpfulCount})` : ''}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lightbox Photo Preview Modal */}
          {lightboxImg && (
            <div
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm"
              onClick={() => setLightboxImg(null)}
            >
              <div
                className="relative max-w-2xl max-h-[85vh] bg-white rounded-2xl p-2 overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setLightboxImg(null)}
                  className="absolute top-4 right-4 bg-slate-900/80 hover:bg-slate-900 text-white rounded-full p-1.5 z-10 cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <img
                  src={lightboxImg}
                  alt="Student review photo"
                  className="max-h-[80vh] w-auto object-contain rounded-xl"
                />
              </div>
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

      {/* Sticky Mobile CTA — above bottom nav; ADD + BUY NOW */}
      <div
        className="fixed inset-x-0 bg-white/95 backdrop-blur-md border-t border-slate-200 p-2.5 z-40 sm:hidden flex items-center gap-2 shadow-2xl"
        style={{ bottom: 'calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          type="button"
          onClick={() => toggleWishlist(product.id)}
          className="p-3 rounded-xl border border-slate-300 text-slate-700 bg-slate-50 flex-shrink-0 min-h-12 min-w-12 touch-manipulation"
          aria-label="Wishlist"
        >
          <Heart className={`w-5 h-5 ${isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'}`} />
        </button>

        <button
          type="button"
          onClick={shareViaWhatsApp}
          className="p-3 rounded-xl border border-emerald-300 text-[#25D366] bg-emerald-50 flex-shrink-0 min-h-12 min-w-12 touch-manipulation flex items-center justify-center"
          aria-label="Share on WhatsApp"
          title="Share on WhatsApp"
        >
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
          </svg>
        </button>

        {product.inStock === false ? (
          <button
            type="button"
            disabled
            className="flex-1 bg-slate-200 text-slate-500 font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider cursor-not-allowed min-h-12"
          >
            OUT OF STOCK
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => addToCart(product)}
              className="flex-1 bg-[#0044AA] active:bg-[#001B3A] text-white font-extrabold text-[11px] py-3.5 rounded-xl flex items-center justify-center gap-1 shadow-md uppercase tracking-wider min-h-12 touch-manipulation"
            >
              <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
              <span>ADD</span>
            </button>
            <button
              type="button"
              onClick={tryBuyNow}
              className="flex-[1.2] bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-[11px] py-3.5 rounded-xl uppercase tracking-wider min-h-12 touch-manipulation shadow-md"
            >
              BUY NOW
            </button>
          </>
        )}
      </div>

      <Footer />
    </main>
  );
}
