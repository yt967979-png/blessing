'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Heart, Star, ShoppingBag, Truck, Check, FileText } from 'lucide-react';
import { Product } from '@/lib/products';
import { useStore } from '@/context/StoreContext';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { MIN_BOOKS_PER_ORDER, booksUntilMinOrder, isComboItem } from '@/lib/deliveryRules';
import { getComboIncludedSubjects } from '@/lib/comboMetadata';
import { openSamplePdfModal } from '@/components/books/SampleChapterReaderModal';

export const ProductCard = ({ product }: { product: Product }) => {
  const router = useRouter();
  const {
    wishlist,
    toggleWishlist,
    addToCart,
    setIsCartOpen,
    setIsCheckoutOpen,
    cartCount,
    showToast,
    user,
    setIsAuthOpen,
  } = useStore();

  const [isAdded, setIsAdded] = useState(false);
  const rawLang = (product.language || 'Both').trim();
  const lowerLang = rawLang.toLowerCase();
  const isMultiMedium =
    lowerLang === 'both' ||
    lowerLang.includes('both') ||
    (lowerLang.includes('tamil') && lowerLang.includes('english'));

  const defaultSelectedMedium = lowerLang.includes('english') && !lowerLang.includes('tamil')
    ? 'English Medium'
    : 'Tamil Medium';
  const [selectedMedium, setSelectedMedium] = useState<string>(defaultSelectedMedium);

  React.useEffect(() => {
    const l = (product.language || 'Both').trim().toLowerCase();
    if (l.includes('english') && !l.includes('tamil')) {
      setSelectedMedium('English Medium');
    } else if (l.includes('tamil') && !l.includes('english')) {
      setSelectedMedium('Tamil Medium');
    }
  }, [product.language]);

  const finalMedium = isMultiMedium
    ? selectedMedium
    : lowerLang.includes('tamil')
    ? 'Tamil Medium'
    : lowerLang.includes('english')
    ? 'English Medium'
    : rawLang;

  const isWishlisted = Boolean(product?.id && wishlist.some((id) => String(id) === String(product.id)));
  const rupeesSaved = product.mrp - product.price;
  const imgSrc = product.image;
  const productHref = `/products/${product.slug}`;
  const isOutOfStock = product.inStock === false;
  const isCombo = isComboItem(product);
  const comboSubjects = isCombo ? getComboIncludedSubjects(product) : [];

  const prefetchProduct = () => {
    router.prefetch(productHref);
  };

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    addToCart(product, 1, finalMedium);
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 1800);
  };

  return (
    <article
      className={`product-card-shell group border rounded-2xl p-3 sm:p-4 flex flex-col relative h-full shadow-sm transition-all duration-300 ${
        isOutOfStock
          ? 'bg-slate-100/95 border-slate-300 grayscale'
          : 'bg-white border-slate-200/90 hover:shadow-xl hover:border-blue-300/80 hover:-translate-y-1'
      }`}
      onPointerEnter={prefetchProduct}
    >
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
        {isOutOfStock ? (
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
        className={`absolute top-1.5 right-1.5 z-10 w-10 h-10 rounded-full border flex items-center justify-center shadow-sm touch-manipulation transition-all ${
          isOutOfStock
            ? 'bg-white/80 border-slate-300/90'
            : 'bg-white/90 backdrop-blur-md border-slate-200/80 hover:scale-110 active:scale-95'
        }`}
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
        className={`relative h-32 sm:h-48 rounded-xl flex items-center justify-center mb-2 overflow-hidden mt-1 border ${
          isOutOfStock ? 'bg-slate-100 border-slate-200' : 'bg-slate-50/80 border-slate-100'
        }`}
      >
        {isOutOfStock && (
          <div className="absolute inset-x-2 bottom-2 z-10 rounded-full bg-slate-900/85 text-white text-[9px] font-black uppercase tracking-wide text-center px-2 py-1">
            Out of Stock
          </div>
        )}
        <Image
          src={
            imgSrc ||
            'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'
          }
          alt={`${product.title}${product.cls ? ` Class ${product.cls}` : ''} Guide Book — Blessing Power Guide`}
          width={200}
          height={200}
          className={`max-h-[90%] max-w-[90%] object-contain transition-transform duration-300 ${
            isOutOfStock ? 'opacity-70' : 'group-hover:scale-105'
          }`}
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
        className={`font-heading font-black text-xs sm:text-sm leading-snug mb-1.5 line-clamp-2 min-h-[2.25rem] transition-colors ${
          isOutOfStock ? 'text-slate-500' : 'text-[#001226] group-hover:text-blue-700'
        }`}
      >
        {product.title}
      </Link>

      {/* Visual What's Inside This Combo showcase pills */}
      {isCombo && comboSubjects.length > 0 && (
        <div className="mb-2 p-1.5 sm:p-2 rounded-xl bg-gradient-to-r from-blue-50/90 via-indigo-50/80 to-purple-50/60 border border-blue-200/70 shadow-2xs">
          <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-wider text-blue-950 mb-1">
            <span className="flex items-center gap-1">
              <span>🎁 Inside ({comboSubjects.length} Books Set):</span>
            </span>
            <span className="text-[8px] font-extrabold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.2 rounded shadow-2xs">
              ALL INCLUDED
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {comboSubjects.map((sub) => (
              <span
                key={sub.name}
                className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-white border border-blue-200/80 text-slate-800 shadow-2xs whitespace-nowrap transition-transform hover:scale-105"
                title={`${sub.name}: ${sub.description}`}
              >
                <span className="text-[10px] leading-none">{sub.icon}</span>
                <span>{sub.shortName}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1 bg-amber-50 border border-amber-200/60 px-1.5 py-0.5 rounded-full">
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-amber-400 text-amber-400" />
          <span className="text-[9px] sm:text-[10px] font-black text-slate-900">
            {(product.reviews ?? 0) > 0 ? (product.rating || 0).toFixed(1) : 'New'}
          </span>
        </div>
        <span className="text-[9px] font-extrabold text-emerald-700 flex items-center gap-0.5">
          <Truck className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-600" />
          <span className="inline">ST Courier</span>
        </span>
      </div>

      <div className="flex items-baseline gap-1 mt-auto mb-1.5 flex-wrap">
        <span className={`font-black text-sm sm:text-base ${isOutOfStock ? 'text-slate-500' : 'text-[#001226]'}`}>₹{product.price}</span>
        {product.mrp > product.price && (
          <span className="text-[10px] sm:text-[11px] text-slate-400 line-through font-bold">₹{product.mrp}</span>
        )}
        {product.mrp > product.price && product.discount > 0 && (
          <span className="text-[9px] sm:text-[10px] font-black text-emerald-600">{product.discount}% OFF</span>
        )}
      </div>

      {isOutOfStock && (
        <p className="mb-1.5 text-[9px] sm:text-xs font-bold text-slate-500 line-clamp-1">
          Unavailable — stock updates live.
        </p>
      )}

      {product.samplePdfUrl && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openSamplePdfModal({
              title: product.title,
              pdfUrl: product.samplePdfUrl!,
              price: product.price,
              mrp: product.mrp,
              bookId: String(product.id),
              coverImage: product.image,
              cls: product.cls,
            });
          }}
          className="w-full mb-1.5 py-1.5 px-1.5 sm:px-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200/80 rounded-xl text-[10px] sm:text-[11px] font-extrabold flex items-center justify-center gap-1 sm:gap-1.5 transition-all cursor-pointer shadow-2xs hover:shadow-xs touch-manipulation min-h-8"
          title="Preview sample pages before buying"
        >
          <FileText className="w-3.5 h-3.5 text-purple-600 shrink-0" />
          <span className="hidden min-[420px]:inline">Preview Sample PDF</span>
          <span className="min-[420px]:hidden">Sample PDF</span>
        </button>
      )}

      {/* Medium / Language selector or badge */}
      {isMultiMedium ? (
        <div className="mb-2 p-0.5 bg-slate-100/90 rounded-xl flex items-center border border-slate-200">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedMedium('Tamil Medium');
            }}
            className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-black transition-all text-center cursor-pointer ${
              selectedMedium === 'Tamil Medium'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            தமிழ் வழி
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedMedium('English Medium');
            }}
            className={`flex-1 py-1 px-1 rounded-lg text-[10px] font-black transition-all text-center cursor-pointer ${
              selectedMedium === 'English Medium'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            English
          </button>
        </div>
      ) : (
        <div className="mb-2 flex items-center">
          <span
            className={`text-[9.5px] font-black px-2 py-0.5 rounded-md ${
              rawLang.toLowerCase().includes('tamil')
                ? 'bg-amber-50 text-amber-900 border border-amber-200'
                : rawLang.toLowerCase().includes('english')
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
            }`}
          >
            {rawLang.toLowerCase().includes('tamil')
              ? '📘 தமிழ் வழி (Tamil)'
              : rawLang.toLowerCase().includes('english')
              ? '📗 English Medium'
              : '📙 Bilingual Edition'}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5 sm:gap-2 mt-auto">
        <button
          type="button"
          disabled={isOutOfStock}
          onClick={handleAddToCart}
          className={`font-extrabold text-[11px] sm:text-xs py-2.5 rounded-xl flex items-center justify-center gap-1 uppercase touch-manipulation disabled:cursor-not-allowed min-h-11 transition-all duration-300 cursor-pointer ${
            isAdded
              ? 'bg-emerald-600 text-white animate-success-pop shadow-md shadow-emerald-600/30'
              : 'bg-[#0044AA] hover:bg-[#003388] active:bg-[#001B3A] disabled:bg-slate-300 disabled:text-slate-500 text-white'
          }`}
        >
          {isAdded ? (
            <>
              <Check className="w-4 h-4 text-white animate-bounce" />
              <span>ADDED</span>
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
          disabled={isOutOfStock}
          onClick={() => {
            if (isOutOfStock) return;
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
              showToast(`Added to cart. Minimum ${MIN_BOOKS_PER_ORDER} books required — add ${need} more to checkout.`);
              setIsCartOpen(true);
              return;
            }
            setIsCheckoutOpen(true);
            router.push('/checkout');
          }}
          className="bg-amber-400 hover:bg-amber-500 active:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-500 text-[#001B3A] font-extrabold text-[11px] sm:text-xs py-2.5 rounded-xl uppercase touch-manipulation disabled:cursor-not-allowed min-h-11 shadow-sm hover:shadow-md transition-all flex items-center justify-center cursor-pointer"
        >
          {isOutOfStock ? 'N/A' : 'BUY'}
        </button>
      </div>
    </article>
  );
};
