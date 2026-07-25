'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { isDisposableEmail, isValidEmailFormat, isAdminCredentials } from '@/lib/authValidation';

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

  // Saved Addresses (Flipkart Style)
  const [selectedAddrId, setSelectedAddrId] = useState<number | 'new'>(1);
  const [savedAddresses, setSavedAddresses] = useState([
    {
      id: 1,
      type: 'HOME',
      name: 'M. Karthik',
      phone: '9840418228',
      address: 'No. 45, Medavakkam High Rd, Agaramthen',
      city: 'Chennai',
      pincode: '600012',
    },
    {
      id: 2,
      type: 'WORK',
      name: 'M. Karthik',
      phone: '9840418228',
      address: 'Trust Square Street, Medavakkam',
      city: 'Chennai',
      pincode: '600012',
    },
  ]);

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
  const [authForm, setAuthForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [authError, setAuthError] = useState<string | null>(null);

  const selectedAddress =
    selectedAddrId === 'new'
      ? newAddr
      : savedAddresses.find((a) => a.id === selectedAddrId) || savedAddresses[0];

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedAddrId === 'new' && (!newAddr.name || !newAddr.address || !newAddr.pincode)) {
      alert('Please fill out all address fields.');
      return;
    }

    const orderId = 'BPG-' + Math.floor(1000 + Math.random() * 9000);
    const trackingNo = 'SR-TN-' + Math.floor(100000 + Math.random() * 900000);

    // Call API to store order live in database
    try {
      await fetch('http://localhost:5000/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: selectedAddress.name || 'Customer',
          customerPhone: selectedAddress.phone || '9840418228',
          address: selectedAddress.address,
          city: selectedAddress.city || 'Chennai',
          items: cart.map((i) => ({ id: i.id, title: i.title, qty: i.qty, price: i.price })),
          paymentMethod,
        }),
      });
    } catch (e) {}

    setIsCheckoutOpen(false);
    clearCart();

    showToast(`🎉 Order #${orderId} placed successfully! Automated WhatsApp update sent.`);
    router.push('/orders');
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
        phone: '9840418228',
      };
      loginUser(adminUser);
      setIsAuthOpen(false);
      router.push('/admin');
      return;
    }

    if (!isValidEmailFormat(emailClean)) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    if (authMode === 'register') {
      if (isDisposableEmail(emailClean)) {
        setAuthError('⚠️ Disposable/Temporary emails are blocked for security. Please use a real email.');
        return;
      }
      if (passwordClean.length < 6) {
        setAuthError('Password must be at least 6 characters.');
        return;
      }
    }

    const newUser = {
      id: Date.now(),
      name: authForm.name || emailClean.split('@')[0],
      email: emailClean,
      phone: authForm.phone || '9840418228',
    };

    loginUser(newUser);
    setIsAuthOpen(false);
    showToast(`✓ Logged in permanently as ${newUser.name}`);
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

      {/* Flipkart Style Checkout Modal */}
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
                          placeholder="e.g. Karthik M"
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
                  </div>
                )}

                {/* Flipkart Assured & Payment Method */}
                <div className="pt-2">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs mb-3">
                    <div className="flex items-center gap-2 text-emerald-800 font-bold">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <span>Flipkart Assured • 100% Original Book Guarantee</span>
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

      {/* Auth Modal */}
      <AnimatePresence>
        {isAuthOpen && (
          <div
            onClick={() => setIsAuthOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-sm w-full relative shadow-2xl"
            >
              <button
                onClick={() => setIsAuthOpen(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="font-heading font-extrabold text-lg text-[#001B3A] mb-1">
                {authMode === 'login' ? '👤 Account Login' : '📝 Create Account'}
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                {authMode === 'login'
                  ? 'Sign in to access your saved orders & profile'
                  : 'Register with a valid email address'}
              </p>

              {authError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-[11px] text-red-600 font-semibold mb-3 flex items-start gap-1.5">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-500 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-3 text-xs">
                {authMode === 'register' && (
                  <>
                    <input
                      type="text"
                      required
                      placeholder="Full Name *"
                      value={authForm.name}
                      onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                    />
                    <input
                      type="tel"
                      required
                      placeholder="Mobile Number *"
                      value={authForm.phone}
                      onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                    />
                  </>
                )}
                <input
                  type="email"
                  required
                  placeholder="Email Address *"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                />
                <input
                  type="password"
                  required
                  placeholder="Password *"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:border-blue-600"
                />

                <button
                  type="submit"
                  className="w-full bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs py-3 rounded-xl shadow-md uppercase tracking-wider mt-2 transition-colors"
                >
                  {authMode === 'login' ? 'LOGIN' : 'REGISTER'}
                </button>
              </form>

              <p className="text-center text-xs text-slate-600 mt-4">
                {authMode === 'login' ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      onClick={() => {
                        setAuthMode('register');
                        setAuthError(null);
                      }}
                      className="text-blue-600 font-bold underline"
                    >
                      Register
                    </button>
                  </>
                ) : (
                  <>
                    Already registered?{' '}
                    <button
                      onClick={() => {
                        setAuthMode('login');
                        setAuthError(null);
                      }}
                      className="text-blue-600 font-bold underline"
                    >
                      Login
                    </button>
                  </>
                )}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* User Profile Modal */}
      <AnimatePresence>
        {isProfileOpen && user && (
          <div
            onClick={() => setIsProfileOpen(false)}
            className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-sm w-full relative shadow-2xl text-xs"
            >
              <button
                onClick={() => setIsProfileOpen(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <X className="w-4 h-4" />
              </button>

              <h3 className="font-heading font-extrabold text-lg text-[#001B3A] mb-3">
                👤 My Profile Account
              </h3>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 mb-4">
                <div>
                  <span className="font-bold text-slate-500">Name:</span> {user.name}
                </div>
                <div>
                  <span className="font-bold text-slate-500">Email:</span> {user.email}
                </div>
                <div>
                  <span className="font-bold text-slate-500">Phone:</span> {user.phone}
                </div>
              </div>

              <button
                onClick={() => {
                  logoutUser();
                  setIsProfileOpen(false);
                }}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 shadow-sm transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>LOGOUT</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
