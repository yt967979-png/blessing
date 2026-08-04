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
                    <span>My Orders & Live Tracking</span>
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
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-[2.5rem] max-w-lg w-full p-6 sm:p-9 text-center space-y-5 shadow-[0_25px_60px_-15px_rgba(0,27,58,0.5)] relative border border-slate-200/80 overflow-hidden"
            >
              <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-80 h-80 bg-gradient-to-tr from-amber-400/40 via-blue-600/30 to-emerald-400/40 rounded-full blur-3xl opacity-60 pointer-events-none animate-pulse" />

              <div className="relative inline-block mt-2">
                <div className="w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-xl ring-8 ring-emerald-100">
                  <CheckCircle2 className="w-11 h-11 stroke-[2.2]" />
                </div>
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 text-[11px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-emerald-200">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Order confirmed</span>
                </div>
                <h2 className="font-heading font-black text-2xl sm:text-3xl text-[#001B3A] tracking-tight">
                  Thank you! Your payment is complete
                </h2>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Order is confirmed and active. Next we pack your guides, then ship via ST Courier Express.
                </p>
              </div>

              <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200/90 rounded-3xl p-5 text-left space-y-3 shadow-inner">
                <div className="flex justify-between items-center pb-3 border-b border-slate-200/70">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Order number</span>
                    <span className="font-mono font-black text-[#001B3A] text-base">#{orderSuccessData.orderId}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(orderSuccessData.orderId);
                      showToast('Order ID copied');
                    }}
                    className="text-[10px] font-bold text-blue-600 bg-blue-100/80 hover:bg-blue-200/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    COPY
                  </button>
                </div>

                <div className="flex justify-between items-center pb-3 border-b border-slate-200/70">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Amount paid</span>
                    <span className="font-black text-emerald-600 text-lg">₹{orderSuccessData.totalAmount}</span>
                  </div>
                  <span className="text-[11px] font-extrabold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">
                    {orderSuccessData.paymentStatus || 'Payment Confirmed'}
                  </span>
                </div>

                {Array.isArray(orderSuccessData.items) && orderSuccessData.items.length > 0 && (
                  <div className="pb-3 border-b border-slate-200/70 space-y-1.5">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Items</span>
                    {orderSuccessData.items.slice(0, 6).map((item: { title?: string; qty?: number; price?: number }, idx: number) => (
                      <div key={idx} className="flex justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-800 truncate">
                          {item.title || 'Guide'} × {item.qty || 1}
                        </span>
                        {item.price != null && (
                          <span className="font-bold text-slate-600 shrink-0">₹{Number(item.price) * Number(item.qty || 1)}</span>
                        )}
                      </div>
                    ))}
                    {orderSuccessData.items.length > 6 && (
                      <p className="text-[10px] text-slate-400 font-semibold">+{orderSuccessData.items.length - 6} more</p>
                    )}
                  </div>
                )}

                <div className="flex items-start gap-2.5 pt-1">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 border border-amber-400/30">
                    <Truck className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">What happens next</span>
                    <p className="font-semibold text-[#001B3A] text-xs leading-relaxed">
                      1) Packing → 2) ST Courier dispatch → 3) Delivery by{' '}
                      {getSTCourierDeliveryEstimate(orderSuccessData.city).formattedDate} (before 11 PM)
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#001B3A] text-white rounded-2xl p-4 flex items-center justify-between text-xs shadow-lg">
                <div className="flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/40">
                    <Send className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-200 block">Updates on WhatsApp</span>
                    <span className="text-[11px] text-emerald-400 font-mono">+91 {orderSuccessData.phone}</span>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold bg-emerald-500 text-slate-950 px-2.5 py-1 rounded-lg">
                  {orderSuccessData.status || 'Confirmed'}
                </span>
              </div>

              <div className="space-y-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const oid = orderSuccessData.orderId;
                    setOrderSuccessData(null);
                    router.push(`/orders?orderId=${encodeURIComponent(oid)}`);
                  }}
                  className="w-full bg-gradient-to-r from-[#001B3A] via-[#002B5B] to-[#0044AA] hover:from-blue-700 hover:to-blue-600 text-white font-black text-xs py-4 rounded-2xl shadow-xl uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all transform hover:-translate-y-0.5 cursor-pointer"
                >
                  <PackageCheck className="w-4 h-4 text-amber-400" />
                  <span>View my order</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const oid = orderSuccessData.orderId;
                    setOrderSuccessData(null);
                    router.push(`/track?orderId=${encodeURIComponent(oid)}`);
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3.5 rounded-2xl transition-colors cursor-pointer flex items-center justify-center gap-2"
                >
                  <Truck className="w-4 h-4" />
                  Track shipment
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
