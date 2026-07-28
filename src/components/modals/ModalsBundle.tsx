'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Lock,
  ShoppingBag,
  Truck,
  User,
  LogOut,
  CheckCircle2,
  PackageCheck,
  Send,
  MapPin,
  Plus,
  ShieldCheck,
  Tag,
  Phone,
  Sparkles,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';
import { createUserAddress, migrateLocalAddressesToDb } from '@/lib/addresses';
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
    cart,
    cartTotal,
    cartGrandTotal,
    checkoutTotal,
    appliedCoupon,
    applyCouponCode,
    clearAppliedCoupon,
    pendingCouponCode,
    products,
    publicCoupons,
    clearCart,
    addToCart,
    user,
    loginUser,
    logoutUser,
    orderSuccessData,
    setOrderSuccessData,
    showToast,
  } = useStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isCheckoutOpen) setIsCheckoutOpen(false);
      else if (isAuthOpen) setIsAuthOpen(false);
      else if (isTrackOpen) setIsTrackOpen(false);
      else if (isProfileOpen) setIsProfileOpen(false);
      else if (quickViewProduct) setQuickViewProduct(null);
      else if (orderSuccessData) setOrderSuccessData(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    isCheckoutOpen,
    isAuthOpen,
    isTrackOpen,
    isProfileOpen,
    quickViewProduct,
    orderSuccessData,
    setIsCheckoutOpen,
    setIsAuthOpen,
    setIsTrackOpen,
    setIsProfileOpen,
    setQuickViewProduct,
    setOrderSuccessData,
  ]);

  // Saved Addresses (from DB — login required for checkout)
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string | number | 'new'>('new');
  const [savingAddress, setSavingAddress] = useState(false);
  const [newAddr, setNewAddr] = useState({
    type: 'HOME',
    name: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
  });

  useEffect(() => {
    if (!isCheckoutOpen) return;
    if (!user?.id) {
      setIsCheckoutOpen(false);
      setIsAuthOpen(true);
      showToast('Please sign in with Google to place an order');
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await migrateLocalAddressesToDb(user);
      if (cancelled) return;
      setSavedAddresses(list);
      if (list.length > 0) setSelectedAddrId(list[0].id);
      else setSelectedAddrId('new');
      setNewAddr((prev) => ({
        ...prev,
        name: prev.name || user.name || '',
        phone: prev.phone || user.phone || '',
      }));
    })();
    return () => { cancelled = true; };
  }, [isCheckoutOpen, user]);

  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('cod');
  const [couponInput, setCouponInput] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [freeBookPickId, setFreeBookPickId] = useState('');

  useEffect(() => {
    if (pendingCouponCode) setCouponInput(pendingCouponCode);
  }, [pendingCouponCode]);

  // Track state
  const [trackId, setTrackId] = useState('');
  const [trackResult, setTrackResult] = useState<any>(null);

  const selectedAddress =
    selectedAddrId === 'new'
      ? newAddr
      : savedAddresses.find((a) => a.id === selectedAddrId) || savedAddresses[0];

  const couponMeta =
    appliedCoupon ||
    publicCoupons.find((c) => c.code === pendingCouponCode || c.code === couponInput.toUpperCase());

  const freeBookOptions = products.filter((p) => {
    if (!p.inStock) return false;
    const classes = couponMeta?.allowedClasses || [];
    const categories = couponMeta?.allowedCategories || [];
    if (classes.length && !classes.includes(String(p.cls).toLowerCase())) return false;
    if (categories.length && !categories.includes(p.category)) return false;
    return true;
  });

  const handleSaveInlineAddress = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!user?.id) {
      setIsAuthOpen(true);
      showToast('Please sign in with Google to save address & order');
      return false;
    }
    if (!newAddr.name || !newAddr.address || !newAddr.pincode) {
      alert('Please fill out Receiver Name, Address, and Pincode.');
      return false;
    }
    if (String(newAddr.pincode).length !== 6) {
      alert('Please enter a valid 6-digit pincode.');
      return false;
    }

    setSavingAddress(true);
    try {
      const created = await createUserAddress(user, {
        type: newAddr.type || 'HOME',
        name: newAddr.name,
        phone: newAddr.phone || user.phone || '',
        address: newAddr.address,
        city: newAddr.city || 'Chennai',
        pincode: newAddr.pincode,
        isDefault: savedAddresses.length === 0,
      });
      if (!created) {
        showToast('❌ Failed to save address. Please try again.');
        return false;
      }
      const next = [created, ...savedAddresses];
      setSavedAddresses(next);
      setSelectedAddrId(created.id);
      setNewAddr({ type: 'HOME', name: user.name || '', phone: user.phone || '', address: '', city: '', pincode: '' });
      showToast('✓ Address saved to your account');
      return true;
    } finally {
      setSavingAddress(false);
    }
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedAddrId === 'new') {
      const saved = await handleSaveInlineAddress();
      if (!saved) return;
    }

    const finalAmount = checkoutTotal > 0 ? checkoutTotal : cartGrandTotal > 0 ? cartGrandTotal : cartTotal;

    const processOrderCompletion = async (payId?: string, rzpOrderId?: string, rzpSignature?: string) => {
      let serverOrderId = '';
      try {
        const orderRes = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            userId: user?.id,
            customerName: selectedAddress.name || user?.name || 'Customer',
            customerPhone: selectedAddress.phone || user?.phone || '',
            address: selectedAddress.address,
            city: selectedAddress.city || 'Chennai',
            pincode: selectedAddress.pincode || '600012',
            items: cart.map((i) => ({ id: i.id, qty: i.qty, price: i.price })),
            paymentMethod: paymentMethod === 'razorpay' ? 'Razorpay UPI / Cards' : 'Cash on Delivery (COD)',
            razorpayPaymentId: payId || null,
            razorpayOrderId: rzpOrderId || null,
            razorpaySignature: rzpSignature || null,
            couponCode: appliedCoupon?.code || null,
            freeBookId: appliedCoupon?.freeBookId || null,
          }),
        });
        const orderData = await orderRes.json();
        if (!orderRes.ok) {
          showToast(`❌ ${orderData.error || 'Order failed'}`);
          return;
        }
        if (orderData.orderId) {
          serverOrderId = orderData.orderId;
        }
        if (orderData.duplicate) {
          showToast('ℹ️ Payment already recorded — order restored.');
        }
      } catch (_) {
        showToast('❌ Could not place order. Try again.');
        return;
      }

      if (!serverOrderId) {
        showToast('❌ Order was not saved. Please try again.');
        return;
      }

      const confirmedOrderId = serverOrderId;

      setIsCheckoutOpen(false);
      clearCart();
      clearAppliedCoupon();
      setOrderSuccessData({
        orderId: confirmedOrderId,
        totalAmount: finalAmount,
        customerName: selectedAddress.name || user?.name || 'Customer',
        address: selectedAddress.address,
        city: selectedAddress.city || 'Chennai',
        phone: selectedAddress.phone || user?.phone || '',
        paymentMethod: paymentMethod === 'razorpay' ? 'Razorpay UPI' : 'Cash on Delivery (COD)',
        paymentStatus: paymentMethod === 'razorpay' ? 'Payment Confirmed' : 'Pending COD',
      });
      showToast(`🎉 Order #${confirmedOrderId} placed successfully!`);
    };

    if (paymentMethod === 'razorpay') {
      const receiptId = `rcpt-${Date.now()}`;
      try {
        const cartPayload = cart.map((i) => ({ id: i.id, qty: i.qty }));
        const res = await fetch('/api/razorpay', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            items: cartPayload,
            receipt: receiptId,
            couponCode: appliedCoupon?.code || null,
            freeBookId: appliedCoupon?.freeBookId || null,
          }),
        });
        const rzpData = await res.json();

        if (!res.ok || !rzpData.id) {
          if (rzpData.needsConfig) {
            showToast('⚠️ Online payment is not available yet — please use Cash on Delivery.');
            window.location.href = '/payment/failed?reason=no_config';
            return;
          }
          showToast(`❌ ${rzpData.error || 'Could not create payment order.'}`);
          window.location.href = '/payment/failed?reason=create_failed';
          return;
        }

        if (typeof window !== 'undefined' && (window as any).Razorpay) {
          const options = {
            key: rzpData.key,
            amount: rzpData.amount,
            currency: 'INR',
            name: 'BLESSING POWER GUIDE',
            description: 'Educational Guide Books Order',
            order_id: rzpData.id,
            prefill: {
              name: selectedAddress.name || user?.name || '',
              email: user?.email || '',
              contact: selectedAddress.phone || user?.phone || '',
            },
            theme: { color: '#001B3A' },
            handler: async function (response: any) {
              const verifyRes = await fetch('/api/razorpay', {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
                },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  items: cartPayload,
                  expectedRupees: rzpData.expectedRupees,
                  couponCode: appliedCoupon?.code || null,
                  freeBookId: appliedCoupon?.freeBookId || null,
                }),
              });
              const verifyData = await verifyRes.json();

              if (!verifyData.verified) {
                showToast(`❌ ${verifyData.error || 'Payment verification failed.'}`);
                window.location.href = '/payment/failed?reason=verify_failed';
                return;
              }

              showToast('💳 Payment verified!');
              processOrderCompletion(
                response.razorpay_payment_id,
                response.razorpay_order_id,
                response.razorpay_signature
              );
            },
            modal: {
              ondismiss: function () {
                window.location.href = '/payment/failed?reason=dismissed';
              },
            },
          };

          const rzp = new (window as any).Razorpay(options);
          rzp.on('payment.failed', function () {
            window.location.href = '/payment/failed?reason=failed';
          });
          rzp.open();
          return;
        }
      } catch (err) {
        showToast('❌ Payment service error. Please try again.');
        return;
      }
    }

    // COD path
    await processOrderCompletion();
  };

  return (
    <>
      {/* Quick View Modal */}
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
                    <span className="text-xs text-slate-400 line-through">
                      ₹{quickViewProduct.mrp}
                    </span>
                    <span className="text-xs font-bold text-emerald-600">
                      {quickViewProduct.discount}% OFF
                    </span>
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

      {/* Checkout Modal */}
      <AnimatePresence>
        {isCheckoutOpen && (
          <div
            onClick={() => setIsCheckoutOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-w-lg w-full relative shadow-2xl max-h-[92vh] overflow-y-auto"
              style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="checkout-title"
            >
              <div className="sm:hidden w-10 h-1 rounded-full bg-slate-200 mx-auto mb-3" />
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="absolute top-3 right-3 w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-1">
                <Lock className="w-5 h-5 text-amber-500" />
                <h3 id="checkout-title" className="font-heading font-black text-lg sm:text-xl text-[#001B3A] leading-snug">
                  Select Delivery Address & Checkout
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Choose a saved address or add a new shipping address for express delivery.
              </p>

              <form onSubmit={handlePlaceOrder} className="space-y-4 text-xs">
                {/* Flipkart Address Selector List */}
                <div className="space-y-3">
                  <label className="block font-black text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>Select Delivery Address</span>
                  </label>

                  {savedAddresses.map((addr) => (
                    <div
                      key={addr.id}
                      onClick={() => setSelectedAddrId(addr.id)}
                      className={`p-3.5 border-2 rounded-xl cursor-pointer transition-all flex items-start gap-3 ${
                        selectedAddrId === addr.id
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="addr"
                        checked={selectedAddrId === addr.id}
                        onChange={() => setSelectedAddrId(addr.id)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="bg-slate-900 text-amber-400 font-black text-[9px] px-2 py-0.5 rounded uppercase">
                            {addr.type}
                          </span>
                          <span className="font-extrabold text-slate-900">{addr.name}</span>
                          <span className="text-slate-500 font-semibold">• {addr.phone}</span>
                        </div>
                        <p className="text-slate-600 leading-relaxed font-medium">
                          {addr.address}, {addr.city} — {addr.pincode}
                        </p>
                      </div>
                    </div>
                  ))}

                  {/* Add New Address Option */}
                  <div
                    onClick={() => setSelectedAddrId('new')}
                    className={`p-3.5 border-2 border-dashed rounded-xl cursor-pointer transition-all flex items-center gap-2 font-bold ${
                      selectedAddrId === 'new'
                        ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Plus className="w-4 h-4 text-blue-600" />
                    <span>+ Add New Shipping Address</span>
                  </div>
                </div>

                {/* New Address Form Input Fields */}
                {selectedAddrId === 'new' && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Student Name"
                          value={newAddr.name}
                          onChange={(e) => setNewAddr({ ...newAddr, name: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Mobile (WhatsApp) *</label>
                        <input
                          type="tel"
                          required
                          placeholder="e.g. 9840418228"
                          value={newAddr.phone}
                          onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Street Address & Door No *</label>
                      <input
                        type="text"
                        required
                        placeholder="No. 45, Medavakkam High Rd..."
                        value={newAddr.address}
                        onChange={(e) => setNewAddr({ ...newAddr, address: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white focus:border-blue-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">City / District *</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Chennai"
                          value={newAddr.city}
                          onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">6-Digit Pincode *</label>
                        <input
                          type="text"
                          maxLength={6}
                          required
                          placeholder="e.g. 600012"
                          value={newAddr.pincode}
                          onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none bg-white focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveInlineAddress}
                      className="w-full bg-blue-600 hover:bg-[#001B3A] text-white font-extrabold text-xs py-2.5 rounded-lg transition-colors mt-2 shadow-xs cursor-pointer"
                    >
                      ✓ SAVE & USE THIS ADDRESS
                    </button>
                  </div>
                )}

                {/* Coupon */}
                <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-2">
                  <label className="block font-black text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-amber-600" />
                    Coupon / Offer Code
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      placeholder="Enter code from homepage"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold uppercase bg-white"
                    />
                    <button
                      type="button"
                      disabled={couponBusy}
                      onClick={async () => {
                        setCouponBusy(true);
                        await applyCouponCode(couponInput, freeBookPickId || undefined);
                        setCouponBusy(false);
                      }}
                      className="px-4 py-2 bg-[#001B3A] text-white text-xs font-bold rounded-lg disabled:opacity-60"
                    >
                      Apply
                    </button>
                  </div>
                  {appliedCoupon && (
                    <p className="text-[11px] font-bold text-emerald-700">
                      ✓ {appliedCoupon.code}: {appliedCoupon.label}
                      {appliedCoupon.freeBookTitle ? ` — ${appliedCoupon.freeBookTitle}` : ''}
                      {appliedCoupon.offerType === 'discount' && appliedCoupon.discountAmount > 0
                        ? ` (−₹${appliedCoupon.discountAmount})`
                        : ''}
                      <button type="button" onClick={clearAppliedCoupon} className="ml-2 text-red-600">
                        Remove
                      </button>
                    </p>
                  )}
                  {(pendingCouponCode && !appliedCoupon) ||
                  (appliedCoupon?.offerType === 'free_book' && !appliedCoupon?.freeBookId) ? (
                    <div className="pt-2 border-t border-amber-200/80">
                      <p className="text-[10px] font-black uppercase text-amber-900 mb-2">
                        Pick your FREE book
                      </p>
                      <select
                        value={freeBookPickId}
                        onChange={(e) => setFreeBookPickId(e.target.value)}
                        className="w-full px-3 py-2 border rounded-lg text-xs bg-white"
                      >
                        <option value="">Select a book…</option>
                        {freeBookOptions.map((p) => (
                            <option key={p.id} value={String(p.id)}>
                              {p.title} — ₹{p.price}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={!freeBookPickId || couponBusy}
                        onClick={async () => {
                          setCouponBusy(true);
                          await applyCouponCode(couponInput || pendingCouponCode, freeBookPickId);
                          setCouponBusy(false);
                        }}
                        className="mt-2 w-full py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg disabled:opacity-60"
                      >
                        Confirm Free Book
                      </button>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-xs font-bold pt-1">
                    <span>Order total</span>
                    <span>₹{cartGrandTotal}</span>
                  </div>
                </div>

                {/* Quality & Payment Method */}
                <div className="pt-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs mb-3">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>100% Original Book Guarantee</span>
                    </div>
                    <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded">FREE EXPRESS DELIVERY</span>
                  </div>

                  <label className="block font-black text-slate-800 uppercase tracking-wider text-[10px] mb-2">
                    Payment Method:
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      onClick={() => setPaymentMethod('razorpay')}
                      className={`p-3 border-2 rounded-xl cursor-pointer flex items-center gap-2 font-bold text-xs transition-colors ${
                        paymentMethod === 'razorpay'
                          ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="pay"
                        checked={paymentMethod === 'razorpay'}
                        onChange={() => {}}
                      />
                      <span>Razorpay (UPI / Cards)</span>
                    </label>

                    <label
                      onClick={() => setPaymentMethod('cod')}
                      className={`p-3 border-2 rounded-xl cursor-pointer flex items-center gap-2 font-bold text-xs transition-colors ${
                        paymentMethod === 'cod'
                          ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="pay"
                        checked={paymentMethod === 'cod'}
                        onChange={() => {}}
                      />
                      <span>Cash on Delivery (COD)</span>
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-sm py-3.5 rounded-xl shadow-md uppercase tracking-wider mt-4"
                >
                  CONFIRM & PLACE ORDER (₹{cartGrandTotal})
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Track Order Modal */}
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

      {/* Authentication Modal */}
      <AnimatePresence>
        {isAuthOpen && (
          <GoogleAuthModal
            onClose={() => setIsAuthOpen(false)}
            forceProfileStep={!!user?.needsProfile}
          />
        )}
      </AnimatePresence>

      {/* User Profile Quick Menu Modal */}
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
        {/* Custom Brand-Exclusive Blessing Power Guide Order Victory Splash Modal */}
        {orderSuccessData && (
          <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 30 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-white rounded-[2.5rem] max-w-lg w-full p-6 sm:p-9 text-center space-y-6 shadow-[0_25px_60px_-15px_rgba(0,27,58,0.5)] relative border border-slate-200/80 overflow-hidden"
            >
              {/* Background Ambient Radial Aura */}
              <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-80 h-80 bg-gradient-to-tr from-amber-400/40 via-blue-600/30 to-emerald-400/40 rounded-full blur-3xl opacity-60 pointer-events-none animate-pulse" />
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-300/20 rounded-full blur-2xl pointer-events-none" />

              {/* Unique BPG Crest Icon with Glowing Pulse Ring */}
              <div className="relative inline-block mt-2">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#001B3A] via-[#002B5B] to-[#0044AA] text-white flex items-center justify-center mx-auto shadow-2xl ring-8 ring-amber-400/30 transform -rotate-3 hover:rotate-0 transition-transform duration-300">
                  <PackageCheck className="w-12 h-12 text-amber-400 stroke-[2.2]" />
                </div>
                <div className="absolute -bottom-2 right-0 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-black text-[10px] px-3 py-1 rounded-full shadow-lg border border-white flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                  <span>BPG VERIFIED</span>
                </div>
              </div>

              {/* Title & Subtitle */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-700 text-[11px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full border border-amber-400/30">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                  <span>ORDER CONFIRMED &amp; DISPATCH READY</span>
                </div>

                <h2 className="font-heading font-black text-2xl sm:text-3xl text-[#001B3A] tracking-tight">
                  Congratulations on Your Guide Book Order!
                </h2>

                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  Your order is confirmed and saved. ST Courier fulfillment is now underway!
                </p>
              </div>

              {/* Interactive Order Details Summary Box */}
              <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200/90 rounded-3xl p-5 text-left space-y-3 shadow-inner">
                <div className="flex justify-between items-center pb-3 border-b border-slate-200/70">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">OFFICIAL ORDER NUMBER</span>
                    <span className="font-mono font-black text-[#001B3A] text-base">#{orderSuccessData.orderId}</span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(orderSuccessData.orderId);
                      showToast('📋 Order ID copied to clipboard!');
                    }}
                    className="text-[10px] font-bold text-blue-600 bg-blue-100/80 hover:bg-blue-200/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    COPY ID
                  </button>
                </div>

                <div className="flex justify-between items-center pb-3 border-b border-slate-200/70">
                  <div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">TOTAL PAYMENT</span>
                    <span className="font-black text-emerald-600 text-sm">₹{orderSuccessData.totalAmount}</span>
                  </div>
                  <span className="text-[11px] font-extrabold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">
                    {orderSuccessData.paymentMethod}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 border border-amber-400/30">
                      <Truck className="w-5 h-5 text-amber-500" />
                    </div>
                    <div>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">GUARANTEED ST COURIER DELIVERY</span>
                      <span className="font-black text-[#001B3A] text-xs sm:text-sm">
                        Arriving by {getSTCourierDeliveryEstimate(orderSuccessData.city).formattedDate} before 11 PM
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* WhatsApp Automated Dispatch Status Card */}
              <div className="bg-[#001B3A] text-white rounded-2xl p-4 flex items-center justify-between text-xs shadow-lg">
                <div className="flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/40">
                    <Send className="w-4.5 h-4.5 animate-pulse" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-200 block">WhatsApp Notification Sent</span>
                    <span className="text-[11px] text-emerald-400 font-mono">+91 {orderSuccessData.phone}</span>
                  </div>
                </div>
                <span className="text-[10px] font-extrabold bg-emerald-500 text-slate-950 px-2.5 py-1 rounded-lg">
                  LIVE
                </span>
              </div>

              {/* High-Impact Action Buttons */}
              <div className="space-y-3 pt-1">
                <button
                  onClick={() => {
                    const oid = orderSuccessData.orderId;
                    setOrderSuccessData(null);
                    router.push(`/track?orderId=${encodeURIComponent(oid)}`);
                  }}
                  className="w-full bg-gradient-to-r from-[#001B3A] via-[#002B5B] to-[#0044AA] hover:from-blue-700 hover:to-blue-600 text-white font-black text-xs py-4 rounded-2xl shadow-xl uppercase tracking-wider flex items-center justify-center gap-2.5 transition-all transform hover:-translate-y-0.5 cursor-pointer"
                >
                  <Truck className="w-4 h-4 text-amber-400" />
                  <span>TRACK ST COURIER SHIPMENT LIVE</span>
                </button>

                <button
                  onClick={() => {
                    setOrderSuccessData(null);
                    router.push('/');
                  }}
                  className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-3.5 rounded-2xl transition-colors cursor-pointer"
                >
                  CONTINUE SHOPPING
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
