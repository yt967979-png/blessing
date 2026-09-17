'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Plus, Check, ShoppingBag, Sparkles, CheckCircle2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { booksUntilMinOrder } from '@/lib/deliveryRules';

interface FrequentlyBoughtTogetherProps {
  currentProduct: any;
}

function extractClassStandard(title: string, categoryId?: string): string {
  const match = (title || '').match(/(6th|7th|8th|9th|10th|11th|12th)/i);
  if (match) return match[0].toLowerCase();
  if (categoryId) return String(categoryId).replace(/^cat-/, '').toLowerCase();
  return '';
}

export const FrequentlyBoughtTogether: React.FC<FrequentlyBoughtTogetherProps> = ({ currentProduct }) => {
  const { products, addToCart, cart, cartCount, showToast } = useStore();
  const [isAdding, setIsAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  // 1. Identify current book's academic standard (e.g. "10th", "11th", "12th")
  const currentStandard = useMemo(() => {
    return extractClassStandard(currentProduct?.title || '', currentProduct?.category_id || currentProduct?.category);
  }, [currentProduct]);

  // 2. Discover in-stock complementary books of the EXACT SAME standard
  const bundleCandidates = useMemo(() => {
    if (!currentProduct || !products || products.length === 0) return [];

    const currentId = currentProduct.id;
    const currentTitle = (currentProduct.title || '').toLowerCase();

    // Filter books from the same academic standard
    const sameStandardBooks = products.filter((p: any) => {
      if (p.id === currentId) return false;
      if (p.inStock === false) return false;

      const pStandard = extractClassStandard(p.title || '', p.category_id || p.category);
      if (currentStandard && pStandard && currentStandard === pStandard) {
        return true;
      }
      return false;
    });

    // Avoid duplicate subjects if possible
    const selected: any[] = [];
    const seenSubjects = new Set<string>();

    for (const book of sameStandardBooks) {
      const subj = (book.subject || book.title || '').toLowerCase();
      // Try to pick distinct subjects (Maths, Science, Social, English, Tamil)
      let subjectKey = 'other';
      if (subj.includes('math')) subjectKey = 'maths';
      else if (subj.includes('sci')) subjectKey = 'science';
      else if (subj.includes('soci') || subj.includes('hist')) subjectKey = 'social';
      else if (subj.includes('eng')) subjectKey = 'english';
      else if (subj.includes('tamil')) subjectKey = 'tamil';
      else if (subj.includes('phys')) subjectKey = 'physics';
      else if (subj.includes('chem')) subjectKey = 'chemistry';
      else if (subj.includes('bio')) subjectKey = 'biology';

      if (!seenSubjects.has(subjectKey)) {
        seenSubjects.add(subjectKey);
        selected.push(book);
      }
      if (selected.length >= 2) break; // Offer a 3-book bundle (Current + 2)
    }

    // If subject matching was too strict, fallback to any 2 books from the same standard
    if (selected.length < 2) {
      for (const book of sameStandardBooks) {
        if (!selected.some((s) => s.id === book.id)) {
          selected.push(book);
        }
        if (selected.length >= 2) break;
      }
    }

    return selected;
  }, [currentProduct, products, currentStandard]);

  // All bundle items (Current product + candidates)
  const allBundleItems = useMemo(() => {
    if (bundleCandidates.length === 0) return [];
    return [currentProduct, ...bundleCandidates];
  }, [currentProduct, bundleCandidates]);

  // Selected item IDs state (default all selected)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Sync selectedIds whenever bundle candidates change
  React.useEffect(() => {
    if (allBundleItems.length > 0) {
      setSelectedIds(allBundleItems.map((b) => b.id));
    }
  }, [allBundleItems]);

  if (bundleCandidates.length === 0) {
    return null; // Don't render if no same-standard books exist
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // Keep at least 1 item
        return prev.filter((i) => i !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const selectedItems = allBundleItems.filter((b) => selectedIds.includes(b.id));
  const totalPrice = selectedItems.reduce((acc, b) => acc + (Number(b.price || b.discount_price) || 0), 0);
  const totalMrp = selectedItems.reduce((acc, b) => acc + (Number(b.mrp || b.price + 50) || 0), 0);
  const totalSavings = Math.max(0, totalMrp - totalPrice);

  const handleAddBundleToCart = () => {
    setIsAdding(true);
    let addedCount = 0;

    for (const item of selectedItems) {
      addToCart(item);
      addedCount++;
    }

    setJustAdded(true);
    setIsAdding(false);

    const newCartTotalCount = cartCount + addedCount;
    const remaining = booksUntilMinOrder(newCartTotalCount);

    if (remaining > 0) {
      showToast(`Added ${addedCount} guide(s) to cart! Add ${remaining} more for checkout.`);
    } else {
      showToast(`🎉 Bundle added! You meet the Minimum Order Quantity for checkout!`);
    }

    setTimeout(() => setJustAdded(false), 3000);
  };

  const displayStandard = currentStandard ? currentStandard.toUpperCase() : 'CLASS';

  return (
    <section className="bg-gradient-to-br from-blue-50/50 via-white to-amber-50/30 border border-blue-100/80 rounded-2xl p-4 sm:p-6 shadow-xs my-8 transition-all">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-[#0044AA] text-white rounded-lg shadow-xs">
            <Sparkles className="w-4 h-4 text-amber-300" />
          </span>
          <div>
            <h3 className="font-heading font-black text-base sm:text-lg text-[#001B3A] tracking-tight">
              FREQUENTLY BOUGHT TOGETHER
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
              Complete your {displayStandard} study set with official state board preparation guides
            </p>
          </div>
        </div>

        <span className="inline-flex items-center text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 px-2.5 py-1 rounded-md border border-amber-200">
          Same Standard Set
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Visual Thumbnails with Plus signs */}
        <div className="lg:col-span-8 flex flex-wrap items-center gap-2 sm:gap-3">
          {allBundleItems.map((item, idx) => {
            const isSelected = selectedIds.includes(item.id);
            const isCurrent = item.id === currentProduct.id;
            const itemImg = item.image || item.cover_image || '/logo.png';
            const price = Number(item.price || item.discount_price || 0);

            return (
              <React.Fragment key={item.id}>
                {idx > 0 && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-[#0044AA] font-bold text-sm">
                    <Plus className="w-3.5 h-3.5" />
                  </div>
                )}

                <div
                  onClick={() => toggleSelect(item.id)}
                  className={`flex flex-col items-center p-2 rounded-xl border transition-all cursor-pointer select-none max-w-[130px] sm:max-w-[150px] ${
                    isSelected
                      ? 'bg-white border-[#0044AA] shadow-sm ring-2 ring-blue-500/10'
                      : 'bg-slate-50/80 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="relative w-20 h-24 sm:w-24 sm:h-28 rounded-lg overflow-hidden bg-slate-100 mb-2">
                    <Image
                      src={itemImg}
                      alt={item.title}
                      fill
                      className="object-cover"
                      unoptimized={imageNeedsUnoptimized(itemImg)}
                    />
                    {isCurrent && (
                      <span className="absolute top-1 left-1 bg-slate-900/80 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
                        This Item
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] font-bold text-slate-800 text-center line-clamp-2 leading-tight mb-1">
                    {item.title}
                  </p>

                  <div className="flex items-center gap-1 mt-auto">
                    <span className="text-xs font-black text-[#001B3A]">₹{price}</span>
                    {item.mrp && item.mrp > price && (
                      <span className="text-[10px] text-slate-400 line-through">₹{item.mrp}</span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
                    <div
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center border transition-colors ${
                        isSelected ? 'bg-[#0044AA] border-[#0044AA] text-white' : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>
                    <span>{isSelected ? 'Included' : 'Add'}</span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Bundle Summary & 1-Click CTA */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Bundle Total ({selectedItems.length} items)
            </span>

            <div className="flex items-baseline gap-2 mb-1">
              <span className="font-heading font-black text-2xl sm:text-3xl text-[#001B3A]">
                ₹{totalPrice}
              </span>
              {totalMrp > totalPrice && (
                <span className="text-sm font-semibold text-slate-400 line-through">
                  ₹{totalMrp}
                </span>
              )}
            </div>

            {totalSavings > 0 && (
              <p className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-1 rounded-md inline-block mb-3">
                You save ₹{totalSavings} on this set!
              </p>
            )}

            <p className="text-[11px] text-slate-500 leading-relaxed mb-4">
              Minimum order is 4 books. Adding this {selectedItems.length}-book combo gets you almost all the way to checkout!
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddBundleToCart}
            disabled={isAdding || selectedItems.length === 0}
            className={`w-full py-3.5 px-4 rounded-xl font-heading font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer ${
              justAdded
                ? 'bg-emerald-600 text-white'
                : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] active:scale-[0.98]'
            }`}
          >
            {justAdded ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>ADDED TO CART! ✓</span>
              </>
            ) : (
              <>
                <ShoppingBag className="w-4 h-4" />
                <span>ADD ALL {selectedItems.length} TO CART • ₹{totalPrice}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};

export default FrequentlyBoughtTogether;
