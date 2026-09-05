'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, X, Truck, Plus, Minus, ArrowRight, AlertTriangle } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';
import { getCartItemStockState, anyCartItemBlocking } from '@/lib/cartStock';
import { imageNeedsUnoptimized } from '@/lib/productImage';

export const CartDrawer = () => {
  const {
    cart,
    products,
    isCartOpen,
    setIsCartOpen,
    updateQty,
    cartTotal,
    cartGrandTotal,
    setIsCheckoutOpen,
    user,
    setIsAuthOpen,
    showToast,
    validateCartStock,
  } = useStore();

  const totalBooks = cart.reduce((a, b) => a + Number(b.qty || 0), 0);
  const minOrderQty = 4;
  const freeShippingQty = 5;
  const isMoqSatisfied = totalBooks >= minOrderQty;
  const booksToMoq = Math.max(0, minOrderQty - totalBooks);
  const booksToFreeShipping = Math.max(0, freeShippingQty - totalBooks);
  const deliveryProgress = Math.min(100, (totalBooks / freeShippingQty) * 100);
  const hasBlockingItem = anyCartItemBlocking(cart, products);

  // Instant re-check the moment the drawer opens
  useEffect(() => {
    if (isCartOpen) void validateCartStock();
  }, [isCartOpen, validateCartStock]);

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsCartOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-[60]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 240 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white z-[70] shadow-2xl flex flex-col"
          >
            <div className="bg-[#001B3A] text-white p-4 flex justify-between items-center shadow-md">
              <h3 className="font-heading font-extrabold text-base flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-400" />
                <span>Shopping Cart ({totalBooks} {totalBooks === 1 ? 'book' : 'books'})</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="text-slate-300 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors min-h-11 min-w-11 flex items-center justify-center cursor-pointer"
                aria-label="Close cart"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Smart MOQ (4 Books) & Free Shipping (5+ Books) Tier Bar */}
            <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-amber-50 p-3.5 border-b border-blue-100 text-xs">
              <div className="flex items-center justify-between font-bold mb-1.5">
                <div className="flex items-center gap-2">
                  <Truck className="w-4 h-4 text-[#0284c7] flex-shrink-0" />
                  {!isMoqSatisfied ? (
                    <span className="text-amber-800 font-extrabold">
                      Add {booksToMoq} more {booksToMoq === 1 ? 'book' : 'books'} for Minimum Order (4 books)
                    </span>
                  ) : booksToFreeShipping > 0 ? (
                    <span className="text-blue-900 font-bold">
                      Add {booksToFreeShipping} more for <strong className="text-emerald-700">FREE Express Delivery!</strong>
                    </span>
                  ) : (
                    <span className="text-emerald-700 font-extrabold flex items-center gap-1">
                      🎉 FREE Express Delivery Unlocked!
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-black text-slate-600 bg-white/80 px-2 py-0.5 rounded-full border border-slate-200">
                  {totalBooks}/5 Books
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200/80 rounded-full overflow-hidden p-0.5 shadow-inner">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${deliveryProgress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className={`h-full rounded-full transition-all ${
                    totalBooks >= 5
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400 shadow-sm'
                      : totalBooks >= 4
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500'
                      : 'bg-gradient-to-r from-amber-400 to-orange-400'
                  }`}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {cart.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <ShoppingBag className="w-16 h-16 mx-auto mb-3 opacity-20 text-blue-600" />
                  <h4 className="font-heading font-black text-base text-slate-700">Your cart is empty</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Explore 6th-12th guide books and add items to your cart.
                  </p>
                </div>
              ) : (
                cart.map((item) => {
                  const stockState = getCartItemStockState(item, products);
                  return (
                    <div key={item.id} className="flex gap-3 pb-3 border-b border-slate-100 items-center">
                      <div className="relative w-14 h-14 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex-shrink-0">
                        <Image
                          src={item.image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'}
                          alt={item.title}
                          fill
                          className="object-contain p-1"
                          sizes="56px"
                          unoptimized={imageNeedsUnoptimized(item.image || '')}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-heading font-bold text-xs text-[#001B3A] truncate">{item.title}</h4>
                        <div className="font-extrabold text-sm text-slate-900 mt-0.5">
                          ₹{item.price * item.qty}
                          <span className="text-[10px] text-slate-400 font-normal ml-1">(₹{item.price} each)</span>
                        </div>
                        {!stockState.inStock ? (
                          <p className="text-[10px] font-bold text-red-600 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Out of stock — remove to continue
                          </p>
                        ) : stockState.overLimit ? (
                          <p className="text-[10px] font-bold text-amber-600 mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Only {stockState.stock} available — reduce qty
                          </p>
                        ) : null}
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, -1)}
                            className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-transform"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-bold text-slate-800 w-4 text-center">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, 1)}
                            disabled={!stockState.inStock || stockState.atLimit}
                            className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <div
                className="bg-slate-50 border-t border-slate-200 p-4 space-y-3 shadow-inner"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-2.5 flex items-center gap-2 text-xs text-emerald-800 font-extrabold">
                  <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    ST Courier Express: Arriving by{' '}
                    {getSTCourierDeliveryEstimate('Tamil Nadu').formattedDate} before 11 PM
                  </span>
                </div>

                <div className="flex justify-between text-xs font-bold pt-1 text-slate-600">
                  <span>Subtotal ({totalBooks} books)</span>
                  <span>₹{cartTotal}</span>
                </div>
                <div className="flex justify-between text-xs font-bold text-slate-600">
                  <span>Shipping Fee</span>
                  <span>{totalBooks >= 5 ? <strong className="text-emerald-600">FREE</strong> : totalBooks >= 4 ? '₹150' : 'Calculated at checkout'}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-[#001B3A] border-t border-slate-200/70 pt-2">
                  <span>Estimated Total</span>
                  <span className="text-base text-blue-900">₹{cartGrandTotal}</span>
                </div>

                {hasBlockingItem ? (
                  <p className="text-[10px] font-bold text-red-600 text-center flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Fix out-of-stock items before checkout
                  </p>
                ) : !isMoqSatisfied ? (
                  <p className="text-[11px] font-extrabold text-amber-700 text-center bg-amber-50 border border-amber-200 p-2 rounded-lg">
                    ⚠️ Minimum order requirement: 4 books (Add {booksToMoq} more)
                  </p>
                ) : null}

                <motion.button
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  disabled={hasBlockingItem || !isMoqSatisfied}
                  onClick={() => {
                    setIsCartOpen(false);
                    if (!user) {
                      setIsAuthOpen(true);
                      showToast('Please sign in with Google to place an order');
                      return;
                    }
                    setIsCheckoutOpen(true);
                  }}
                  className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all uppercase tracking-wider text-center min-h-12 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {!isMoqSatisfied
                    ? `ADD ${booksToMoq} MORE BOOK${booksToMoq > 1 ? 'S' : ''} TO CHECKOUT`
                    : user
                    ? 'PROCEED TO CHECKOUT'
                    : 'LOGIN TO CHECKOUT'}
                </motion.button>

                <div className="text-center pt-1">
                  <Link
                    href="/cart"
                    onClick={() => setIsCartOpen(false)}
                    className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1 min-h-11"
                  >
                    <span>View Full Cart Page</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
