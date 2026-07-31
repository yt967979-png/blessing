'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Lock,
  MapPin,
  Plus,
  ShieldCheck,
  Tag,
  Truck,
  ChevronRight,
  Check,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { createUserAddress, migrateLocalAddressesToDb, type SavedAddress } from '@/lib/addresses';
import { pincodeDeliveryMessage } from '@/lib/pincode';
import { isValidMobileNumber } from '@/lib/authValidation';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';

type Step = 1 | 2 | 3;

export default function CheckoutPage() {
  const router = useRouter();
  const {
    user,
    cart,
    cartTotal,
    cartGrandTotal,
    checkoutTotal,
    appliedCoupon,
    publicCoupons,
    pendingCouponCode,
    products,
    applyCouponCode,
    clearAppliedCoupon,
    clearCartAfterOrder,
    setOrderSuccessData,
    showToast,
    setIsAuthOpen,
    setIsCheckoutOpen,
  } = useStore();

  const [step, setStep] = useState<Step>(1);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState('new');
  const [savingAddress, setSavingAddress] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('cod');
  const [couponInput, setCouponInput] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [freeBookPickId, setFreeBookPickId] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const orderSubmitLock = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
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

  useEffect(() => {
    if (!user?.id) {
      setIsAuthOpen(true);
      showToast('Please sign in with Google');
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

  useEffect(() => {
    if (pendingCouponCode) setCouponInput(pendingCouponCode);
  }, [pendingCouponCode]);

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
      const created = await createUserAddress(user, {
        type: newAddr.type || 'HOME',
        name: newAddr.name,
        phone: newAddr.phone || user.phone || '',
        alternatePhone: newAddr.alternatePhone || '',
        address: newAddr.address,
        city: newAddr.city || 'Chennai',
        pincode: newAddr.pincode,
        isDefault: savedAddresses.length === 0,
      });
      if (!created) {
        showToast('❌ Failed to save address');
        return false;
      }
      setSavedAddresses([created, ...savedAddresses]);
      setSelectedAddrId(created.id);
      setNewAddr({
        type: 'HOME',
        name: user.name || '',
        phone: user.phone || '',
        alternatePhone: '',
        address: '',
        city: '',
        pincode: '',
      });
      showToast('✓ Address saved');
      return true;
    } finally {
      setSavingAddress(false);
    }
  };

  const goToReview = async () => {
    if (selectedAddrId === 'new') {
      const ok = await handleSaveInlineAddress();
      if (!ok) return;
    }
    if (!selectedAddress?.address || !selectedAddress?.pincode) {
      showToast('Select or add a delivery address');
      return;
    }
    const pinCheck = pincodeDeliveryMessage(String(selectedAddress.pincode));
    if (!pinCheck.ok) {
      showToast(pinCheck.message);
      return;
    }
    setStep(2);
  };

  const handlePlaceOrder = async () => {
    if (orderSubmitLock.current || isPlacingOrder || !user) return;
    orderSubmitLock.current = true;
    setIsPlacingOrder(true);
    const release = () => {
      orderSubmitLock.current = false;
      setIsPlacingOrder(false);
    };

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
            paymentMethod: paymentMethod === 'razorpay' ? 'Razorpay UPI / Cards' : 'Cash on Delivery (COD)',
            razorpayPaymentId: payId || null,
            razorpayOrderId: rzpOrderId || null,
            razorpaySignature: rzpSignature || null,
            couponCode: appliedCoupon?.code || null,
            freeBookId: appliedCoupon?.freeBookId || null,
            idempotencyKey: idempotencyKeyRef.current,
          }),
        });
        const orderData = await orderRes.json();
        if (!orderRes.ok) {
          showToast(`❌ ${orderData.error || 'Order failed'}`);
          return false;
        }
        const serverOrderId = orderData.orderId;
        if (!serverOrderId) {
          showToast('❌ Order was not saved');
          return false;
        }
        clearCartAfterOrder();
        clearAppliedCoupon();
        idempotencyKeyRef.current = null;
        setOrderSuccessData({
          orderId: serverOrderId,
          totalAmount: finalAmount,
          customerName: selectedAddress.name || user.name || 'Customer',
          address: selectedAddress.address,
          city: selectedAddress.city || 'Chennai',
          phone: selectedAddress.phone || user.phone || '',
          paymentMethod: paymentMethod === 'razorpay' ? 'Razorpay UPI' : 'Cash on Delivery (COD)',
          paymentStatus: paymentMethod === 'razorpay' ? 'Payment Confirmed' : 'Pending COD',
        });
        if (!orderData.duplicate) showToast(`🎉 Order #${serverOrderId} placed!`);
        router.push('/orders');
        return true;
      };

      if (paymentMethod === 'razorpay') {
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
            couponCode: appliedCoupon?.code || null,
            freeBookId: appliedCoupon?.freeBookId || null,
          }),
        });
        const rzpData = await res.json();
        if (!res.ok || !rzpData.id) {
          showToast(rzpData.needsConfig ? 'Use Cash on Delivery for now' : `❌ ${rzpData.error || 'Payment failed'}`);
          if (rzpData.needsConfig) setPaymentMethod('cod');
          release();
          return;
        }
        if (!(window as any).Razorpay) {
          showToast('Payment script not loaded — try COD or refresh');
          release();
          return;
        }
        const rzp = new (window as any).Razorpay({
          key: rzpData.key,
          amount: rzpData.amount,
          currency: 'INR',
          name: 'BLESSING POWER GUIDE',
          description: 'Educational Guide Books Order',
          order_id: rzpData.id,
          prefill: {
            name: selectedAddress.name || user.name || '',
            email: user.email || '',
            contact: selectedAddress.phone || user.phone || '',
          },
          theme: { color: '#001B3A' },
          handler: async (response: any) => {
            const verifyRes = await fetch('/api/razorpay', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
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
              showToast(`❌ ${verifyData.error || 'Payment verification failed'}`);
              router.push('/payment/failed?reason=verify_failed');
              release();
              return;
            }
            await processOrderCompletion(
              response.razorpay_payment_id,
              response.razorpay_order_id,
              response.razorpay_signature
            );
            release();
          },
          modal: {
            ondismiss: () => {
              release();
              router.push('/payment/failed?reason=dismissed');
            },
          },
        });
        rzp.on('payment.failed', () => {
          release();
          router.push('/payment/failed?reason=failed');
        });
        rzp.open();
        return;
      }

      await processOrderCompletion();
      release();
    } catch {
      showToast('❌ Could not place order');
      release();
    }
  };

  const steps = [
    { n: 1 as Step, label: 'Address' },
    { n: 2 as Step, label: 'Order summary' },
    { n: 3 as Step, label: 'Payment' },
  ];

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />
      <NavBar />

      <div className="max-w-3xl mx-auto px-4 py-8 flex-1 w-full">
        <div className="flex items-center gap-2 mb-6 text-xs font-bold text-slate-500">
          <Link href="/cart" className="hover:text-blue-600">
            Cart
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-[#001B3A]">Checkout</span>
        </div>

        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <React.Fragment key={s.n}>
              <button
                type="button"
                onClick={() => {
                  if (s.n < step) setStep(s.n);
                }}
                className={`flex items-center gap-2 text-xs font-extrabold ${
                  step === s.n ? 'text-[#2874f0]' : step > s.n ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                <span
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] ${
                    step > s.n
                      ? 'bg-emerald-500 text-white'
                      : step === s.n
                        ? 'bg-[#2874f0] text-white'
                        : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {step > s.n ? <Check className="w-3.5 h-3.5" /> : s.n}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && <div className="flex-1 h-0.5 bg-slate-200 max-w-12" />}
            </React.Fragment>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-amber-500" />
            <h1 className="font-heading font-black text-xl text-[#001B3A]">
              {step === 1 ? 'Delivery address' : step === 2 ? 'Review order' : 'Payment'}
            </h1>
          </div>

          {step === 1 && (
            <div className="space-y-3 text-xs">
              {savedAddresses.map((addr) => (
                <button
                  type="button"
                  key={addr.id}
                  onClick={() => setSelectedAddrId(addr.id)}
                  className={`w-full text-left p-3.5 border-2 rounded-xl transition-all flex items-start gap-3 ${
                    selectedAddrId === addr.id
                      ? 'border-blue-600 bg-blue-50/50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input type="radio" checked={selectedAddrId === addr.id} readOnly className="mt-1" />
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                      <span className="bg-slate-900 text-amber-400 font-black text-[9px] px-2 py-0.5 rounded uppercase">
                        {addr.type}
                      </span>
                      {addr.isDefault && (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          DEFAULT
                        </span>
                      )}
                      <span className="font-extrabold text-slate-900">{addr.name}</span>
                      <span className="text-slate-500">• {addr.phone}</span>
                      {addr.alternatePhone ? (
                        <span className="text-slate-400">/ alt {addr.alternatePhone}</span>
                      ) : null}
                    </div>
                    <p className="text-slate-600 font-medium">
                      {addr.address}, {addr.city} — {addr.pincode}
                    </p>
                  </div>
                </button>
              ))}

              <button
                type="button"
                onClick={() => setSelectedAddrId('new')}
                className={`w-full p-3.5 border-2 border-dashed rounded-xl flex items-center gap-2 font-bold ${
                  selectedAddrId === 'new'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-700'
                    : 'border-slate-300 text-slate-700'
                }`}
              >
                <Plus className="w-4 h-4 text-blue-600" />
                Add new address
              </button>

              {selectedAddrId === 'new' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Full name *</label>
                      <input
                        value={newAddr.name}
                        onChange={(e) => setNewAddr({ ...newAddr, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Mobile *</label>
                      <input
                        value={newAddr.phone}
                        onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                        placeholder="Primary WhatsApp / COD"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Alternate mobile (optional)</label>
                    <input
                      value={newAddr.alternatePhone}
                      onChange={(e) => setNewAddr({ ...newAddr, alternatePhone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      placeholder="Second number for delivery person"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Address *</label>
                    <input
                      value={newAddr.address}
                      onChange={(e) => setNewAddr({ ...newAddr, address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">City *</label>
                      <input
                        value={newAddr.city}
                        onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Pincode *</label>
                      <input
                        maxLength={6}
                        value={newAddr.pincode}
                        onChange={(e) => setNewAddr({ ...newAddr, pincode: e.target.value.replace(/\D/g, '') })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingAddress}
                    onClick={() => void handleSaveInlineAddress()}
                    className="w-full bg-blue-600 text-white font-extrabold py-2.5 rounded-lg disabled:opacity-60"
                  >
                    {savingAddress ? 'Saving…' : 'Save address'}
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => void goToReview()}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-sm py-3.5 rounded-xl uppercase tracking-wider"
              >
                Deliver here →
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="font-bold text-slate-800 mb-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" /> Deliver to
                </p>
                <p className="text-slate-600">
                  {selectedAddress?.name} · {selectedAddress?.phone}
                  {(selectedAddress as any)?.alternatePhone
                    ? ` · alt ${(selectedAddress as any).alternatePhone}`
                    : ''}
                  <br />
                  {selectedAddress?.address}, {selectedAddress?.city} — {selectedAddress?.pincode}
                </p>
                <button type="button" onClick={() => setStep(1)} className="text-blue-600 font-bold mt-2">
                  Change
                </button>
              </div>

              <div className="space-y-2">
                {cart.map((item) => (
                  <div key={item.id} className="flex gap-3 items-center border border-slate-100 rounded-xl p-3">
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
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-3 space-y-2">
                <label className="font-black text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-amber-600" /> Coupon
                </label>
                <div className="flex gap-2">
                  <input
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    className="flex-1 px-3 py-2 border rounded-lg font-bold uppercase bg-white"
                    placeholder="CODE"
                  />
                  <button
                    type="button"
                    disabled={couponBusy}
                    onClick={async () => {
                      setCouponBusy(true);
                      await applyCouponCode(couponInput, freeBookPickId || undefined);
                      setCouponBusy(false);
                    }}
                    className="px-4 py-2 bg-[#001B3A] text-white font-bold rounded-lg"
                  >
                    Apply
                  </button>
                </div>
                {appliedCoupon && (
                  <p className="font-bold text-emerald-700">
                    ✓ {appliedCoupon.label}{' '}
                    <button type="button" onClick={clearAppliedCoupon} className="text-red-600 ml-2">
                      Remove
                    </button>
                  </p>
                )}
                {(pendingCouponCode && !appliedCoupon) ||
                (appliedCoupon?.offerType === 'free_book' && !appliedCoupon?.freeBookId) ? (
                  <div>
                    <select
                      value={freeBookPickId}
                      onChange={(e) => setFreeBookPickId(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg bg-white"
                    >
                      <option value="">Select free book…</option>
                      {freeBookOptions.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.title}
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
                      className="mt-2 w-full py-2 bg-emerald-600 text-white font-bold rounded-lg disabled:opacity-60"
                    >
                      Confirm free book
                    </button>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-between font-black text-base text-[#001B3A] pt-2 border-t">
                <span>Total</span>
                <span>₹{cartGrandTotal}</span>
              </div>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-sm py-3.5 rounded-xl uppercase"
              >
                Continue to payment →
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-800 font-bold">
                  <ShieldCheck className="w-4 h-4" />
                  100% original books
                </div>
                <span className="text-[10px] bg-emerald-600 text-white font-extrabold px-2 py-0.5 rounded flex items-center gap-1">
                  <Truck className="w-3 h-3" /> FREE delivery
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cod')}
                  className={`p-3 border-2 rounded-xl font-bold text-left ${
                    paymentMethod === 'cod' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200'
                  }`}
                >
                  Cash on Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('razorpay')}
                  className={`p-3 border-2 rounded-xl font-bold text-left ${
                    paymentMethod === 'razorpay' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200'
                  }`}
                >
                  UPI / Cards
                </button>
              </div>

              <div className="flex justify-between font-black text-lg text-[#001B3A]">
                <span>Pay</span>
                <span>₹{cartGrandTotal}</span>
              </div>

              <button
                type="button"
                disabled={isPlacingOrder || cart.length === 0}
                onClick={() => void handlePlaceOrder()}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-sm py-3.5 rounded-xl uppercase disabled:opacity-60"
              >
                {isPlacingOrder ? 'Placing order…' : `Place order · ₹${cartGrandTotal}`}
              </button>
              <button type="button" onClick={() => setStep(2)} className="w-full text-slate-500 font-semibold">
                ← Back to summary
              </button>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
}
