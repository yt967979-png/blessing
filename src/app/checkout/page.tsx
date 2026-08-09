'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  MapPin,
  Plus,
  ShieldCheck,
  Truck,
  ChevronRight,
  Check,
  AlertTriangle,
  CreditCard,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { createUserAddress, migrateLocalAddressesToDb, type SavedAddress } from '@/lib/addresses';
import { pincodeDeliveryMessage } from '@/lib/pincode';
import { isValidMobileNumber } from '@/lib/authValidation';
import { userNeedsProfile } from '@/lib/userProfile';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { getCartItemStockState, anyCartItemBlocking } from '@/lib/cartStock';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';

type Step = 1 | 2 | 3;

export default function CheckoutPage() {
  const router = useRouter();
  const {
    user,
    cart,
    products,
    cartCount,
    cartTotal,
    shippingFee,
    cartGrandTotal,
    checkoutTotal,
    clearCartAfterOrder,
    setOrderSuccessData,
    showToast,
    setIsAuthOpen,
    setIsCheckoutOpen,
    validateCartStock,
  } = useStore();
  const hasBlockingItem = anyCartItemBlocking(cart, products);

  const [step, setStep] = useState<Step>(1);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState('new');
  const [savingAddress, setSavingAddress] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const orderSubmitLock = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const pendingRazorpayOrderIdRef = useRef<string | null>(null);
  const [newAddr, setNewAddr] = useState({
    type: 'HOME',
    name: '',
    phone: '',
    alternatePhone: '',
    address: '',
    city: '',
    pincode: '',
  });

  useEffect(() => {
    setIsCheckoutOpen(false);
  }, [setIsCheckoutOpen]);

  // Re-check stock the moment checkout opens — catches an admin change that
  // happened between adding to cart and reaching checkout.
  useEffect(() => {
    void validateCartStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setIsAuthOpen(true);
      showToast('Please continue with Google to proceed to checkout');
      router.replace('/cart');
      return;
    }
    if (user.needsProfile || userNeedsProfile(user.phone)) {
      setIsAuthOpen(true);
      showToast('Please add your mobile number before checkout');
      router.replace('/cart');
      return;
    }
    if (cart.length === 0) {
      router.replace('/cart');
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await migrateLocalAddressesToDb(user);
      if (cancelled) return;
      setSavedAddresses(list);
      if (list.length > 0) {
        const def = list.find((a) => a.isDefault) || list[0];
        setSelectedAddrId(def.id);
      } else {
        setSelectedAddrId('new');
      }
      setNewAddr((prev) => ({
        ...prev,
        name: prev.name || user.name || '',
        phone: prev.phone || user.phone || '',
      }));
    })();
    return () => {
      cancelled = true;
    };
  }, [user, cart.length, router, setIsAuthOpen, showToast]);

  const selectedAddress =
    selectedAddrId === 'new'
      ? newAddr
      : savedAddresses.find((a) => a.id === selectedAddrId) || savedAddresses[0];

  const handleSaveInlineAddress = async () => {
    if (!user?.id) return false;
    if (!newAddr.name || !newAddr.address || !newAddr.pincode) {
      showToast('Fill name, address and pincode');
      return false;
    }
    if (!isValidMobileNumber(newAddr.phone || user.phone || '')) {
      showToast('Enter a valid 10-digit primary mobile number');
      return false;
    }
    if (newAddr.alternatePhone && !isValidMobileNumber(newAddr.alternatePhone)) {
      showToast('Enter a valid alternate mobile number (or leave blank)');
      return false;
    }
    const pinCheck = pincodeDeliveryMessage(String(newAddr.pincode));
    if (!pinCheck.ok) {
      showToast(pinCheck.message);
      return false;
    }
    setSavingAddress(true);
    try {
      const added = await createUserAddress(user, {
        type: newAddr.type,
        name: newAddr.name,
        phone: newAddr.phone,
        alternatePhone: newAddr.alternatePhone,
        address: newAddr.address,
        city: newAddr.city || 'Chennai',
        pincode: String(newAddr.pincode),
        isDefault: true,
      });
      if (added) {
        setSavedAddresses((prev) => [added, ...prev.map((a) => ({ ...a, isDefault: false }))]);
        setSelectedAddrId(added.id);
        showToast('Address saved');
        return true;
      }
    } finally {
      setSavingAddress(false);
    }
    return false;
  };

  const goToReview = async () => {
    if (cartCount < 4) {
      showToast('Minimum order quantity is 4 books.');
      return;
    }
    if (selectedAddrId === 'new') {
      const ok = await handleSaveInlineAddress();
      if (!ok) return;
    }
    setStep(2);
  };

  const handlePlaceOrder = async () => {
    if (orderSubmitLock.current || isPlacingOrder || !user) return;
    if (cartCount < 4) {
      showToast('Minimum order quantity is 4 books.');
      return;
    }
    orderSubmitLock.current = true;
    setIsPlacingOrder(true);
    const release = () => {
      orderSubmitLock.current = false;
      setIsPlacingOrder(false);
    };

    // Best-effort fast release — the moment we know the customer did NOT pay
    // (modal closed, payment declined, client-side error), tell the server to
    // give the reserved stock back right away instead of waiting for the
    // ~20-minute TTL sweeper. Not required for correctness (webhook + sweeper
    // are the reliable backstops) — purely speeds up availability for others.
    const releasePendingHold = (reason: string) => {
      const rzpOrderId = pendingRazorpayOrderIdRef.current;
      if (!rzpOrderId) return;
      pendingRazorpayOrderIdRef.current = null;
      fetch('/api/razorpay/release', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({ razorpayOrderId: rzpOrderId, reason }),
        keepalive: true,
      }).catch(() => {});
    };
    // A previous attempt's hold should already be released by one of the
    // paths below, but never leak a reservation if it somehow wasn't.
    releasePendingHold('superseded_by_new_attempt');

    // Final live stock gate before opening Razorpay — never trust the qty the
    // customer had when they started checkout.
    const clean = await validateCartStock();
    if (!clean) {
      showToast('⚠️ Some items changed — please review your cart before paying.');
      release();
      setStep(2);
      return;
    }

    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = `bpg-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }
      const finalAmount = checkoutTotal > 0 ? checkoutTotal : cartGrandTotal > 0 ? cartGrandTotal : cartTotal;

      const processOrderCompletion = async (payId?: string, rzpOrderId?: string, rzpSignature?: string) => {
        const orderRes = await fetch('/api/orders', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            userId: user.id,
            customerName: selectedAddress.name || user.name || 'Customer',
            customerPhone: selectedAddress.phone || user.phone || '',
            alternatePhone: (selectedAddress as any).alternatePhone || '',
            address: selectedAddress.address,
            city: selectedAddress.city || 'Chennai',
            pincode: selectedAddress.pincode || '600012',
            items: cart.map((i) => ({ id: i.id, qty: i.qty, price: i.price })),
            paymentMethod: 'Razorpay UPI / Online',
            razorpayPaymentId: payId || null,
            razorpayOrderId: rzpOrderId || null,
            razorpaySignature: rzpSignature || null,
            idempotencyKey: idempotencyKeyRef.current,
          }),
        });
        const orderData = await orderRes.json();
        if (!orderRes.ok) {
          showToast(`❌ ${orderData.error || 'Order failed'}`);
          // Order confirm failed after payment was captured — the server
          // already refunds the payment (see /api/orders); the stock hold
          // itself rolls back to 'held' automatically (same DB transaction),
          // so it's still eligible for the TTL sweeper. Nothing to release
          // here since this razorpay_order_id can't be retried once failed.
          pendingRazorpayOrderIdRef.current = null;
          return false;
        }
        const serverOrderId = orderData.orderId;
        if (!serverOrderId) {
          showToast('❌ Order was not saved');
          pendingRazorpayOrderIdRef.current = null;
          return false;
        }
        // Payment confirmed and order created — the hold is now permanently
        // 'confirmed' server-side, nothing left to release for this attempt.
        pendingRazorpayOrderIdRef.current = null;
        clearCartAfterOrder();
        idempotencyKeyRef.current = null;
        setOrderSuccessData({
          orderId: serverOrderId,
          totalAmount: Number(orderData.totalAmount ?? finalAmount),
          customerName: selectedAddress.name || user.name || 'Customer',
          address: selectedAddress.address,
          city: selectedAddress.city || 'Chennai',
          phone: selectedAddress.phone || user.phone || '',
          paymentMethod: 'Razorpay UPI / Online',
          paymentStatus: orderData.paymentStatus || 'Payment Confirmed',
          status: orderData.status || 'Confirmed',
          items: cart.map((i) => ({
            title: i.title,
            qty: i.qty,
            price: i.price,
          })),
        });
        if (!orderData.duplicate) showToast(`🎉 Order #${serverOrderId} confirmed!`);
        router.push(`/orders?orderId=${encodeURIComponent(serverOrderId)}`);
        return true;
      };

      // Online Razorpay Payment Flow
      const cartPayload = cart.map((i) => ({ id: i.id, qty: i.qty }));
      const res = await fetch('/api/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
        },
        body: JSON.stringify({
          items: cartPayload,
          receipt: `rcpt-${Date.now()}`,
        }),
      });

      const rzpData = await res.json();
      if (!res.ok) {
        showToast(`❌ ${rzpData.error || 'Payment initialization failed'}`);
        release();
        return;
      }

      // Stock is reserved server-side as of this response (POST /api/razorpay
      // already decremented books.stock and wrote the hold). Track the order
      // id so we can release it fast if the customer doesn't end up paying.
      pendingRazorpayOrderIdRef.current = rzpData.orderId;

      if (!(window as any).Razorpay) {
        try {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://checkout.razorpay.com/v1/checkout.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Razorpay SDK script failed to load.'));
            document.body.appendChild(script);
          });
        } catch (scriptErr: any) {
          showToast(`❌ ${scriptErr?.message || 'Could not load payment gateway'}`);
          releasePendingHold('razorpay_script_load_failed');
          release();
          return;
        }
      }

      const options = {
        key: rzpData.key,
        amount: rzpData.amount,
        currency: rzpData.currency || 'INR',
        name: 'Blessing Power Guide',
        description: 'Quality Educational Guides Purchase',
        image: '/logo.png',
        order_id: rzpData.orderId,
        prefill: {
          name: selectedAddress.name || user.name || '',
          contact: selectedAddress.phone || user.phone || '',
          email: user.email || '',
        },
        notes: {
          userId: String(user.id),
          customerPhone: selectedAddress.phone || user.phone || '',
        },
        theme: { color: '#0044AA' },
        handler: async function (response: any) {
          const verified = await processOrderCompletion(
            response.razorpay_payment_id,
            response.razorpay_order_id,
            response.razorpay_signature
          );
          if (!verified) release();
        },
        modal: {
          ondismiss: function () {
            showToast('Payment window closed.');
            releasePendingHold('modal_dismissed');
            release();
          },
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (resp: any) {
        showToast(`❌ Payment Failed: ${resp.error?.description || 'Declined'}`);
        releasePendingHold('payment_failed');
        release();
      });
      rzp.open();
    } catch (e: any) {
      showToast(`❌ ${e?.message || 'Order failed'}`);
      releasePendingHold('client_error');
      release();
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />

      <div className="max-w-4xl mx-auto px-4 py-8 w-full flex-1">
        {/* Step Indicator */}
        <div className="flex items-center justify-between max-w-md mx-auto mb-8 text-xs font-bold">
          <div className={`flex items-center gap-1.5 ${step >= 1 ? 'text-[#0044AA]' : 'text-slate-400'}`}>
            <span className="w-6 h-6 rounded-full bg-current text-white flex items-center justify-center text-[10px]">
              1
            </span>
            <span>Address</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <div className={`flex items-center gap-1.5 ${step >= 2 ? 'text-[#0044AA]' : 'text-slate-400'}`}>
            <span className="w-6 h-6 rounded-full bg-current text-white flex items-center justify-center text-[10px]">
              2
            </span>
            <span>Summary</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300" />
          <div className={`flex items-center gap-1.5 ${step >= 3 ? 'text-[#0044AA]' : 'text-slate-400'}`}>
            <span className="w-6 h-6 rounded-full bg-current text-white flex items-center justify-center text-[10px]">
              3
            </span>
            <span>Confirm</span>
          </div>
        </div>

        {/* Minimum 4 Books Alert Banner */}
        {cartCount < 4 && (
          <div className="max-w-2xl mx-auto mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 text-amber-900 text-xs font-medium shadow-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-sm mb-0.5">Minimum Order Quantity: 4 Books</p>
              <p>
                You currently have <strong>{cartCount} book(s)</strong> in your cart. Please add{' '}
                <strong>{4 - cartCount} more guide(s)</strong> to complete your order.
              </p>
              <Link href="/search" className="inline-block mt-2 font-bold text-[#0044AA] hover:underline cursor-pointer">
                + Browse Guides & Add to Cart →
              </Link>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto bg-white rounded-3xl p-6 border border-slate-200 shadow-xl">
          {step === 1 && (
            <div className="space-y-4 text-xs">
              <h2 className="font-heading font-black text-lg text-[#001B3A]">Shipping Address</h2>
              {savedAddresses.length > 0 && (
                <div className="space-y-2">
                  {savedAddresses.map((a) => (
                    <label
                      key={a.id}
                      className={`block p-3 border-2 rounded-xl cursor-pointer ${
                        selectedAddrId === a.id ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="addr"
                        checked={selectedAddrId === a.id}
                        onChange={() => setSelectedAddrId(a.id)}
                        className="sr-only"
                      />
                      <span className="font-bold text-slate-900">{a.name}</span> · {a.phone}
                      <p className="text-slate-600 text-[11px] mt-0.5">
                        {a.address}, {a.city} — {a.pincode}
                      </p>
                    </label>
                  ))}
                  <label
                    className={`block p-3 border-2 rounded-xl cursor-pointer ${
                      selectedAddrId === 'new' ? 'border-blue-600 bg-blue-50/50' : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="addr"
                      checked={selectedAddrId === 'new'}
                      onChange={() => setSelectedAddrId('new')}
                      className="sr-only"
                    />
                    <span className="font-bold text-blue-600 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add a new address
                    </span>
                  </label>
                </div>
              )}

              {(selectedAddrId === 'new' || savedAddresses.length === 0) && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                      <input
                        value={newAddr.name}
                        onChange={(e) => setNewAddr({ ...newAddr, name: e.target.value })}
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                        placeholder="Recipient name"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Mobile Phone *</label>
                      <input
                        maxLength={10}
                        value={newAddr.phone}
                        onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value.replace(/\D/g, '') })}
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                        placeholder="10-digit mobile"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Address *</label>
                    <input
                      value={newAddr.address}
                      onChange={(e) => setNewAddr({ ...newAddr, address: e.target.value })}
                      className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                      placeholder="Door no., Street name, Landmark"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">City / District *</label>
                      <input
                        value={newAddr.city}
                        onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Pincode *</label>
                      <input
                        maxLength={6}
                        value={newAddr.pincode}
                        onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value.replace(/\D/g, '') })}
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                        placeholder="6-digit pincode"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingAddress}
                    onClick={() => void handleSaveInlineAddress()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-2.5 rounded-lg disabled:opacity-60 transition-all"
                  >
                    {savingAddress ? 'Saving Address…' : 'Save Address'}
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={cartCount < 4}
                onClick={() => void goToReview()}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-sm py-3.5 rounded-xl uppercase tracking-wider disabled:opacity-50 transition-all min-h-12 touch-manipulation"
              >
                Deliver Here →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-bold text-slate-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" /> Deliver to
                  </p>
                  <p className="text-slate-600 mt-0.5">
                    {selectedAddress?.name} · {selectedAddress?.phone}
                    <br />
                    {selectedAddress?.address}, {selectedAddress?.city} — {selectedAddress?.pincode}
                  </p>
                </div>
                <button type="button" onClick={() => setStep(1)} className="text-blue-600 font-bold hover:underline">
                  Edit
                </button>
              </div>

              <div className="space-y-2">
                {cart.map((item) => {
                  const stockState = getCartItemStockState(item, products);
                  return (
                    <div
                      key={item.id}
                      className={`flex gap-3 items-center border rounded-xl p-3 ${
                        stockState.blocking ? 'border-red-300 bg-red-50/40' : 'border-slate-100'
                      }`}
                    >
                      <Image
                        src={item.image || '/logo.png'}
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 object-contain bg-slate-50 rounded-lg"
                        unoptimized={imageNeedsUnoptimized(item.image || '')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 truncate">{item.title}</p>
                        <p className="text-slate-500">
                          Qty {item.qty} · ₹{item.price * item.qty}
                        </p>
                        {!stockState.inStock ? (
                          <p className="text-[10px] font-bold text-red-600 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Out of stock — go back to cart to remove
                          </p>
                        ) : stockState.overLimit ? (
                          <p className="text-[10px] font-bold text-amber-600 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Only {stockState.stock} available
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Delivery Fee Notice */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs">
                {cartCount >= 5 ? (
                  <p className="font-bold flex items-center gap-1 text-emerald-700">
                    <Check className="w-4 h-4 text-emerald-600" /> 🎉 FREE Delivery Offer applied ({cartCount} books)!
                  </p>
                ) : (
                  <p className="font-medium">
                    📦 Delivery Charge: <strong>₹150</strong> ({cartCount} books). Add{' '}
                    <strong>{5 - cartCount} more guide(s)</strong> for <strong>FREE Delivery</strong>!
                  </p>
                )}
              </div>



              {/* Breakdown */}
              <div className="space-y-1.5 pt-2 border-t text-slate-600">
                <div className="flex justify-between">
                  <span>Books Subtotal ({cartCount} qty)</span>
                  <span>₹{cartTotal}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery Charge</span>
                  <span className={shippingFee === 0 ? 'text-emerald-600 font-bold' : ''}>
                    {shippingFee === 0 ? 'FREE' : `₹${shippingFee}`}
                  </span>
                </div>
                <div className="flex justify-between font-black text-base text-[#001B3A] pt-2 border-t">
                  <span>Total Pay</span>
                  <span>₹{cartGrandTotal}</span>
                </div>
              </div>

              {hasBlockingItem && (
                <p className="text-xs font-bold text-red-600 text-center flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Fix out-of-stock items before continuing
                </p>
              )}
              <button
                type="button"
                disabled={cartCount < 4 || hasBlockingItem}
                onClick={async () => {
                  const clean = await validateCartStock();
                  if (!clean) return;
                  setStep(3);
                }}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-sm py-3.5 rounded-xl uppercase tracking-wider disabled:opacity-50 transition-all"
              >
                Review & Confirm →
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Confirm your order before payment
                </div>
                <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded flex items-center gap-1">
                  <Truck className="w-3 h-3" /> {shippingFee === 0 ? 'FREE Delivery' : 'Fast ST Courier'}
                </span>
              </div>

              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="font-bold text-slate-800 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" /> Deliver to
                </p>
                <p className="text-slate-600 mt-0.5">
                  {selectedAddress?.name} · {selectedAddress?.phone}
                  <br />
                  {selectedAddress?.address}, {selectedAddress?.city} — {selectedAddress?.pincode}
                </p>
              </div>

              <div className="space-y-2">
                {cart.map((item) => {
                  const stockState = getCartItemStockState(item, products);
                  return (
                    <div
                      key={item.id}
                      className={`flex gap-3 items-center border rounded-xl p-3 ${
                        stockState.blocking ? 'border-red-300 bg-red-50/40' : 'border-slate-100'
                      }`}
                    >
                      <Image
                        src={item.image || '/logo.png'}
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 object-contain bg-slate-50 rounded-lg"
                        unoptimized={imageNeedsUnoptimized(item.image || '')}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-900 truncate">{item.title}</p>
                        <p className="text-slate-500">
                          Qty {item.qty} · ₹{item.price * item.qty}
                        </p>
                        {!stockState.inStock ? (
                          <p className="text-[10px] font-bold text-red-600 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Out of stock
                          </p>
                        ) : stockState.overLimit ? (
                          <p className="text-[10px] font-bold text-amber-600 mt-0.5 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Only {stockState.stock} available
                          </p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="block font-extrabold text-slate-800 mb-2">Payment method</label>
                <div className="p-4 border-2 border-[#0044AA] bg-blue-50/50 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#0044AA] text-white rounded-xl flex items-center justify-center">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-black text-slate-900 text-sm">Razorpay Online Payment</p>
                      <p className="text-[11px] text-slate-500">UPI (GPay, PhonePe, Paytm), Debit & Credit Cards, NetBanking</p>
                    </div>
                  </div>
                  <Check className="w-5 h-5 text-[#0044AA]" />
                </div>
              </div>

              <div className="space-y-1.5 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal ({cartCount} guides)</span>
                  <span>₹{cartTotal}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Charge</span>
                  <span className={shippingFee === 0 ? 'text-emerald-600 font-bold' : ''}>
                    {shippingFee === 0 ? 'FREE' : `₹${shippingFee}`}
                  </span>
                </div>
                <div className="flex justify-between font-black text-lg text-[#001B3A] pt-2 border-t border-slate-200">
                  <span>Total Amount</span>
                  <span>₹{cartGrandTotal}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                All sales are final. After you confirm, Razorpay opens to complete payment. You cannot cancel online after paying.
              </p>

              {hasBlockingItem && (
                <p className="text-xs font-bold text-red-600 text-center flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" /> Some items are out of stock — go back and fix your cart
                </p>
              )}

              <button
                type="button"
                disabled={isPlacingOrder || cart.length === 0 || cartCount < 4 || hasBlockingItem}
                onClick={() => void handlePlaceOrder()}
                className="w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-700 text-[#001B3A] font-black text-sm py-4 rounded-xl uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-60 transition-all hover:scale-[1.01] min-h-12 touch-manipulation"
              >
                {isPlacingOrder ? 'Opening Razorpay…' : `Confirm order · Pay ₹${cartGrandTotal}`}
              </button>
              <button
                type="button"
                disabled={isPlacingOrder}
                onClick={() => router.push('/cart')}
                className="w-full border border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-50 disabled:opacity-60 transition-all"
              >
                No, go back
              </button>
              <button
                type="button"
                disabled={isPlacingOrder}
                onClick={() => setStep(2)}
                className="w-full text-slate-500 font-semibold text-center pt-1"
              >
                ← Edit order summary
              </button>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
}
