'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ShoppingBag,
  Truck,
  User,
  LogOut,
  CheckCircle2,
  PackageCheck,
  Send,
  MapPin,
  Tag,
  Sparkles,
  Package,
  Copy,
  Check,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';
import { GoogleAuthModal } from '@/components/auth/GoogleAuthModal';

export const ModalsBundle = () => {
  const router = useRouter();
  const {
    quickViewProduct,
    setQuickViewProduct,
    isCheckoutOpen,
    setIsCheckoutOpen,
    isTrackOpen,
    setIsTrackOpen,
    isAuthOpen,
    setIsAuthOpen,
    isProfileOpen,
    setIsProfileOpen,
    addToCart,
    user,
    logoutUser,
    orderSuccessData,
    setOrderSuccessData,
    showToast,
  } = useStore();

  const [trackId, setTrackId] = React.useState('');
  const [orderCopied, setOrderCopied] = React.useState(false);

  const handleCopyOrderId = (oid: string) => {
    try {
      navigator.clipboard.writeText(oid);
      setOrderCopied(true);
      showToast('✓ Order ID copied to clipboard');
      setTimeout(() => setOrderCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isAuthOpen) setIsAuthOpen(false);
      else if (isTrackOpen) setIsTrackOpen(false);
      else if (isProfileOpen) setIsProfileOpen(false);
      else if (quickViewProduct) setQuickViewProduct(null);
      else if (orderSuccessData) setOrderSuccessData(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isAuthOpen,
    isTrackOpen,
    isProfileOpen,
    quickViewProduct,
    orderSuccessData,
    setIsAuthOpen,
    setIsTrackOpen,
    setIsProfileOpen,
    setQuickViewProduct,
    setOrderSuccessData,
  ]);

  /** Flipkart-style: checkout is a full page (Razorpay-only), not a modal */
  useEffect(() => {
    if (!isCheckoutOpen) return;
      setIsCheckoutOpen(false);
    router.push('/checkout');
  }, [isCheckoutOpen, router, setIsCheckoutOpen]);

  return (
    <>
      <AnimatePresence>
        {quickViewProduct && (
          <div
            onClick={() => setQuickViewProduct(null)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-w-lg w-full relative shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            >
              <div className="sm:hidden w-10 h-1 rounded-full bg-slate-200 mx-auto mb-3" />
              <button
                type="button"
                onClick={() => setQuickViewProduct(null)}
                className="absolute top-3 right-3 w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 touch-target"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-center border border-slate-200">
                  <img
                    src={quickViewProduct.image}
                    alt={quickViewProduct.title}
                    className="max-h-48 object-contain"
                  />
                </div>
                <div>
                  {quickViewProduct.badge ? (
                      <span
                        className={`text-[10px] font-extrabold text-white px-2 py-0.5 rounded ${quickViewProduct.badgeColor || 'bg-blue-600'} inline-block mb-2`}
                      >
                        {quickViewProduct.badge}
                      </span>
                    ) : null}
                  <h3 className="font-heading font-extrabold text-base text-[#001B3A] mb-1">
                    {quickViewProduct.title}
                  </h3>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                    {quickViewProduct.description}
                  </p>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="text-xl font-black text-[#001B3A]">
                      ₹{quickViewProduct.price}
                    </span>
                    {quickViewProduct.mrp > quickViewProduct.price && (
                      <>
                    <span className="text-xs text-slate-400 line-through">
                      ₹{quickViewProduct.mrp}
                    </span>
                        {quickViewProduct.discount > 0 && (
                    <span className="text-xs font-bold text-emerald-600">
                      {quickViewProduct.discount}% OFF
                    </span>
                        )}
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      addToCart(quickViewProduct);
                      setQuickViewProduct(null);
                    }}
                    className="w-full bg-[#0044AA] hover:bg-[#001B3A] text-white font-bold text-xs py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-md transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    <span>BUY NOW</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isTrackOpen && (
          <div
            onClick={() => setIsTrackOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-md w-full relative shadow-2xl"
            >
              <button
                onClick={() => setIsTrackOpen(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-1">
                <Truck className="w-5 h-5 text-amber-500" />
                <h3 className="font-heading font-extrabold text-lg text-[#001B3A]">
                  Live Order Tracking
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Enter Order ID — we&apos;ll open public tracking (no login needed).
              </p>

              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="e.g. BPG-1082"
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  className="flex-1 px-3 py-2.5 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-600 uppercase min-h-11"
                />
                <button
                  type="button"
                  onClick={() => {
                    const id = trackId.trim();
                    setIsTrackOpen(false);
                    if (id) router.push(`/track?orderId=${encodeURIComponent(id)}`);
                    else router.push('/track');
                  }}
                  className="bg-[#001B3A] text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors min-h-11"
                >
                  TRACK
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsTrackOpen(false);
                  router.push('/track');
                }}
                className="text-[11px] font-bold text-blue-600 hover:underline"
              >
                Open full track page →
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAuthOpen && (
          <GoogleAuthModal
            onClose={() => setIsAuthOpen(false)}
            forceProfileStep={!!user?.needsProfile}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isProfileOpen && user && (
          <div
            onClick={() => setIsProfileOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl p-6 max-w-sm w-full relative shadow-2xl text-xs overflow-hidden"
            >
              <button
                onClick={() => setIsProfileOpen(false)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#001B3A] to-[#003B73] text-amber-400 font-extrabold text-xl flex items-center justify-center shadow-md">
                  {user.name[0]}
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Signed in as</span>
                  <h3 className="font-heading font-black text-base text-[#001B3A]">{user.name}</h3>
                  <span className="text-[11px] text-blue-600 font-semibold">{user.email}</span>
                </div>
              </div>

              <div className="space-y-1 mb-4">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    router.push('/profile');
                  }}
                  className="w-full text-left flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 transition-colors font-bold text-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <User className="w-4 h-4 text-blue-600" />
                    <span>Personal Info & Settings</span>
                  </div>
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    router.push('/orders');
                  }}
                  className="w-full text-left flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-amber-50/60 transition-colors font-bold text-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <Truck className="w-4 h-4 text-amber-500" />
                    <span>My Orders & Tracking</span>
                  </div>
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                </button>

                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    router.push('/profile');
                  }}
                  className="w-full text-left flex items-center justify-between p-3 rounded-xl bg-slate-50 hover:bg-emerald-50/60 transition-colors font-bold text-slate-800"
                >
                  <div className="flex items-center gap-2.5">
                    <MapPin className="w-4 h-4 text-emerald-600" />
                    <span>Manage Delivery Addresses</span>
                  </div>
                  <Tag className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    router.push('/profile');
                  }}
                  className="w-full bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-md uppercase tracking-wider transition-colors"
                >
                  OPEN FULL ACCOUNT DASHBOARD
                </button>

                <button
                  onClick={() => {
                    logoutUser();
                    setIsProfileOpen(false);
                  }}
                  className="w-full bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-2xs transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>LOGOUT FROM ACCOUNT</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {orderSuccessData && (
          <div 
            className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-5 md:p-6 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOrderSuccessData(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 26, stiffness: 320 }}
              className="bg-white rounded-3xl sm:rounded-[2.5rem] max-w-xl lg:max-w-4xl w-full p-4 sm:p-7 md:p-8 text-center lg:text-left shadow-2xl relative border border-slate-200/90 overflow-hidden my-auto max-h-[92dvh] flex flex-col"
            >
              {/* Prominent High-Contrast Close Button */}
              <button
                type="button"
                onClick={() => setOrderSuccessData(null)}
                aria-label="Close order confirmation"
                className="absolute top-3 right-3 sm:top-5 sm:right-5 z-40 w-11 h-11 rounded-full bg-slate-100/95 hover:bg-slate-200 active:bg-slate-300 text-slate-700 hover:text-slate-950 flex items-center justify-center transition-all cursor-pointer shadow-md border border-slate-300/80 touch-manipulation min-w-[44px] min-h-[44px]"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>

              <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 bg-gradient-to-tr from-amber-400/30 via-blue-600/25 to-emerald-400/30 rounded-full blur-3xl opacity-60 pointer-events-none" />

              <div className="overflow-y-auto overscroll-contain pr-0.5 sm:pr-1.5 space-y-4 sm:space-y-6 flex-1">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start relative z-10 pt-1 sm:pt-0">
                  {/* Left Column: Heading, Delivery & Desktop Buttons */}
                  <div className="lg:col-span-5 space-y-3.5 sm:space-y-4 text-center lg:text-left">
                    <div className="relative inline-block mt-0.5">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-18 lg:h-18 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto lg:mx-0 shadow-lg ring-6 sm:ring-8 ring-emerald-100 shrink-0">
                        <CheckCircle2 className="w-8 h-8 sm:w-9 sm:h-9 stroke-[2.2]" />
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:space-y-2">
                      <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-[10px] sm:text-[11px] font-black uppercase tracking-widest px-3 py-1 sm:px-4 sm:py-1.5 rounded-full border border-emerald-200">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Order Confirmed</span>
                      </div>
                      <h2 className="font-heading font-black text-xl sm:text-2xl lg:text-3xl text-[#001B3A] tracking-tight leading-snug pr-8 lg:pr-0">
                        Thank you! Your payment is complete
                      </h2>
                      <p className="text-xs text-slate-500 leading-relaxed font-medium max-w-sm mx-auto lg:mx-0">
                        Your order is confirmed and active. We are packing your guides for dispatch via ST Courier Express.
                      </p>
                    </div>

                    {/* ST Courier Estimate Card */}
                    <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-3 sm:p-3.5 flex items-start gap-3 text-left">
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center shrink-0 border border-amber-400/40">
                        <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-amber-800/80 uppercase tracking-wider block">Estimated Delivery</span>
                        <p className="font-bold text-[#001B3A] text-xs leading-relaxed">
                          ST Courier Dispatch — Est. {getSTCourierDeliveryEstimate(orderSuccessData.city).formattedDate}
                        </p>
                      </div>
                    </div>

                    {/* Action Buttons (Desktop placement) */}
                    <div className="hidden lg:block space-y-2 sm:space-y-2.5 pt-1 sm:pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          const oid = orderSuccessData.orderId;
                          setOrderSuccessData(null);
                          router.push(`/orders?orderId=${encodeURIComponent(oid)}`);
                        }}
                        className="w-full bg-gradient-to-r from-[#001B3A] via-[#002B5B] to-[#0044AA] hover:from-blue-700 hover:to-blue-600 active:scale-[0.99] text-white font-black text-xs sm:text-sm py-3.5 rounded-2xl shadow-xl uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer min-h-[46px] touch-manipulation"
                      >
                        <Package className="w-4 h-4 text-amber-400" />
                        <span>VIEW MY ORDER</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOrderSuccessData(null);
                          router.push('/search');
                        }}
                        className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-extrabold text-xs sm:text-sm py-3 rounded-2xl transition-colors cursor-pointer min-h-[44px] touch-manipulation"
                      >
                        Continue Shopping
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Detailed Order Summary Card */}
                  <div className="lg:col-span-7 bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200/90 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-left space-y-3.5 sm:space-y-4 shadow-inner">
                    <div className="flex justify-between items-center gap-2 pb-3 border-b border-slate-200/70">
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Order number</span>
                        <span className="font-mono font-black text-[#001B3A] text-sm sm:text-base lg:text-lg break-all">#{orderSuccessData.orderId}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopyOrderId(orderSuccessData.orderId)}
                        className="text-[11px] font-extrabold text-blue-700 bg-blue-100/90 hover:bg-blue-200 active:bg-blue-300 px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 min-h-[34px] touch-manipulation"
                      >
                        {orderCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{orderCopied ? 'COPIED!' : 'COPY'}</span>
                      </button>
                    </div>

                    <div className="flex justify-between items-center gap-2 pb-3 border-b border-slate-200/70">
                      <div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Amount paid</span>
                        <span className="font-black text-emerald-600 text-lg sm:text-xl">₹{orderSuccessData.totalAmount}</span>
                      </div>
                      <span className="text-[10px] sm:text-[11px] font-extrabold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200/80 shrink-0">
                        {orderSuccessData.paymentStatus || 'Payment Confirmed'}
                      </span>
                    </div>

                    {Array.isArray(orderSuccessData.items) && orderSuccessData.items.length > 0 && (
                      <div className="pb-3 border-b border-slate-200/70 space-y-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Purchased Guides</span>
                        <div className="max-h-36 sm:max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {orderSuccessData.items.map((item: { title?: string; qty?: number; price?: number; selectedMedium?: string }, idx: number) => (
                            <div key={idx} className="flex justify-between items-center gap-2 text-xs bg-white p-2 sm:p-2.5 rounded-xl border border-slate-200/60 shadow-xs">
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-slate-800 truncate text-[11px] sm:text-xs">
                                  {item.title || 'Guide'}
                                </p>
                                {item.selectedMedium && (
                                  <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 inline-block mt-0.5">
                                    {item.selectedMedium}
                                  </span>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[10px] font-bold text-slate-500 block">Qty: {item.qty || 1}</span>
                                {item.price != null && (
                                  <span className="font-black text-slate-800 text-[11px] sm:text-xs">
                                    ₹{Number(item.price) * Number(item.qty || 1)}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="bg-[#001B3A] text-white rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-3 text-xs shadow-md">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/40">
                          <Send className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-200 block text-[10px] sm:text-[11px] truncate">Delivery Updates Sent to</span>
                          <span className="text-[10px] sm:text-[11px] text-emerald-400 font-mono font-bold block truncate">
                            {(() => {
                              const clean = (orderSuccessData.phone || '').replace(/^\+91\s*/, '').replace(/^0/, '');
                              return clean ? `+91 ${clean}` : (orderSuccessData.customerName || 'Registered Mobile');
                            })()}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-extrabold bg-emerald-500 text-slate-950 px-2.5 py-1 rounded-lg shrink-0">
                        {orderSuccessData.status || 'Confirmed'}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Action Buttons: Shown below the order details card so mobile users see their full receipt first! */}
                  <div className="lg:hidden col-span-1 space-y-2 pt-1 pb-1">
                    <button
                      type="button"
                      onClick={() => {
                        const oid = orderSuccessData.orderId;
                        setOrderSuccessData(null);
                        router.push(`/orders?orderId=${encodeURIComponent(oid)}`);
                      }}
                      className="w-full bg-gradient-to-r from-[#001B3A] via-[#002B5B] to-[#0044AA] hover:from-blue-700 hover:to-blue-600 active:scale-[0.99] text-white font-black text-xs sm:text-sm py-3.5 rounded-2xl shadow-xl uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all cursor-pointer min-h-[48px] touch-manipulation"
                    >
                      <Package className="w-4 h-4 text-amber-400" />
                      <span>VIEW MY ORDER</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setOrderSuccessData(null);
                        router.push('/search');
                      }}
                      className="w-full bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 font-extrabold text-xs sm:text-sm py-3 rounded-2xl transition-colors cursor-pointer min-h-[44px] touch-manipulation"
                    >
                      Continue Shopping
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderSuccessData(null)}
                      className="w-full text-slate-400 hover:text-slate-600 active:text-slate-800 text-[11px] font-bold py-1.5 transition-colors cursor-pointer touch-manipulation"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
