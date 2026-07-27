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
  AlertCircle,
  MapPin,
  Plus,
  ShieldCheck,
  Tag,
  Mail,
  Phone,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import {
  isDisposableEmail,
  isValidEmailFormat,
  checkPasswordCriteria,
  isStrongPassword,
} from '@/lib/authValidation';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';

export const Modals = () => {
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
    checkoutTotal,
    appliedCouponCode,
    setAppliedCouponCode,
    clearCart,
    addToCart,
    user,
    loginUser,
    logoutUser,
    orderSuccessData,
    setOrderSuccessData,
    showToast,
  } = useStore();

  // Saved Addresses
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<number | 'new'>('new');

  useEffect(() => {
    const saved = localStorage.getItem('bpg_user_addresses');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedAddresses(parsed);
          setSelectedAddrId(parsed[0].id);
        }
      } catch (e) {}
    }
  }, [isCheckoutOpen]);

  // New Address Form
  const [newAddr, setNewAddr] = useState({
    type: 'HOME',
    name: '',
    phone: '',
    address: '',
    city: '',
    pincode: '',
  });

  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay');

  // Track state
  const [trackId, setTrackId] = useState('BPG-1082');
  const [trackResult, setTrackResult] = useState<any>(null);

  // Auth form state
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [regOtp, setRegOtp] = useState('');
  const [regStep, setRegStep] = useState<'details' | 'otp'>('details');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState<'email' | 'otp'>('email');
  const [forgotOtpSent, setForgotOtpSent] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const selectedAddress =
    selectedAddrId === 'new'
      ? newAddr
      : savedAddresses.find((a) => a.id === selectedAddrId) || savedAddresses[0];

  const handleSaveInlineAddress = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!newAddr.name || !newAddr.address || !newAddr.pincode) {
      alert('Please fill out Receiver Name, Address, and Pincode.');
      return false;
    }

    const createdAddr = {
      id: Date.now(),
      type: newAddr.type || 'HOME',
      name: newAddr.name,
      phone: newAddr.phone || user?.phone || '',
      address: newAddr.address,
      city: newAddr.city || 'Chennai',
      pincode: newAddr.pincode,
    };

    const updatedList = [...savedAddresses, createdAddr];
    setSavedAddresses(updatedList);
    localStorage.setItem('bpg_user_addresses', JSON.stringify(updatedList));
    setSelectedAddrId(createdAddr.id);
    showToast('✓ Shipping address saved & selected!');
    return true;
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedAddrId === 'new') {
      const saved = handleSaveInlineAddress();
      if (!saved) return;
    }

    const finalAmount = checkoutTotal > 0 ? checkoutTotal : (cartTotal > 0 ? cartTotal : 360);

    const processOrderCompletion = async (payId?: string, rzpOrderId?: string, rzpSignature?: string) => {
      let serverOrderId = '';
      try {
        const orderRes = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user?.id || user?.email || selectedAddress.name || 'guest',
            customerName: selectedAddress.name || user?.name || 'Customer',
            customerPhone: selectedAddress.phone || user?.phone || '',
            address: selectedAddress.address,
            city: selectedAddress.city || 'Chennai',
            pincode: selectedAddress.pincode || '600012',
            items: cart.map((i) => ({ id: i.id, title: i.title, qty: i.qty, price: i.price })),
            couponCode: appliedCouponCode || null,
            paymentMethod: paymentMethod === 'razorpay' ? 'Razorpay UPI / Cards' : 'Cash on Delivery (COD)',
            paymentStatus: paymentMethod === 'razorpay' ? 'Payment Confirmed' : 'Pending COD',
            razorpayPaymentId: payId || null,
            razorpayOrderId: rzpOrderId || null,
            razorpaySignature: rzpSignature || null,
          }),
        });
        const orderData = await orderRes.json();
        if (orderRes.ok && orderData.orderId) {
          serverOrderId = orderData.orderId;
        }
      } catch (_) {}

      const confirmedOrderId = serverOrderId || `BPG-${Math.floor(1000 + Math.random() * 9000)}`;

      setIsCheckoutOpen(false);
      clearCart();
      setAppliedCouponCode(null);
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
        const res = await fetch('/api/razorpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: finalAmount, receipt: receiptId }),
        });
        const rzpData = await res.json();

        if (!res.ok || !rzpData.id) {
          showToast('❌ Could not create payment order. Please try again.');
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
              // Verify signature server-side before confirming order
              const verifyRes = await fetch('/api/razorpay', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifyData = await verifyRes.json();

              if (!verifyData.verified) {
                showToast('❌ Payment verification failed. Please contact support.');
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
                showToast('Payment popup closed. You can retry anytime.');
              },
            },
          };

          const rzp = new (window as any).Razorpay(options);
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

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const emailClean = authForm.email.trim();
    const passwordClean = authForm.password;

    if (!isValidEmailFormat(emailClean)) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    if (authMode === 'register') {
      if (!authForm.name || authForm.name.trim().length < 2) {
        setAuthError('Please enter your full name.');
        return;
      }
      if (!authForm.phone || authForm.phone.trim().length < 10) {
        setAuthError('Please enter a valid 10-digit mobile number.');
        return;
      }
      if (isDisposableEmail(emailClean)) {
        setAuthError('Disposable / temporary emails are blocked. Please use your real email.');
        return;
      }
      if (!isStrongPassword(passwordClean)) {
        setAuthError('Password must be at least 8 characters with 1 uppercase, 1 lowercase, 1 number, and 1 special character.');
        return;
      }
      if (passwordClean !== confirmPassword) {
        setAuthError('Passwords do not match.');
        return;
      }

      if (regStep === 'details') {
        setIsSubmitting(true);
        try {
          // Send WhatsApp OTP to customer's mobile number
          const otpRes = await fetch('/api/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailClean, phone: authForm.phone.trim(), mode: 'register' }),
          });
          const otpData = await otpRes.json();
          if (otpRes.ok && otpData.success) {
            setRegStep('otp');
            showToast(`📲 6-digit verification code sent to your WhatsApp (${authForm.phone.trim()})!`);
          } else {
            setAuthError(otpData.error || 'Failed to send WhatsApp verification code.');
          }
        } catch (e) {
          setAuthError('Error dispatching WhatsApp OTP.');
        } finally {
          setIsSubmitting(false);
        }
        return;
      }

      // RegStep === 'otp' -> Verify OTP & Complete Registration
      if (!regOtp || regOtp.trim().length !== 6) {
        setAuthError('Please enter the 6-digit WhatsApp OTP code.');
        return;
      }

      setIsSubmitting(true);
      try {
        const verifyRes = await fetch('/api/auth/verify-otp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailClean, otp: regOtp.trim() }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.verified) {
          setAuthError(verifyData.error || 'Invalid or expired WhatsApp OTP code.');
          setIsSubmitting(false);
          return;
        }

        // WhatsApp OTP verified -> complete registration in DB
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'register',
            email: emailClean,
            password: passwordClean,
            name: authForm.name.trim(),
            phone: authForm.phone.trim(),
          }),
        });
        const data = await res.json();
        if (data.error) { setAuthError(data.error); return; }
        loginUser(data.user, data.cart || [], data.wishlist || [], data.addresses || []);
        setIsAuthOpen(false);
        setRegStep('details');
        setRegOtp('');
        showToast(`🎉 Account verified & created! Welcome, ${data.user.name}`);
        if (data.user?.role === 'admin') router.push('/admin');
      } catch {
        setAuthError('Server error. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Login
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: emailClean, password: passwordClean }),
      });
      const data = await res.json();
      if (data.error) { setAuthError(data.error); return; }
      loginUser(data.user, data.cart || [], data.wishlist || [], data.addresses || []);
      setIsAuthOpen(false);
      showToast(`✓ Welcome back, ${data.user.name}`);
      if (data.user?.role === 'admin') router.push('/admin');
    } catch {
      setAuthError('Connection error. Please check your internet and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Quick View Modal */}
      <AnimatePresence>
        {quickViewProduct && (
          <div
            onClick={() => setQuickViewProduct(null)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-lg w-full relative shadow-2xl overflow-hidden"
            >
              <button
                onClick={() => setQuickViewProduct(null)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
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
                  <span
                    className={`text-[10px] font-extrabold text-white px-2 py-0.5 rounded ${quickViewProduct.badgeColor} inline-block mb-2`}
                  >
                    {quickViewProduct.badge}
                  </span>
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
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-lg w-full relative shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 mb-1">
                <Lock className="w-5 h-5 text-amber-500" />
                <h3 className="font-heading font-black text-xl text-[#001B3A]">
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
                  CONFIRM & PLACE ORDER (₹{cartTotal})
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
                Enter your Order ID to track delivery status.
              </p>

              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  placeholder="e.g. BPG-1082"
                  value={trackId}
                  onChange={(e) => setTrackId(e.target.value)}
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs outline-none focus:border-blue-600 uppercase"
                />
                <button
                  onClick={() => router.push('/orders')}
                  className="bg-[#001B3A] text-white font-bold text-xs px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                >
                  TRACK
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Authentication Modal */}
      <AnimatePresence>
        {isAuthOpen && (
          <div
            onClick={() => setIsAuthOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl max-w-md w-full relative shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100 my-auto custom-scrollbar"
            >
              {/* Header Hero Banner */}
              <div className="bg-gradient-to-r from-[#001B3A] via-[#002B5B] to-[#0044AA] text-white p-6 relative">
                <button
                  onClick={() => setIsAuthOpen(false)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-amber-500 text-[#001B3A] rounded-lg flex items-center justify-center font-black text-sm shadow-md">
                    B
                  </div>
                  <span className="font-heading font-black text-xs text-amber-300 tracking-wider uppercase">
                    BLESSING POWER GUIDE
                  </span>
                </div>

                <h3 className="font-heading font-black text-xl text-white">
                  {authMode === 'login' ? 'Welcome Back!' : 'Create Your Student Account'}
                </h3>
                <p className="text-xs text-slate-300 mt-1">
                  {authMode === 'login'
                    ? 'Sign in to access your saved orders, profile & rewards'
                    : 'Join 10,000+ students for fast shipping & exam guides'}
                </p>
              </div>

              {/* Mode Toggle Tabs */}
              <div className="flex border-b border-slate-200 text-xs font-extrabold">
                <button
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                  }}
                  className={`flex-1 py-3 text-center transition-colors border-b-2 ${
                    authMode === 'login'
                      ? 'border-blue-600 text-blue-600 bg-blue-50/40'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  SIGN IN
                </button>
                <button
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError(null);
                  }}
                  className={`flex-1 py-3 text-center transition-colors border-b-2 ${
                    authMode === 'register'
                      ? 'border-blue-600 text-blue-600 bg-blue-50/40'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  CREATE ACCOUNT
                </button>
              </div>

              <div className="p-6">
                {authError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-600 font-semibold mb-4 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                    <span>{authError}</span>
                  </div>
                )}

                <form onSubmit={handleAuthSubmit} className="space-y-3.5 text-xs">
                  <>
                    {authMode === 'register' && (
                      <>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1" htmlFor="auth-name">Full Name *</label>
                          <div className="relative">
                            <input
                              id="auth-name"
                              name="name"
                              type="text"
                              autoComplete="name"
                              required
                              placeholder="e.g. Student Name"
                              value={authForm.name}
                              onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-600 focus:bg-white transition-all font-medium"
                            />
                            <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          </div>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 mb-1" htmlFor="auth-phone">Mobile Number (WhatsApp) *</label>
                          <div className="relative">
                            <input
                              id="auth-phone"
                              name="phone"
                              type="tel"
                              autoComplete="tel"
                              required
                              placeholder="e.g. 9840418228"
                              value={authForm.phone}
                              onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                              className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-600 focus:bg-white transition-all font-medium"
                            />
                            <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="auth-email">
                        {authMode === 'login' ? 'Mobile Number (WhatsApp) *' : 'Email Address *'}
                      </label>
                      <div className="relative">
                        <input
                          id="auth-email"
                          name="username"
                          type={authMode === 'login' ? 'tel' : 'email'}
                          autoComplete="username"
                          required
                          placeholder={authMode === 'login' ? "e.g. 9840418228" : "e.g. student@gmail.com"}
                          value={authForm.email}
                          onChange={(e) => setAuthForm({ ...authForm, email: e.target.value, phone: e.target.value })}
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-600 focus:bg-white transition-all font-medium"
                        />
                        {authMode === 'login' ? (
                          <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        ) : (
                          <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1" htmlFor="auth-password">Password *</label>
                      <div className="relative">
                        <input
                          id="auth-password"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                          required
                          placeholder="••••••••••••"
                          value={authForm.password}
                          onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                          className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-600 focus:bg-white transition-all font-medium"
                        />
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {authMode === 'login' && (
                        <div className="text-right mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('forgot');
                              setAuthError(null);
                              setForgotStep('email');
                            }}
                            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                          >
                            Forgot Password?
                          </button>
                        </div>
                      )}
                    </div>

                    {authMode === 'register' && (
                      <>
                        <div>
                          <label className="block font-bold text-slate-700 mb-1">Confirm Password *</label>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              required
                              placeholder="Re-type password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className={`w-full pl-9 pr-10 py-2.5 bg-slate-50 border rounded-xl text-xs outline-none focus:bg-white transition-all font-medium ${
                                confirmPassword && confirmPassword !== authForm.password
                                  ? 'border-red-400 focus:border-red-500'
                                  : 'border-slate-200 focus:border-blue-600'
                              }`}
                            />
                            <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {confirmPassword && confirmPassword !== authForm.password && (
                            <span className="text-[10px] font-bold text-red-500 mt-0.5 block">
                              Passwords do not match
                            </span>
                          )}
                        </div>

                        {/* Live Password Criteria Checklist */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-[11px]">
                          <div className="font-bold text-slate-700 mb-1 flex items-center justify-between">
                            <span>Password Strength:</span>
                            <span className="text-[10px] text-slate-400 font-normal">8+ chars, upper, lower, number, symbol</span>
                          </div>
                          {(() => {
                            const c = checkPasswordCriteria(authForm.password);
                            return (
                              <div className="grid grid-cols-2 gap-1 font-bold text-[10px]">
                                <span className={c.minLength ? 'text-emerald-600' : 'text-slate-400'}>{c.minLength ? '✓' : '○'} Min 8 Chars</span>
                                <span className={c.hasUpper ? 'text-emerald-600' : 'text-slate-400'}>{c.hasUpper ? '✓' : '○'} Uppercase</span>
                                <span className={c.hasLower ? 'text-emerald-600' : 'text-slate-400'}>{c.hasLower ? '✓' : '○'} Lowercase</span>
                                <span className={c.hasNumber ? 'text-emerald-600' : 'text-slate-400'}>{c.hasNumber ? '✓' : '○'} Number</span>
                                <span className={c.hasSpecial ? 'text-emerald-600' : 'text-slate-400'}>{c.hasSpecial ? '✓' : '○'} Symbol (!@#$)</span>
                              </div>
                            );
                          })()}
                        </div>

                        {regStep === 'otp' && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 space-y-2">
                            <label className="block font-bold text-blue-900 text-xs">
                              Enter 6-Digit WhatsApp OTP Code *
                            </label>
                            <input
                              type="text"
                              maxLength={6}
                              required
                              placeholder="6-digit code"
                              value={regOtp}
                              onChange={(e) => setRegOtp(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-center tracking-widest text-blue-900 outline-none focus:border-blue-600 uppercase"
                            />
                            <p className="text-[10px] text-blue-600 font-medium">
                              📲 Code sent to your WhatsApp number <strong>{authForm.phone}</strong>.
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {authMode === 'forgot' ? (
                      <div className="space-y-3.5">
                        <div className="text-center pb-1">
                          <h4 className="font-bold text-slate-900 text-sm">Reset Your Password</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {forgotStep === 'email'
                              ? 'Enter your registered email to receive a 6-digit OTP code.'
                              : `Enter the 6-digit code sent to ${authForm.email} and set your new password.`}
                          </p>
                        </div>

                        {forgotStep === 'email' ? (
                          <>
                            <div>
                              <label className="block font-bold text-slate-700 mb-1">Registered Email Address *</label>
                              <div className="relative">
                                <input
                                  type="email"
                                  required
                                  placeholder="e.g. student@example.com"
                                  value={authForm.email}
                                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-600 focus:bg-white transition-all font-medium"
                                />
                                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={isSubmitting || !authForm.email}
                              onClick={async () => {
                                setIsSubmitting(true);
                                setAuthError(null);
                                try {
                                  const res = await fetch('/api/auth/send-otp', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ email: authForm.email, mode: 'reset' }),
                                  });
                                  const data = await res.json();
                                  if (res.ok && data.success) {
                                    setForgotStep('otp');
                                    setForgotOtpSent(true);
                                    showToast('✉️ 6-digit password reset OTP sent to your email!');
                                  } else {
                                    setAuthError(data.error || 'Failed to send reset code.');
                                  }
                                } catch (e) {
                                  setAuthError('Network error sending OTP.');
                                } finally {
                                  setIsSubmitting(false);
                                }
                              }}
                              className="w-full bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-md uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isSubmitting ? 'SENDING OTP...' : 'SEND RESET OTP CODE'}
                            </button>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="block font-bold text-slate-700 mb-1">6-Digit Verification Code (OTP) *</label>
                              <input
                                type="text"
                                maxLength={6}
                                required
                                placeholder="Enter 6-digit OTP code"
                                value={forgotOtp}
                                onChange={(e) => setForgotOtp(e.target.value)}
                                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-center tracking-widest outline-none focus:border-blue-600 uppercase"
                              />
                            </div>

                            <div>
                              <label className="block font-bold text-slate-700 mb-1">New Password *</label>
                              <div className="relative">
                                <input
                                  type={showPassword ? 'text' : 'password'}
                                  required
                                  placeholder="Minimum 6 characters"
                                  value={forgotNewPassword}
                                  onChange={(e) => setForgotNewPassword(e.target.value)}
                                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-600 transition-all font-medium"
                                />
                                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={isSubmitting || !forgotOtp || !forgotNewPassword}
                              onClick={async () => {
                                setIsSubmitting(true);
                                setAuthError(null);
                                try {
                                  const res = await fetch('/api/auth/reset-password', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                      email: authForm.email,
                                      otp: forgotOtp,
                                      newPassword: forgotNewPassword,
                                    }),
                                  });
                                  const data = await res.json();
                                  if (res.ok && data.success) {
                                    showToast('✅ Password reset! Please sign in with your new password.');
                                    setAuthMode('login');
                                    setAuthError(null);
                                  } else {
                                    setAuthError(data.error || 'Password reset failed.');
                                  }
                                } catch (e) {
                                  setAuthError('Error resetting password.');
                                } finally {
                                  setIsSubmitting(false);
                                }
                              }}
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3 rounded-xl shadow-md uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                            >
                              {isSubmitting ? 'RESETTING...' : 'CONFIRM NEW PASSWORD'}
                            </button>
                          </>
                        )}

                        <div className="text-center pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setAuthMode('login');
                              setAuthError(null);
                            }}
                            className="text-xs font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                          >
                            ← Back to Sign In
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl shadow-md uppercase tracking-wider mt-2 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {authMode === 'login' ? (
                          <span>{isSubmitting ? 'SIGNING IN...' : 'SIGN IN TO ACCOUNT'}</span>
                        ) : regStep === 'details' ? (
                          <>
                            <Send className="w-4 h-4" />
                            <span>{isSubmitting ? 'SENDING WHATSAPP OTP...' : 'SEND WHATSAPP OTP CODE'}</span>
                          </>
                        ) : (
                          <>
                            <User className="w-4 h-4" />
                            <span>{isSubmitting ? 'VERIFYING & CREATING...' : 'VERIFY & CREATE ACCOUNT'}</span>
                          </>
                        )}
                      </button>
                    )}
                  </>
                </form>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Secured by 256-Bit SSL Encryption</span>
                </div>
              </div>
            </motion.div>
          </div>
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
                  Your order is booked &amp; logged into Railway PostgreSQL. ST Courier fulfillment is now underway!
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
                    router.push(`/orders?orderId=${oid}`);
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
