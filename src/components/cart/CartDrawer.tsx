'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, X, Truck, Plus, Minus, ArrowRight, AlertTriangle } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';
import { getCartItemStockState, anyCartItemBlocking } from '@/lib/cartStock';

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

  const freeDeliveryThreshold = 499;
  const amountForFreeDelivery = Math.max(0, freeDeliveryThreshold - cartTotal);
  const deliveryProgress = Math.min(100, (cartTotal / freeDeliveryThreshold) * 100);
  const hasBlockingItem = anyCartItemBlocking(cart, products);

  // Instant re-check the moment the drawer opens — the 8s background poll
  // otherwise still covers it, but this makes it feel immediate.
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
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-[60]"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-white z-[70] shadow-2xl flex flex-col"
          >
            <div className="bg-[#001B3A] text-white p-4 flex justify-between items-center">
              <h3 className="font-heading font-extrabold text-base flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-400" />
                <span>Shopping Cart ({cart.reduce((a, b) => a + b.qty, 0)})</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCartOpen(false)}
                className="text-slate-300 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors min-h-11 min-w-11 flex items-center justify-center"
                aria-label="Close cart"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 border-b border-blue-100 text-xs">
              <div className="flex items-center gap-2 text-blue-900 font-bold mb-1.5">
                <Truck className="w-4 h-4 text-blue-600 flex-shrink-0" />
                {amountForFreeDelivery === 0 ? (
                  <span className="text-emerald-700">Congratulations! You unlocked FREE Express Delivery!</span>
                ) : (
                  <span>Add ₹{amountForFreeDelivery} more for FREE Express Delivery!</span>
                )}
              </div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-emerald-500 transition-all duration-300"
                  style={{ width: `${deliveryProgress}%` }}
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
                          unoptimized={
                            !item.image ||
                            (!item.image.includes('cloudinary.com') && !item.image.includes('unsplash.com'))
                          }
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
                            className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-200"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-xs font-bold text-slate-800 w-4 text-center">{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, 1)}
                            disabled={!stockState.inStock || stockState.atLimit}
                            className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="bg-slate-50 border-t border-slate-200 p-4 space-y-3"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
              >
                <div className="bg-emerald-50 border border-emerald-200/80 rounded-xl p-2.5 flex items-center gap-2 text-xs text-emerald-800 font-extrabold">
                  <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    ST Courier Express: Arriving by{' '}
                    {getSTCourierDeliveryEstimate('Tamil Nadu').formattedDate} before 11 PM
                  </span>
                </div>

                  <div className="flex justify-between text-xs font-bold pt-1">
                    <span>Subtotal</span>
                    <span>₹{cartTotal}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-[#001B3A]">
                    <span>Total</span>
                    <span>₹{cartGrandTotal}</span>
                  </div>

                {hasBlockingItem && (
                  <p className="text-[10px] font-bold text-red-600 text-center flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Fix out-of-stock items before checkout
                  </p>
                )}
                <button
                  type="button"
                  disabled={hasBlockingItem}
                  onClick={() => {
                    setIsCartOpen(false);
                    if (!user) {
                      setIsAuthOpen(true);
                      showToast('Please sign in with Google to place an order');
                      return;
                    }
                    setIsCheckoutOpen(true);
                  }}
                  className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all uppercase tracking-wider text-center min-h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {user ? 'PROCEED TO CHECKOUT' : 'LOGIN TO CHECKOUT'}
                </button>

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
