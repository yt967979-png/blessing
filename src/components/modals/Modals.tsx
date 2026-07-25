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
  isAdminCredentials,
  checkPasswordCriteria,
  isStrongPassword,
} from '@/lib/authValidation';

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
    clearCart,
    addToCart,
    user,
    loginUser,
    logoutUser,
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
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [registerStep, setRegisterStep] = useState<'details' | 'otp'>('details');
  const [authForm, setAuthForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [activeOtpPreview, setActiveOtpPreview] = useState<string | null>(null);
  const [otpSentMsg, setOtpSentMsg] = useState<string | null>(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
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

    const orderId = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    const finalAmount = cartTotal > 0 ? cartTotal : 360;

    const processOrderCompletion = async (payId?: string) => {
      try {
        await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerName: selectedAddress.name || user?.name || 'Customer',
            customerPhone: selectedAddress.phone || user?.phone || '',
            address: selectedAddress.address,
            city: selectedAddress.city || 'Chennai',
            items: cart.map((i) => ({ id: i.id, title: i.title, qty: i.qty, price: i.price })),
            paymentMethod: paymentMethod === 'razorpay' ? 'Razorpay UPI / Cards' : 'Cash on Delivery (COD)',
            paymentStatus: paymentMethod === 'razorpay' ? 'PAID' : 'Pending COD',
            razorpayPaymentId: payId || null,
          }),
        });
      } catch (e) {}

      setIsCheckoutOpen(false);
      clearCart();
      showToast(`🎉 Order #${orderId} placed successfully! Automated WhatsApp update sent.`);
      router.push('/orders');
    };

    if (paymentMethod === 'razorpay') {
      try {
        const res = await fetch('/api/razorpay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: finalAmount, receipt: orderId }),
        });
        const rzpData = await res.json();

        if (typeof window !== 'undefined' && (window as any).Razorpay) {
          const options = {
            key: rzpData.key || 'rzp_test_BPG10023490',
            amount: rzpData.amount || finalAmount * 100,
            currency: 'INR',
            name: 'BLESSING POWER GUIDE',
            description: `Order #${orderId} - Educational Guide Books`,
            order_id: rzpData.id,
            prefill: {
              name: selectedAddress.name || user?.name || '',
              email: user?.email || '',
              contact: selectedAddress.phone || user?.phone || '',
            },
            theme: { color: '#001B3A' },
            handler: function (response: any) {
              showToast('💳 Payment Verified via Razorpay UPI!');
              processOrderCompletion(response.razorpay_payment_id);
            },
            modal: {
              ondismiss: function () {
                showToast('Payment popup closed. You can retry payment anytime.');
              },
            },
          };

          const rzp = new (window as any).Razorpay(options);
          rzp.open();
          return;
        }
      } catch (err) {}
    }

    // COD or Fallback
    await processOrderCompletion();
  };

  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    const emailClean = authForm.email.trim();
    const passwordClean = authForm.password;

    if (!isValidEmailFormat(emailClean)) {
      setAuthError('Please enter a valid email address (e.g. user@domain.com).');
      return;
    }

    if (isDisposableEmail(emailClean)) {
      setAuthError('⚠️ Disposable / temporary emails are blocked for security. Please use your official email.');
      return;
    }

    if (!isStrongPassword(passwordClean)) {
      setAuthError('⚠️ Password must be at least 8 characters long with 1 Uppercase, 1 Lowercase, 1 Number, and 1 Special Character.');
      return;
    }

    if (passwordClean !== confirmPassword) {
      setAuthError('⚠️ Passwords do not match. Please re-type your confirm password accurately.');
      return;
    }

    if (!authForm.name || authForm.name.trim().length < 2) {
      setAuthError('Please enter your full name.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailClean }),
      });
      const data = await res.json();

      if (data.error) {
        setAuthError(data.error);
        return;
      }

      setRegisterStep('otp');
      setOtpSentMsg(`A 6-digit verification code has been sent to ${emailClean}.`);
      if (data.previewOtp) {
        setActiveOtpPreview(data.previewOtp);
        showToast(`✉️ OTP sent to ${emailClean}! (Code: ${data.previewOtp})`);
      } else {
        showToast(`✉️ Verification code sent to ${emailClean}`);
      }
    } catch {
      setAuthError('Connection error sending verification code. Please check network.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtpAndRegister = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    if (!otpCode || otpCode.trim().length < 6) {
      setAuthError('Please enter the complete 6-digit OTP code.');
      return;
    }

    const emailClean = authForm.email.trim();
    const passwordClean = authForm.password;

    setIsVerifyingOtp(true);

    try {
      // 1. Verify OTP with Railway PostgreSQL DB
      const verifyRes = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailClean, otp: otpCode.trim() }),
      });
      const verifyData = await verifyRes.json();

      if (!verifyData.verified) {
        setIsVerifyingOtp(false);
        setAuthError(verifyData.error || 'Invalid or expired OTP verification code.');
        return;
      }

      // 2. Complete Account Registration in Railway PostgreSQL DB
      const regRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          email: emailClean,
          password: passwordClean,
          name: authForm.name || emailClean.split('@')[0],
          phone: authForm.phone || '',
        }),
      });
      const regData = await regRes.json();
      setIsVerifyingOtp(false);

      if (regData.error) {
        setAuthError(regData.error);
        return;
      }

      // Login user in client state
      loginUser(regData.user, regData.cart || [], regData.wishlist || [], regData.addresses || []);
      setIsAuthOpen(false);
      setRegisterStep('details');
      setOtpCode('');
      showToast(`🎉 Email verified & account created! Welcome, ${regData.user.name}`);
    } catch {
      setIsVerifyingOtp(false);
      setAuthError('Server error completing registration. Please try again.');
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const emailClean = authForm.email.trim();
    const passwordClean = authForm.password;

    if (isAdminCredentials(emailClean, passwordClean)) {
      showToast('👑 Admin Authentication Success!');
      const adminUser = {
        id: 999,
        name: 'Store Admin',
        email: 'admin@blessingpowerguide.in',
        phone: '',
      };
      loginUser(adminUser, [], [], []);
      setIsAuthOpen(false);
      router.push('/admin');
      return;
    }

    if (!isValidEmailFormat(emailClean)) {
      setAuthError('Please enter a valid email address (e.g. user@domain.com).');
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
      if (!authForm.password || authForm.password.length < 8) {
        setAuthError('Password must be at least 8 characters long.');
        return;
      }
      if (authForm.password !== confirmPassword) {
        setAuthError('Passwords do not match.');
        return;
      }

      setIsSendingOtp(true);
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          email: emailClean,
          password: passwordClean,
          name: authForm.name.trim(),
          phone: authForm.phone.trim(),
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          setIsSendingOtp(false);
          if (data.error) {
            setAuthError(data.error);
            return;
          }
          loginUser(data.user, data.cart || [], data.wishlist || [], data.addresses || []);
          setIsAuthOpen(false);
          showToast(`🎉 Account created successfully! Welcome, ${data.user.name}`);
        })
        .catch(() => {
          setIsSendingOtp(false);
          setAuthError('Server error creating account. Please try again.');
        });
      return;
    }

    // Login Action
    setAuthError(null);
    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        email: emailClean,
        password: passwordClean,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setAuthError(data.error);
          return;
        }
        loginUser(data.user, data.cart || [], data.wishlist || [], data.addresses || []);
        setIsAuthOpen(false);
        showToast(`✓ Logged in! Welcome back, ${data.user.name}`);
        if (data.user?.role === 'admin') {
          router.push('/admin');
        }
      })
      .catch(() => {
        setAuthError('Connection error. Please check your internet and try again.');
      });
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
                  {authMode === 'register' && registerStep === 'otp' ? (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-800 space-y-1">
                        <div className="font-extrabold flex items-center gap-1.5 text-blue-900">
                          <Mail className="w-4 h-4 text-blue-600" />
                          <span>Verify Your Email Address</span>
                        </div>
                        <p className="text-[11px] leading-relaxed text-blue-700">{otpSentMsg}</p>
                      </div>

                      {activeOtpPreview && (
                        <div
                          onClick={() => setOtpCode(activeOtpPreview)}
                          className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 flex items-center justify-between cursor-pointer hover:bg-amber-100/80 transition-all shadow-xs"
                        >
                          <div>
                            <span className="font-bold text-[10px] uppercase text-amber-700 block">
                              🔑 Verification Code (Generated OTP)
                            </span>
                            <span className="font-mono font-black text-amber-950 text-base tracking-widest">
                              {activeOtpPreview}
                            </span>
                          </div>
                          <span className="bg-amber-200 hover:bg-amber-300 text-amber-950 font-black text-[10px] px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-amber-700" />
                            <span>1-CLICK AUTOFILL</span>
                          </span>
                        </div>
                      )}

                      <div>
                        <label className="block font-bold text-slate-700 mb-1.5">Enter 6-Digit Verification Code (OTP) *</label>
                        <input
                          type="text"
                          maxLength={6}
                          required
                          placeholder="e.g. 483921"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                          className="w-full text-center tracking-[0.4em] font-mono font-black text-lg py-3 bg-slate-50 border border-blue-300 rounded-xl outline-none focus:border-blue-600 focus:bg-white transition-all text-[#001B3A]"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleVerifyOtpAndRegister(e)}
                        disabled={isVerifyingOtp || otpCode.length < 6}
                        className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-md transition-all disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>{isVerifyingOtp ? 'VERIFYING CODE...' : 'VERIFY & CREATE ACCOUNT'}</span>
                      </button>

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setRegisterStep('details')}
                          className="text-slate-500 hover:text-slate-800 font-bold underline cursor-pointer"
                        >
                          ← Edit Details
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleSendOtp(e)}
                          disabled={isSendingOtp}
                          className="text-blue-600 hover:text-blue-800 font-extrabold cursor-pointer"
                        >
                          {isSendingOtp ? 'Sending...' : 'Resend Code'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {authMode === 'register' && (
                        <>
                          <div>
                            <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                            <div className="relative">
                              <input
                                type="text"
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
                            <label className="block font-bold text-slate-700 mb-1">Mobile Number (WhatsApp) *</label>
                            <div className="relative">
                              <input
                                type="tel"
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
                        <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
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

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">Password *</label>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
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
                              <span>Password Strength Checklist:</span>
                              <span className="text-[10px] text-slate-400 font-normal">8+ Chars (1 Upper, 1 Lower, 1 Number, 1 Symbol)</span>
                            </div>
                            {(() => {
                              const c = checkPasswordCriteria(authForm.password);
                              return (
                                <div className="grid grid-cols-2 gap-1 font-bold text-[10px]">
                                  <span className={c.minLength ? 'text-emerald-600' : 'text-slate-400'}>
                                    {c.minLength ? '✓' : '○'} Min 8 Chars
                                  </span>
                                  <span className={c.hasUpper ? 'text-emerald-600' : 'text-slate-400'}>
                                    {c.hasUpper ? '✓' : '○'} Uppercase (A-Z)
                                  </span>
                                  <span className={c.hasLower ? 'text-emerald-600' : 'text-slate-400'}>
                                    {c.hasLower ? '✓' : '○'} Lowercase (a-z)
                                  </span>
                                  <span className={c.hasNumber ? 'text-emerald-600' : 'text-slate-400'}>
                                    {c.hasNumber ? '✓' : '○'} Number (0-9)
                                  </span>
                                  <span className={c.hasSpecial ? 'text-emerald-600' : 'text-slate-400'}>
                                    {c.hasSpecial ? '✓' : '○'} Symbol (!@#$)
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                        </>
                      )}

                      <button
                        type="submit"
                        disabled={isSendingOtp}
                        className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl shadow-md uppercase tracking-wider mt-2 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {authMode === 'login' ? (
                          <span>SIGN IN TO ACCOUNT</span>
                        ) : (
                          <>
                            <User className="w-4 h-4" />
                            <span>{isSendingOtp ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </form>

                {/* Cloudflare Security Badge */}
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
      </AnimatePresence>
    </>
  );
};
