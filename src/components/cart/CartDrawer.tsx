'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, X, Truck, Plus, Minus, ArrowRight, Tag } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';

export const CartDrawer = () => {
  const {
    cart,
    isCartOpen,
    setIsCartOpen,
    updateQty,
    cartTotal,
    cartGrandTotal,
    couponDiscount,
    appliedCoupon,
    applyCouponCode,
    clearAppliedCoupon,
    pendingCouponCode,
    setPendingCouponCode,
    setIsCheckoutOpen,
    user,
    setIsAuthOpen,
    showToast,
  } = useStore();

  const [couponInput, setCouponInput] = React.useState('');
  const [couponBusy, setCouponBusy] = React.useState(false);

  React.useEffect(() => {
    if (pendingCouponCode) setCouponInput(pendingCouponCode);
  }, [pendingCouponCode]);

  const freeDeliveryThreshold = 499;
  const amountForFreeDelivery = Math.max(0, freeDeliveryThreshold - cartTotal);
  const deliveryProgress = Math.min(100, (cartTotal / freeDeliveryThreshold) * 100);

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
                cart.map((item) => (
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
                          className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center hover:bg-slate-200"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
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

                <div className="bg-white border border-slate-200 rounded-xl p-3 space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-600 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5" /> Coupon Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="e.g. POWER20"
                      className="flex-1 px-3 py-2 border rounded-lg text-xs font-bold uppercase"
                    />
                    <button
                      type="button"
                      disabled={couponBusy}
                      onClick={async () => {
                        setCouponBusy(true);
                        await applyCouponCode(couponInput);
                        setCouponBusy(false);
                      }}
                      className="px-3 py-2 bg-[#001B3A] text-white text-xs font-bold rounded-lg disabled:opacity-60"
                    >
                      Apply
                    </button>
                  </div>
                  {appliedCoupon && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-emerald-700 font-bold">
                        {appliedCoupon.code} — {appliedCoupon.label}
                        {appliedCoupon.freeBookTitle && ` (${appliedCoupon.freeBookTitle})`}
                      </span>
                      <button
                        type="button"
                        onClick={clearAppliedCoupon}
                        className="text-red-600 font-bold"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-bold pt-1 border-t border-slate-100">
                    <span>Subtotal</span>
                    <span>₹{cartTotal}</span>
                  </div>
                  {couponDiscount > 0 && appliedCoupon?.offerType === 'discount' && (
                    <div className="flex justify-between text-xs font-bold text-emerald-700">
                      <span>Discount</span>
                      <span>-₹{couponDiscount}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-black text-[#001B3A]">
                    <span>Total</span>
                    <span>₹{cartGrandTotal}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsCartOpen(false);
                    if (!user) {
                      setIsAuthOpen(true);
                      showToast('Please login or register to place an order');
                      return;
                    }
                    setIsCheckoutOpen(true);
                  }}
                  className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl shadow-md hover:shadow-lg transition-all uppercase tracking-wider text-center min-h-12"
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
