'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Star,
  ShoppingBag,
  Heart,
  Truck,
  Share2,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  ThumbsUp,
  X,
  Camera,
  ArrowUpDown,
  Check,
  Zap,
  Sparkles,
  Layers,
} from 'lucide-react';

import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { orderBookWhatsAppUrl } from '@/lib/shopContact';
import { serializeJsonLd } from '@/lib/jsonLd';
import { ProductCard } from '@/components/ui/ProductCard';
import { FrequentlyBoughtTogether } from '@/components/products/FrequentlyBoughtTogether';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';
import { pincodeDeliveryMessage } from '@/lib/pincode';
import { authHeaders, authFormHeaders } from '@/lib/clientAuth';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { MIN_BOOKS_PER_ORDER, booksUntilMinOrder, minOrderCheckoutMessage, isComboItem } from '@/lib/deliveryRules';
import { getComboIncludedSubjects, getComboSavingsSummary, type ComboSubject } from '@/lib/comboMetadata';
import {
  normalizeProductMedium,
  isProductMultiMedium,
  getProductMediumBadge,
  resolveCartItemMedium,
} from '@/lib/productMedium';

export const PDP_RELEASE_VERSION = 'bpg-pdp-v20261025-r3';

function getGalleryCoverMeta(
  product: any,
  index: number,
  totalCovers: number,
  comboSubjects: ComboSubject[]
): { title: string; subtitle?: string; badge: string } {
  const isCombo = isComboItem(product);
  if (!isCombo) {
    return {
      title: `${product?.title || 'Book'} (Cover #${index + 1})`,
      subtitle: undefined,
      badge: `#${index + 1}`,
    };
  }

  // Check if index 0 is the full combo box set cover
  const hasDistinctBoxCover = Boolean(
    product?.image &&
    Array.isArray(product?.images) &&
    product.images.some((img: string) => img !== product.image)
  );

  if (index === 0 && hasDistinctBoxCover) {
    const count = comboSubjects.length > 0 ? `${comboSubjects.length}-in-1 ` : '';
    return {
      title: `${product?.cls ? `${product.cls} Std ` : ''}${count}Combo Box Set`,
      subtitle: `Complete ${comboSubjects.length || totalCovers - 1}-Book Bundle`,
      badge: 'Box Set',
    };
  }

  // Determine subject index: if index 0 is Box Set, then subject index is index - 1
  const subjIndex = hasDistinctBoxCover ? index - 1 : index;
  const sub = comboSubjects[subjIndex];

  if (sub) {
    return {
      title: `${sub.name} Guide`,
      subtitle: sub.tamilName || undefined,
      badge: sub.shortName || sub.name,
    };
  }

  return {
    title: `Guide Cover #${index + 1}`,
    subtitle: undefined,
    badge: `#${index + 1}`,
  };
}

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
  const searchParams = useSearchParams();
  const queryMedium = searchParams?.get('medium');
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
  const [reviewRole, setReviewRole] = useState<'Parent' | 'Student' | 'Teacher'>('Parent');
  const [reviewDistrict, setReviewDistrict] = useState('Madurai');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [selectedRatingFilter, setSelectedRatingFilter] = useState<number | null>(null);
  const [reviewSort, setReviewSort] = useState<'newest' | 'highest' | 'lowest' | 'helpful'>('newest');
  const [photosOnlyFilter, setPhotosOnlyFilter] = useState(false);
  const [helpfulVoted, setHelpfulVoted] = useState<Record<string, boolean>>({});
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const normalizedSlug = useMemo(() => {
    return decodeURIComponent(String(slug || ''))
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
  }, [slug]);

  const storeProduct = useMemo(() => {
    return (
      products.find((p: any) => {
        if (dbProduct?.id && String(p.id) === String(dbProduct.id)) return true;
        if (String(p.id) === String(slug)) return true;
        const pSlug = decodeURIComponent(String(p.slug || ''))
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-');
        return pSlug && normalizedSlug && pSlug === normalizedSlug;
      }) || null
    );
  }, [products, dbProduct?.id, slug, normalizedSlug]);

  // storeProduct is kept live in realtime by the SSE stock/catalog stream in
  // StoreContext — merge with dbProduct so any admin edit (price, stock, language,
  // badge, title, samplePdf) updates this page instantly with 0 refresh.
  // Authoritative dbProduct takes precedence over local client cache.
  const product = useMemo(() => {
    if (!dbProduct && !storeProduct) return null;
    if (!dbProduct) return storeProduct;
    if (!storeProduct) return dbProduct;
    return {
      ...storeProduct,
      ...dbProduct,
      description: dbProduct.description || storeProduct.description,
      features:
        Array.isArray(dbProduct.features) && dbProduct.features.length > 0
          ? dbProduct.features
          : storeProduct.features || ['Solved Papers', 'Chapter Notes'],
      samplePdfUrl: dbProduct.samplePdfUrl !== undefined ? dbProduct.samplePdfUrl : storeProduct.samplePdfUrl,
      image: dbProduct.image || storeProduct.image,
      images: (Array.isArray(dbProduct.images) && dbProduct.images.length > 0)
        ? dbProduct.images
        : (Array.isArray(storeProduct.images) && storeProduct.images.length > 0)
        ? storeProduct.images
        : undefined,
    };
  }, [dbProduct, storeProduct]);

  const allImages = useMemo(() => {
    const list: string[] = [];
    const sourceImages = (Array.isArray(product?.images) && product.images.length > 0)
      ? product.images
      : (product?.image ? [product.image] : []);

    sourceImages.forEach((img: any) => {
      const s = String(img || '').trim();
      if (s && !s.startsWith('data:') && !list.includes(s)) list.push(s);
    });

    if (product?.image && !list.includes(product.image)) {
      list.unshift(product.image);
    }
    if (product?.hoverImage && !list.includes(product.hoverImage)) {
      list.push(product.hoverImage);
    }
    return list.length > 0 ? list : ['https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'];
  }, [product?.images, product?.image, product?.hoverImage]);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Auto-cycle through covers every 3.5 seconds if more than 1 image and not paused/hovered
  useEffect(() => {
    if (allImages.length <= 1 || isCarouselPaused || isHovered) return;
    const interval = setInterval(() => {
      setActiveImageIndex((prev) => (prev + 1) % allImages.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [allImages.length, isCarouselPaused, isHovered]);

  // Keep index within bounds if images change
  useEffect(() => {
    if (activeImageIndex >= allImages.length) {
      setActiveImageIndex(0);
    }
  }, [allImages.length, activeImageIndex]);

  const [isMobileAdded, setIsMobileAdded] = useState(false);
  const minOrderMsg = minOrderCheckoutMessage(cartCount);

  const isMultiMedium = isProductMultiMedium(product?.language);
  const mediumType = normalizeProductMedium(product?.language);
  const mediumBadge = getProductMediumBadge(product?.language);

  const tamilStock = product?.stock_tamil !== undefined && product?.stock_tamil !== null
    ? Number(product.stock_tamil)
    : (product?.stockTamil !== undefined && product?.stockTamil !== null ? Number(product.stockTamil) : null);

  const englishStock = product?.stock_english !== undefined && product?.stock_english !== null
    ? Number(product.stock_english)
    : (product?.stockEnglish !== undefined && product?.stockEnglish !== null ? Number(product.stockEnglish) : null);

  const isTamilSoldOut = tamilStock !== null && tamilStock <= 0;
  const isEnglishSoldOut = englishStock !== null && englishStock <= 0;

  const initialMedium = useMemo(() => {
    if (!isMultiMedium) {
      return mediumType === 'English' ? 'English Medium' : 'Tamil Medium';
    }
    if (queryMedium) {
      const q = queryMedium.trim().toLowerCase();
      if (q.includes('english') && !isEnglishSoldOut) return 'English Medium';
      if (q.includes('tamil') && !isTamilSoldOut) return 'Tamil Medium';
    }
    if (isTamilSoldOut && !isEnglishSoldOut) return 'English Medium';
    if (isEnglishSoldOut && !isTamilSoldOut) return 'Tamil Medium';
    return 'Tamil Medium';
  }, [isMultiMedium, mediumType, queryMedium, isTamilSoldOut, isEnglishSoldOut]);

  const [selectedMedium, setSelectedMedium] = useState<string>(initialMedium);

  // Auto-correct medium only when product language or stock data changes.
  // IMPORTANT: selectedMedium is intentionally NOT in deps — including it
  // would revert every user click, making the toggle non-functional.
  useEffect(() => {
    if (!isMultiMedium) {
      setSelectedMedium(mediumType === 'English' ? 'English Medium' : 'Tamil Medium');
      return;
    }
    // Only auto-correct if the currently selected medium became sold out
    setSelectedMedium((prev) => {
      const onTamil = prev === 'Tamil Medium';
      const onEnglish = prev === 'English Medium';
      if (onTamil && isTamilSoldOut && !isEnglishSoldOut) return 'English Medium';
      if (onEnglish && isEnglishSoldOut && !isTamilSoldOut) return 'Tamil Medium';
      return prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.language, mediumType, isMultiMedium, isTamilSoldOut, isEnglishSoldOut]);

  const isComingSoon = Boolean(product?.isComingSoon || product?.is_coming_soon || product?.status === 'coming_soon');
  const bothMediumsSoldOut = isMultiMedium && isTamilSoldOut && isEnglishSoldOut;
  const isCurrentMediumSoldOut = !isComingSoon && isMultiMedium && ((selectedMedium === 'Tamil Medium' && isTamilSoldOut) || (selectedMedium === 'English Medium' && isEnglishSoldOut));
  const isProductOutOfStock = !isComingSoon && (product?.inStock === false || (product?.stock !== undefined && product?.stock <= 0) || bothMediumsSoldOut);

  const currentMediumRemainingStock = selectedMedium === 'Tamil Medium' && tamilStock !== null
    ? tamilStock
    : selectedMedium === 'English Medium' && englishStock !== null
    ? englishStock
    : (typeof product?.stock === 'number' ? product.stock : null);

  const finalMedium = resolveCartItemMedium(product?.language, selectedMedium);

  const handleMobileAddToCart = () => {
    if (!product || isProductOutOfStock || isCurrentMediumSoldOut || isComingSoon) return;
    addToCart(product, 1, finalMedium);
    setIsMobileAdded(true);
    setTimeout(() => setIsMobileAdded(false), 1800);
  };

  const tryBuyNow = () => {
    if (!product || isComingSoon) return;
    addToCart(product, 1, finalMedium);
    if (!user) {
      setIsAuthOpen(true);
      showToast('Book added to cart! Please sign in with Google to proceed.');
      return;
    }
    if (isComboItem(product)) {
      showToast(`Added ${product.title}! 🎁 FREE Express Delivery Unlocked!`);
      setIsCheckoutOpen(true);
      router.push('/checkout');
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

      const fetchSlug = knownId ? String(knownId) : (normalizedSlug || slug);
      const productPromise = fetch(`/api/products?slug=${encodeURIComponent(fetchSlug)}&fresh=1`)
        .then(async (res) => {
          if (!res.ok) return initialProduct || null;
          const list = await res.json();
          return Array.isArray(list) && list.length > 0 ? list[0] : initialProduct || null;
        })
        .catch(() => initialProduct || null);

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
  }, [slug, normalizedSlug, user?.token]);

  // Listen for realtime catalog & stock change events pushed via SSE / StoreContext
  useEffect(() => {
    const handleLiveCatalogChange = (e?: any) => {
      const currentId = dbProduct?.id || storeProduct?.id;
      // If the event provided detailed book data directly (e.g. from stock-changed), apply it immediately
      if (Array.isArray(e?.detail) && currentId) {
        const directMatch = e.detail.find((b: any) => String(b.id) === String(currentId));
        if (directMatch) {
          setDbProduct((prev: any) => ({ ...(prev || {}), ...directMatch }));
        }
      }
      const bookIds = e?.detail?.bookIds || (Array.isArray(e?.detail) ? e.detail.map((b: any) => String(b.id)) : []);
      if (bookIds && bookIds.length > 0 && currentId) {
        if (!bookIds.map(String).includes(String(currentId))) {
          return;
        }
      }
      const fetchSlug = currentId ? String(currentId) : (normalizedSlug || slug);
      fetch(`/api/products?slug=${encodeURIComponent(fetchSlug)}&fresh=1&_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((list) => {
          if (Array.isArray(list) && list.length > 0) {
            setDbProduct(list[0]);
          }
        })
        .catch(() => {});
    };

    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('bpg_catalog_bus');
        bc.onmessage = () => handleLiveCatalogChange();
      }
    } catch (_) {}

    window.addEventListener('bpg:catalog-changed', handleLiveCatalogChange);
    window.addEventListener('bpg:stock-changed', handleLiveCatalogChange);
    return () => {
      try { bc?.close(); } catch (_) {}
      window.removeEventListener('bpg:catalog-changed', handleLiveCatalogChange);
      window.removeEventListener('bpg:stock-changed', handleLiveCatalogChange);
    };
  }, [slug, normalizedSlug, dbProduct?.id, storeProduct?.id]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const coverParam = p.get('cover');
      if (coverParam !== null) {
        const idx = parseInt(coverParam, 10);
        if (!isNaN(idx) && idx >= 0 && idx < allImages.length) {
          setActiveImageIndex(idx);
          return;
        }
      }
    }
    setActiveImageIndex(0);
  }, [product?.id, product?.image, allImages.length]);

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
          district: reviewDistrict,
          reviewerType: reviewRole,
          studentClass: product?.cls ? `${product.cls} Standard` : '10th Standard',
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
  const isCombo = isComboItem(product);
  const comboSubjects = isCombo ? getComboIncludedSubjects(product) : [];
  const comboSavings = isCombo ? getComboSavingsSummary(product) : null;
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
          __html: serializeJsonLd({
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
          {/* Gallery with Multi-cover Smooth Auto-Cycling Carousel */}
          <div
            className="lg:col-span-5 flex flex-col items-center"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className={`w-full h-84 sm:h-96 md:h-[400px] border rounded-2xl p-4 flex items-center justify-center relative overflow-hidden mb-3 transition-all select-none ${isProductOutOfStock ? 'bg-slate-100 border-slate-300' : 'bg-gradient-to-b from-slate-50 to-slate-100/70 border-slate-200'}`}>
              <div
                key={activeImageIndex}
                className="w-full h-full flex items-center justify-center transition-all duration-500 ease-out animate-in fade-in zoom-in-95"
              >
                <Image
                  src={
                    allImages[activeImageIndex] ||
                    product.image ||
                    'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80'
                  }
                  alt={`${product.title}${product.cls ? ` Class ${product.cls}` : ''} Guide Book Cover ${activeImageIndex + 1} of ${allImages.length} — Blessing Power Guide`}
                  width={480}
                  height={480}
                  priority={activeImageIndex === 0}
                  className={`max-h-full max-w-full object-contain drop-shadow-md transition-transform duration-300 hover:scale-105 ${isProductOutOfStock ? 'grayscale opacity-60' : ''}`}
                  sizes="(max-width: 1024px) 90vw, 480px"
                  unoptimized={imageNeedsUnoptimized(allImages[activeImageIndex] || product.image || '')}
                />
              </div>

              {isProductOutOfStock ? (
                <span className="absolute top-3 left-3 text-[10px] font-black text-white px-2.5 py-1 rounded shadow-xs uppercase tracking-wider bg-slate-700 z-10">
                  OUT OF STOCK
                </span>
              ) : product.badge ? (
                <span className={`absolute top-3 left-3 text-[10px] font-extrabold text-white px-2.5 py-1 rounded shadow-xs uppercase tracking-wider z-10 ${product.badgeColor || 'bg-blue-600'}`}>
                  {product.badge}
                </span>
              ) : null}

              {allImages.length > 1 && (
                <div className="absolute top-3 right-3 z-10">
                  <span className="bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-md flex items-center gap-1.5 border border-white/10">
                    <Layers className="w-3.5 h-3.5 text-blue-400" />
                    <span>
                      {getGalleryCoverMeta(product, activeImageIndex, allImages.length, comboSubjects).title} ({activeImageIndex + 1}/{allImages.length})
                    </span>
                  </span>
                </div>
              )}

              {allImages.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
                    }}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-800 shadow-md flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer border border-slate-200"
                    title="Previous cover"
                    aria-label="Previous cover"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex((prev) => (prev + 1) % allImages.length);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-slate-800 shadow-md flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer border border-slate-200"
                    title="Next cover"
                    aria-label="Next cover"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}

              {allImages.length > 1 && !isCarouselPaused && !isHovered && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-200/60 overflow-hidden">
                  <div
                    key={activeImageIndex}
                    className="h-full bg-blue-600 transition-all duration-[3500ms] ease-linear w-full animate-pulse"
                  />
                </div>
              )}
            </div>

            {allImages.length > 1 && (
              <div className="w-full mt-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 px-1 mb-1.5">
                  <span className="flex items-center gap-1.5 text-[#001B3A]">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Included in Box Set (Tap to view each cover):</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-semibold">{allImages.length} Covers</span>
                </div>
                <div className="w-full flex items-center justify-center gap-2 flex-wrap max-w-full py-1">
                  {allImages.map((img, i) => {
                    const coverMeta = getGalleryCoverMeta(product, i, allImages.length, comboSubjects);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setActiveImageIndex(i);
                          setIsCarouselPaused(true);
                        }}
                        className={`group relative w-13 h-17 sm:w-16 sm:h-20 rounded-xl border-2 p-1 bg-white overflow-hidden transition-all duration-200 cursor-pointer ${
                          activeImageIndex === i
                            ? 'border-blue-600 ring-2 ring-blue-500/30 scale-105 shadow-md'
                            : 'border-slate-200 hover:border-slate-400 opacity-80 hover:opacity-100'
                        }`}
                        title={coverMeta.title}
                      >
                        <Image
                          src={img}
                          alt={coverMeta.title}
                          width={64}
                          height={80}
                          className="w-full h-full object-contain"
                          unoptimized={imageNeedsUnoptimized(img)}
                        />
                        <span
                          className={`absolute bottom-0.5 right-0.5 text-[8px] font-black px-1 py-0.2 rounded shadow-2xs uppercase tracking-tight ${
                            activeImageIndex === i ? 'bg-blue-600 text-white' : 'bg-slate-900/85 text-white'
                          }`}
                        >
                          {coverMeta.badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
            {displayCount > 0 && (
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
              </div>
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

            {/* Coming Soon Alert OR Live Stock Urgency or Medium Sold Out Alert */}
            {isComingSoon ? (
              <div className="flex items-center gap-2.5 text-xs font-black text-amber-950 bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border border-amber-300 px-4 py-3 rounded-xl mb-4 shadow-2xs">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0 animate-pulse" />
                <span>🚀 This book is Coming Soon! Printing in progress — availability will open shortly.</span>
              </div>
            ) : isCurrentMediumSoldOut ? (
              <div className="flex items-center gap-2 text-xs font-black text-rose-800 bg-rose-50 border border-rose-200 px-3.5 py-2.5 rounded-xl mb-4 shadow-2xs">
                <span>⚠️ {selectedMedium} is Sold Out! {(!isTamilSoldOut || !isEnglishSoldOut) ? 'Please switch to the available medium below.' : ''}</span>
              </div>
            ) : (
              currentMediumRemainingStock !== null && currentMediumRemainingStock > 0 && currentMediumRemainingStock <= 8 && (
                <div className="flex items-center gap-2 text-xs font-extrabold text-amber-800 bg-amber-50 border border-amber-200/80 px-3.5 py-2 rounded-xl mb-4 shadow-2xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                  </span>
                  <span>🔥 High Demand: Only {currentMediumRemainingStock} {currentMediumRemainingStock === 1 ? 'copy' : 'copies'} remaining{isMultiMedium ? ` (${selectedMedium})` : ''}!</span>
                </div>
              )
            )}

            {/* Quick Visual "What's Inside This Combo" Showcase Pills */}
            {isCombo && comboSubjects.length > 0 && (
              <div className="mb-5 p-3 rounded-2xl bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-purple-50/60 border border-blue-200/80 shadow-2xs">
                <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-blue-950 mb-2">
                  <span className="flex items-center gap-1.5">
                    <span>🎁 Complete Box Set ({comboSubjects.length} Books Included):</span>
                  </span>
                  <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                    ALL INCLUDED
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {comboSubjects.map((sub) => (
                    <span
                      key={sub.name}
                      className="inline-flex items-center gap-1 text-xs font-black px-2.5 py-1 rounded-xl bg-white border border-blue-200 text-slate-800 shadow-2xs hover:border-blue-400 transition-colors"
                      title={sub.description}
                    >
                      <span className="text-sm leading-none">{sub.icon}</span>
                      <span>{sub.name}</span>
                      {sub.tamilName && (
                        <span className="text-[10px] text-blue-600 font-bold font-tamil">({sub.tamilName})</span>
                      )}
                    </span>
                  ))}
                </div>
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
                      {isCombo ? (
                        <span className="text-emerald-700 font-extrabold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                          <Truck className="w-3 h-3" /> 100% FREE Doorstep Delivery
                        </span>
                      ) : (
                        <>
                          <span className="text-emerald-700 font-extrabold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                            <Truck className="w-3 h-3" /> FREE Delivery on 5+ Books
                          </span>
                          <span className="text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                            Min. Order: 4 Books
                          </span>
                        </>
                      )}
                      <span className="text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                        100% Secure Online Payment
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>




            {/* Medium / Language Selection Box */}
            <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-blue-50/70 via-slate-50 to-indigo-50/60 border border-blue-200/80 shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <span>🌐 Medium / பயிற்று மொழி</span>
                </span>
                {isMultiMedium && (
                  <span className="text-[10px] font-extrabold text-blue-700 bg-blue-100/90 px-2 py-0.5 rounded-full">
                    Choose below
                  </span>
                )}
              </div>

              {isMultiMedium ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isTamilSoldOut}
                    onClick={() => !isTamilSoldOut && setSelectedMedium('Tamil Medium')}
                    className={`p-2.5 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                      isTamilSoldOut
                        ? 'border-slate-200 bg-slate-100/90 text-slate-400 cursor-not-allowed opacity-75'
                        : selectedMedium === 'Tamil Medium'
                        ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20 cursor-pointer'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-black font-tamil ${isTamilSoldOut ? 'line-through text-slate-400' : ''}`}>தமிழ் வழி</span>
                      {isTamilSoldOut ? (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">
                          Sold Out
                        </span>
                      ) : (
                        selectedMedium === 'Tamil Medium' && <CheckCircle className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <span className={`text-[10px] font-bold mt-0.5 ${
                      isTamilSoldOut
                        ? 'text-slate-400'
                        : selectedMedium === 'Tamil Medium'
                        ? 'text-blue-100'
                        : 'text-slate-500'
                    }`}>
                      {isTamilSoldOut ? 'Out of stock' : 'Tamil Medium'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isEnglishSoldOut}
                    onClick={() => !isEnglishSoldOut && setSelectedMedium('English Medium')}
                    className={`p-2.5 rounded-xl border-2 text-left transition-all flex flex-col justify-between ${
                      isEnglishSoldOut
                        ? 'border-slate-200 bg-slate-100/90 text-slate-400 cursor-not-allowed opacity-75'
                        : selectedMedium === 'English Medium'
                        ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20 cursor-pointer'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-black ${isEnglishSoldOut ? 'line-through text-slate-400' : ''}`}>English Med</span>
                      {isEnglishSoldOut ? (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-500">
                          Sold Out
                        </span>
                      ) : (
                        selectedMedium === 'English Medium' && <CheckCircle className="w-4 h-4 text-white" />
                      )}
                    </div>
                    <span className={`text-[10px] font-bold mt-0.5 ${
                      isEnglishSoldOut
                        ? 'text-slate-400'
                        : selectedMedium === 'English Medium'
                        ? 'text-blue-100'
                        : 'text-slate-500'
                    }`}>
                      {isEnglishSoldOut ? 'Out of stock' : 'English Medium'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 bg-white rounded-xl border border-slate-200">
                  <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${mediumBadge.pillClasses}`}>
                    {mediumBadge.type === 'Tamil'
                      ? '📘 தமிழ் வழி (Tamil Medium Only)'
                      : mediumBadge.type === 'English'
                      ? '📗 English Medium Only'
                      : '🌐 Tamil & English Edition'}
                  </span>
                  <span className="text-[11px] text-slate-500 font-semibold truncate">
                    Ready to order
                  </span>
                </div>
              )}
            </div>

            {/* Actions — desktop/tablet; mobile uses sticky bar below */}
            <div className="hidden sm:flex flex-col gap-3 mt-auto">
              {isComingSoon ? (
                <div className="w-full py-4 px-6 bg-gradient-to-r from-amber-500/15 via-amber-400/25 to-amber-500/15 border-2 border-amber-400/70 text-amber-950 font-black text-sm rounded-2xl flex items-center justify-center gap-2.5 shadow-xs">
                  <Sparkles className="w-5 h-5 text-amber-600 animate-pulse" />
                  <span>🚀 COMING SOON — PRE-ORDERS OPENING SHORTLY</span>
                </div>
              ) : isCurrentMediumSoldOut ? (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-800 font-black text-sm">
                      ⚠️
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-amber-950">
                        {selectedMedium} is Currently Out of Stock
                      </h4>
                      <p className="text-xs text-amber-900/80 mt-0.5 leading-relaxed">
                        Good news! The {selectedMedium === 'Tamil Medium' ? 'English Medium' : 'Tamil Medium'} edition of this guide is in stock and ready to ship.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedMedium(selectedMedium === 'Tamil Medium' ? 'English Medium' : 'Tamil Medium')}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-300" />
                      <span>Switch to {selectedMedium === 'Tamil Medium' ? 'English Medium' : 'Tamil Medium'}</span>
                    </button>
                    <a
                      href={`https://wa.me/919486017820?text=${encodeURIComponent(`Hi Blessing Power Guide! Please notify me when ${product.title} (${selectedMedium}) is back in stock.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-3 px-4 bg-white border border-amber-300 hover:bg-amber-100/50 text-amber-900 font-extrabold text-xs rounded-xl shadow-2xs transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>Notify Me for {selectedMedium.replace(' Medium', '')}</span>
                    </a>
                  </div>
                </div>
              ) : isProductOutOfStock ? (
                <div className="rounded-2xl border-2 border-slate-300 bg-gradient-to-br from-slate-50 via-white to-amber-50/40 p-5 space-y-4 shadow-xs">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-700 text-lg">
                      📦
                    </div>
                    <div className="flex-1">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 text-slate-700 mb-1">
                        Currently Out of Stock
                      </div>
                      <h4 className="text-base font-black text-slate-900 leading-tight">
                        Next Print Batch in Progress / மறுபதிப்பு விரைவில்
                      </h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        Copies for this guide were quickly snapped up by students across Tamil Nadu. Our Sivakasi printing unit is actively preparing the next reprint batch.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                    <a
                      href={`https://wa.me/919486017820?text=${encodeURIComponent(`Hi Blessing Power Guide! Please notify me when ${product.title} (Class ${product.cls}) is back in stock.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-3 px-4 bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                    >
                      <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                      </svg>
                      <span>Notify Me on WhatsApp When In Stock</span>
                    </a>

                    <Link
                      href="/search"
                      className="py-3 px-4 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 font-extrabold text-xs sm:text-sm rounded-xl shadow-2xs flex items-center justify-center gap-1.5 transition-all text-center"
                    >
                      <span>Explore Other Guides</span>
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        addToCart(product, 1, finalMedium);
                      }}
                      className="flex-1 bg-[#0044AA] hover:bg-[#003388] text-white font-extrabold text-sm py-3.5 px-4 rounded-xl shadow-md flex items-center justify-center gap-2 uppercase tracking-wider min-h-12 cursor-pointer transition-all"
                    >
                      <ShoppingBag className="w-4 h-4 text-amber-400" />
                      <span>ADD TO CART</span>
                    </button>
                    <button
                      type="button"
                      onClick={tryBuyNow}
                      className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-sm py-3.5 px-4 rounded-xl shadow-md uppercase tracking-wider min-h-12 cursor-pointer transition-all"
                    >
                      BUY NOW
                    </button>
                  </div>

                  <a
                    href={orderBookWhatsAppUrl(product.title, finalMedium, product.discountPrice || product.price)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full mt-1.5 py-3 px-4 bg-[#25D366] hover:bg-[#20bd5a] text-white font-black text-xs sm:text-sm rounded-xl shadow-xs flex items-center justify-center gap-2 uppercase tracking-wider min-h-11 transition-all cursor-pointer"
                    title="Direct Order via WhatsApp"
                  >
                    <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                    </svg>
                    <span>ORDER ON WHATSAPP / வாட்ஸ்அப் மூலம் வாங்க</span>
                  </a>
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
            {!isCombo && minOrderMsg && !isComingSoon && product.inStock !== false && (
              <p className="mt-3 text-[11px] text-amber-800 font-medium bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {minOrderMsg} Same title can be added multiple times.
              </p>
            )}
          </div>
        </div>

        {/* Complete Box Set Showcase — Visual Book Breakdown & Savings Matrix */}
        {isCombo && comboSubjects.length > 0 && comboSavings && (
          <section className="bg-white border-2 border-blue-200 rounded-3xl p-5 sm:p-8 shadow-sm mb-12 relative overflow-hidden">
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-slate-200 pb-5 mb-6 gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-800 uppercase tracking-wider mb-2">
                  <span>🎁 All-in-1 Box Set Contents</span>
                </div>
                <h2 className="font-heading font-black text-2xl sm:text-3xl text-[#001B3A]">
                  What&apos;s Inside This Complete Combo Pack
                </h2>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl">
                  Everything your child needs for top exam scores in one single box. Every textbook is 100% updated to the latest Tamil Nadu State Board Samacheer Kalvi syllabus.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3.5 py-2 rounded-2xl shrink-0">
                <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-black text-emerald-800">
                  FREE ST Courier Delivery Unlocked
                </span>
              </div>
            </div>

            {/* Subject Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 mb-8">
              {comboSubjects.map((sub, idx) => (
                <div
                  key={sub.name}
                  className="relative bg-slate-50/70 hover:bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-4 transition-all duration-300 hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                          {sub.icon}
                        </span>
                        <div>
                          <h3 className="font-heading font-black text-base text-slate-900 leading-tight">
                            {sub.name}
                          </h3>
                          {sub.tamilName && (
                            <span className="text-xs font-bold text-blue-700 font-tamil">
                              {sub.tamilName}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${sub.color}`}>
                        {sub.tag}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed mb-3">
                      {sub.description}
                    </p>
                  </div>
                  <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-[11px] font-extrabold text-emerald-700">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Full Guide Included</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">Book #{idx + 1}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Value & Direct Savings Comparison Summary */}
            <div className="bg-gradient-to-br from-[#001B3A] to-[#002855] text-white rounded-2xl p-5 sm:p-6 shadow-lg">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                <div className="md:col-span-8">
                  <div className="text-amber-400 text-xs font-black uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <span>⚡ Maximum Savings Breakdown</span>
                  </div>
                  <h3 className="font-heading font-black text-xl sm:text-2xl text-white mb-2">
                    Why Buy The Combo Instead of Single Guides?
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs">
                    <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                      <div className="text-slate-300 text-[10px] font-bold">Individual Guides MRP</div>
                      <div className="text-base font-black text-slate-200 line-through">₹{comboSavings.individualMrp}</div>
                    </div>
                    <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                      <div className="text-slate-300 text-[10px] font-bold">Combo Offer Price</div>
                      <div className="text-lg font-black text-amber-400">₹{comboSavings.comboPrice}</div>
                    </div>
                    <div className="bg-emerald-500/20 border border-emerald-400/40 rounded-xl p-2.5 col-span-2 sm:col-span-1">
                      <div className="text-emerald-300 text-[10px] font-bold">Total Customer Benefit</div>
                      <div className="text-lg font-black text-emerald-300">Save ₹{comboSavings.totalCustomerSavings}</div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300 mt-3">
                    ✨ Includes instant book discount (-₹{comboSavings.cashSavings}) + 100% FREE ST Courier doorstep shipping (saves ₹150).
                  </p>
                </div>

                <div className="md:col-span-4 flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={tryBuyNow}
                    className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-black text-xs sm:text-sm py-3.5 px-4 rounded-xl uppercase tracking-wider shadow-md transition-all hover:scale-102 cursor-pointer flex items-center justify-center gap-2"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>Order Complete Box Set</span>
                  </button>
                  <p className="text-[10px] text-center text-slate-300 font-semibold">
                    🛡️ 100% Genuine Publisher Guides · Dispatched within 24 Hours
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Same Standard Frequently Bought Together Bundle — only for individual guides */}
        {!isCombo && <FrequentlyBoughtTogether currentProduct={product} />}


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

      {/* Mobile Sticky Bottom Action Bar ("Buy Now") — Flipkart / Amazon standard */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 sm:hidden bg-white/98 backdrop-blur-md border-t border-slate-200 shadow-[0_-6px_25px_rgba(0,27,58,0.12)] p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-all duration-300"
      >
        <div className="flex items-center gap-2 max-w-lg mx-auto">
          {/* Quick Wishlist */}
          <button
            type="button"
            onClick={() => toggleWishlist(product.id)}
            className="w-10 h-10 rounded-xl border border-slate-200 text-slate-700 bg-slate-50 flex items-center justify-center shrink-0 touch-manipulation active:scale-95 transition-transform"
            aria-label="Wishlist"
          >
            <Heart className={`w-4 h-4 transition-colors ${isWishlisted ? 'text-red-500 fill-red-500' : 'text-slate-400'}`} />
          </button>

          {/* Price & Savings Telemetry */}
          <div className="flex flex-col justify-center min-w-0 px-1">
            <div className="flex items-baseline gap-1 leading-none">
              <span className={`font-black text-base ${product.inStock === false ? 'text-slate-400' : 'text-[#001B3A]'}`}>
                ₹{product.price}
              </span>
              {product.mrp > product.price && (
                <span className="text-[10px] text-slate-400 line-through font-bold">
                  ₹{product.mrp}
                </span>
              )}
            </div>
            <div className="text-[9px] font-black mt-0.5 truncate">
              {isComingSoon ? (
                <span className="text-amber-600">🚀 Coming Soon</span>
              ) : product.inStock === false ? (
                <span className="text-red-600">Out of Stock</span>
              ) : isCombo ? (
                <span className="text-emerald-700 bg-emerald-50 px-1 rounded">🎁 FREE Courier</span>
              ) : product.discount > 0 ? (
                <span className="text-emerald-700 font-extrabold">{product.discount}% OFF</span>
              ) : (
                <span className="text-slate-500">ST Courier</span>
              )}
            </div>
            {isMultiMedium && !isProductOutOfStock && (
              <div className="flex items-center rounded-lg bg-slate-200/80 p-0.5 mt-1 border border-slate-300/70">
                <button
                  type="button"
                  disabled={isTamilSoldOut}
                  onClick={() => !isTamilSoldOut && setSelectedMedium('Tamil Medium')}
                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition-all ${
                    isTamilSoldOut
                      ? 'bg-slate-200 text-slate-400 line-through cursor-not-allowed opacity-60'
                      : selectedMedium === 'Tamil Medium' ? 'bg-[#0044AA] text-white shadow-xs'
                      : 'text-slate-600'
                  }`}
                  title={isTamilSoldOut ? 'Tamil Medium Sold Out' : 'Tamil Medium'}
                >
                  தமிழ்
                </button>
                <button
                  type="button"
                  disabled={isEnglishSoldOut}
                  onClick={() => !isEnglishSoldOut && setSelectedMedium('English Medium')}
                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-black transition-all ${
                    isEnglishSoldOut
                      ? 'bg-slate-200 text-slate-400 line-through cursor-not-allowed opacity-60'
                      : selectedMedium === 'English Medium' ? 'bg-[#0044AA] text-white shadow-xs'
                      : 'text-slate-600'
                  }`}
                  title={isEnglishSoldOut ? 'English Medium Sold Out' : 'English Medium'}
                >
                  Eng
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {isComingSoon ? (
            <div className="flex-1 py-3 px-3 bg-gradient-to-r from-amber-500/20 via-amber-400/30 to-amber-500/20 border border-amber-400 text-amber-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-2xs">
              <Sparkles className="w-4 h-4 text-amber-600 animate-pulse" />
              <span>🚀 COMING SOON</span>
            </div>
          ) : isCurrentMediumSoldOut ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setSelectedMedium(selectedMedium === 'Tamil Medium' ? 'English Medium' : 'Tamil Medium')}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[11px] py-3 px-2 rounded-xl uppercase tracking-wider flex items-center justify-center gap-1 min-h-11 cursor-pointer"
              >
                <span>Switch to {selectedMedium === 'Tamil Medium' ? 'Eng' : 'Tamil'}</span>
              </button>
              <a
                href={`https://wa.me/919486017820?text=${encodeURIComponent(`Hi Blessing Power Guide! Please notify me when ${product.title} (${selectedMedium}) is back in stock.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-11 h-11 bg-[#25D366] text-white rounded-xl flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                title="Notify on WhatsApp"
                aria-label="Notify on WhatsApp"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
              </a>
            </div>
          ) : isProductOutOfStock ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <a
                href={`https://wa.me/919486017820?text=${encodeURIComponent(`Hi Blessing Power Guide! Please notify me when ${product.title} (Class ${product.cls}) is back in stock.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-[#25D366] hover:bg-[#20bd5a] text-white font-extrabold text-[11px] py-3 px-2 rounded-xl uppercase tracking-wider flex items-center justify-center gap-1.5 min-h-11 shadow-xs cursor-pointer"
              >
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
                <span>Notify In Stock</span>
              </a>
              <Link
                href="/search"
                className="py-3 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-[11px] rounded-xl flex items-center justify-center min-h-11"
              >
                Other Books
              </Link>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <button
                type="button"
                onClick={handleMobileAddToCart}
                className={`font-black text-[11px] py-3 px-3 rounded-xl flex items-center justify-center gap-1 uppercase tracking-wider touch-manipulation min-h-11 transition-all duration-300 cursor-pointer ${
                  isMobileAdded
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 flex-1'
                    : 'bg-[#0044AA] hover:bg-[#003388] active:bg-[#001B3A] text-white flex-1'
                }`}
              >
                {isMobileAdded ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white animate-bounce" />
                    <span>ADDED</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                    <span>ADD</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={tryBuyNow}
                className="flex-[1.25] bg-gradient-to-r from-amber-400 via-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:brightness-95 text-[#001B3A] font-black text-xs py-3 px-2.5 rounded-xl uppercase tracking-wider touch-manipulation shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer min-h-11"
              >
                <Zap className="w-3.5 h-3.5 fill-[#001B3A] text-[#001B3A]" />
                <span>BUY NOW</span>
              </button>

              <a
                href={orderBookWhatsAppUrl(product.title, finalMedium, product.discountPrice || product.price)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-11 h-11 bg-[#25D366] active:bg-[#20bd5a] text-white rounded-xl flex items-center justify-center shrink-0 shadow-md shadow-[#25D366]/20 transition-all cursor-pointer"
                title="Order on WhatsApp"
                aria-label="Order on WhatsApp"
              >
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
              </a>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
}
