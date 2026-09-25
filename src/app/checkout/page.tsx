'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
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
  Tag,
  X,
  Loader2,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import { createUserAddress, migrateLocalAddressesToDb, updateUserAddress, type SavedAddress } from '@/lib/addresses';
import { pincodeDeliveryMessage } from '@/lib/pincode';
import { isValidMobileNumber, addressHasRequiredAlternate, normalizeRequiredAlternateMobile } from '@/lib/authValidation';
import { userNeedsProfile } from '@/lib/userProfile';
import { imageNeedsUnoptimized } from '@/lib/productImage';
import { getCartItemStockState, anyCartItemBlocking } from '@/lib/cartStock';
import { MIN_BOOKS_PER_ORDER, isMoqSatisfied, cartHasCombo } from '@/lib/deliveryRules';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { SwiggyCouponsModal } from '@/components/coupons/SwiggyCouponsModal';
import { useCouponCatalogSync } from '@/hooks/useCouponCatalogSync';
import { IS_CHECKOUT_PAUSED, CHECKOUT_PAUSE_MESSAGE } from '@/lib/checkoutControl';

type Step = 1 | 2 | 3;

export default function CheckoutPage() {
  const router = useRouter();
  const {
    user,
    cart,
    products,
    cartCount,
    cartTotal,
    hasComboInCart,
    effectiveCartCount,
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
  const [editDraft, setEditDraft] = useState<SavedAddress | null>(null);
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
    landmark: '',
    city: '',
    pincode: '',
  });

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountAmount: number;
    message: string;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [showCouponsModal, setShowCouponsModal] = useState(false);

  interface AvailableOffer {
    id: string;
    code: string;
    title: string;
    discountType: 'percentage' | 'flat';
    discountValue: number;
    minCartQty: number;
    minOrderAmount: number;
    maxDiscountAmount: number | null;
    alreadyUsed: boolean;
  }
  const [availableOffers, setAvailableOffers] = useState<AvailableOffer[]>([]);

  // Real-time synchronization for active promotional coupons
  const loadOffers = useCallback(async () => {
    try {
      const res = await fetch(`/api/coupons/available?t=${Date.now()}`, {
        cache: 'no-store',
        credentials: 'include',
        headers: authHeaders(user),
      });
      const data = await res.json().catch(() => ({}));
      const fresh: AvailableOffer[] = Array.isArray(data?.coupons) ? data.coupons : [];
      setAvailableOffers(fresh);

      // Instantly clear/remove applied coupon if turned off or deleted by admin
      setAppliedCoupon((prev) => {
        if (!prev) return null;
        const stillValid = fresh.some(
          (c) => c.code.toUpperCase() === prev.code.toUpperCase() && !c.alreadyUsed
        );
        if (!stillValid) {
          showToast(`Coupon ${prev.code} is no longer active.`);
          return null;
        }
        return prev;
      });
    } catch {
      setAvailableOffers([]);
    }
  }, [user, showToast]);

  useEffect(() => {
    void loadOffers();
  }, [loadOffers]);

  // Synchronize in real time with zero refresh needed
  useCouponCatalogSync(loadOffers);

  // Align client discount with Razorpay gateway minimum (₹1.00 / 100 paise) so customers are never blocked
  const effectiveDiscount = appliedCoupon
    ? Math.min(appliedCoupon.discountAmount, Math.max(0, cartGrandTotal - 1))
    : 0;
  const finalPayable = cartGrandTotal > 0 ? Math.max(1, cartGrandTotal - effectiveDiscount) : 0;

  // Restore draft address from localStorage if user reloaded or navigated away
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedDraft = localStorage.getItem('bpg_checkout_addr_draft');
      if (savedDraft) {
        const parsed = JSON.parse(savedDraft);
        if (parsed && typeof parsed === 'object' && parsed.address) {
          setNewAddr((prev) => ({ ...prev, ...parsed }));
        }
      }
    } catch {}
  }, []);

  // Check if a previous mobile UPI payment completed while the tab was asleep/reloading
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const pendingRzpId = sessionStorage.getItem('bpg_pending_rzp_order');
      if (pendingRzpId) {
        fetch(`/api/checkout/status?orderId=${encodeURIComponent(pendingRzpId)}`)
          .then((r) => r.json())
          .then((d) => {
            if (d.status === 'ORDER_CONFIRMED' && d.orderId) {
              sessionStorage.removeItem('bpg_pending_rzp_order');
              clearCartAfterOrder();
              router.push(`/orders?orderId=${encodeURIComponent(d.orderId)}`);
            }
          })
          .catch(() => {});
      }
    } catch {}
  }, [clearCartAfterOrder, router]);

  // Persist draft address on input changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (newAddr.name || newAddr.phone || newAddr.address) {
      try {
        localStorage.setItem('bpg_checkout_addr_draft', JSON.stringify(newAddr));
      } catch {}
    }
  }, [newAddr]);

  // Preload Razorpay checkout SDK as soon as customer opens checkout page
  useEffect(() => {
    if (typeof window !== 'undefined' && !(window as any).Razorpay) {
      const existing = document.querySelector('script[src*="checkout.razorpay.com"]');
      if (!existing) {
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.async = true;
        document.head.appendChild(s);
      }
    }
  }, []);

  const handleApplyCoupon = async (explicitCode?: unknown): Promise<{ ok: boolean; error?: string }> => {
    const code = (typeof explicitCode === 'string' ? explicitCode : couponInput).trim().toUpperCase();
    if (!code) return { ok: false, error: 'Please enter a coupon code' };
    setCouponInput(code);
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(user),
        body: JSON.stringify({
          code,
          cartQty: effectiveCartCount || cartCount,
          subtotal: cartTotal,
          items: cart.map((i) => ({ id: i.id, qty: i.qty, category: i.category, title: i.title })),
          hasCombo: hasComboInCart,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data.error || 'Failed to apply coupon';
        setCouponError(err);
        return { ok: false, error: err };
      }
      setAppliedCoupon({
        code: data.code,
        discountAmount: data.discountAmount,
        message: data.message,
      });
      showToast(data.message);
      return { ok: true };
    } catch {
      const netErr = 'Network error applying coupon';
      setCouponError(netErr);
      return { ok: false, error: netErr };
    } finally {
      setCouponLoading(false);
    }
  };

  const eligibleOffers = availableOffers.filter((c) => {
    if (c.alreadyUsed) return false;
    const meetsQty = hasComboInCart || (effectiveCartCount || cartCount) >= c.minCartQty;
    const meetsSubtotal = cartTotal >= c.minOrderAmount;
    return meetsQty && meetsSubtotal;
  });

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
    showToast('Coupon removed');
  };

  // Drop a stale preview if the cart changed after apply (server re-prices at pay)
  useEffect(() => {
    if (!appliedCoupon) return;
    setAppliedCoupon(null);
    setCouponError('Cart changed — please apply the coupon again.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartCount, cartTotal]);

  useEffect(() => {
    setIsCheckoutOpen(false);
  }, [setIsCheckoutOpen]);

  // Re-check stock the moment checkout opens — catches an admin change that
  // happened between adding to cart and reaching checkout.
  useEffect(() => {
    void validateCartStock();
     
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

  // Capture phone and synchronize abandoned cart snapshot immediately
  useEffect(() => {
    const rawPhone =
      (selectedAddress?.phone && selectedAddress.phone.replace(/\D/g, '').slice(-10)) ||
      (newAddr.phone && newAddr.phone.replace(/\D/g, '').slice(-10)) ||
      (user?.phone && user.phone.replace(/\D/g, '').slice(-10)) ||
      '';

    if (rawPhone && rawPhone.length === 10) {
      try {
        localStorage.setItem('bpg_checkout_phone', rawPhone);
      } catch {}

      if (cart.length > 0) {
        fetch('/api/cart/abandon', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}),
          },
          body: JSON.stringify({
            phone: rawPhone,
            name: selectedAddress?.name || newAddr.name || user?.name || 'Student',
            cart: cart.map((c) => ({ id: c.id, title: c.title, qty: c.qty, price: c.price })),
            cleared: false,
          }),
        }).catch(() => {});
      }
    }
  }, [
    user?.phone,
    user?.token,
    user?.name,
    selectedAddress?.phone,
    selectedAddress?.name,
    newAddr.phone,
    newAddr.name,
    cart,
  ]);

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
    const alt = normalizeRequiredAlternateMobile(newAddr.alternatePhone, newAddr.phone || user.phone || '');
    if (!alt.ok) {
      showToast(alt.error);
      return false;
    }
    const pinCheck = pincodeDeliveryMessage(String(newAddr.pincode));
    if (!pinCheck.ok) {
      showToast(pinCheck.message);
      return false;
    }
    setSavingAddress(true);
    try {
      const result = await createUserAddress(user, {
        type: newAddr.type,
        name: newAddr.name,
        phone: newAddr.phone,
        alternatePhone: alt.value,
        address: newAddr.address,
        landmark: newAddr.landmark,
        city: newAddr.city || 'Chennai',
        pincode: String(newAddr.pincode),
        isDefault: true,
      });
      if (result.ok) {
        setSavedAddresses((prev) => [result.address, ...prev.map((a) => ({ ...a, isDefault: false }))]);
        setSelectedAddrId(result.address.id);
        setEditDraft(null);
        showToast('Address saved');
        return true;
      }
      showToast(result.error);
      return false;
    } finally {
      setSavingAddress(false);
    }
  };

  const handleUpdateSavedAddress = async () => {
    if (!user?.id || !editDraft?.id) return false;
    if (!editDraft.name || !editDraft.address || !editDraft.pincode) {
      showToast('Fill name, address and pincode');
      return false;
    }
    if (!isValidMobileNumber(editDraft.phone || user.phone || '')) {
      showToast('Enter a valid 10-digit primary mobile number');
      return false;
    }
    const alt = normalizeRequiredAlternateMobile(editDraft.alternatePhone || '', editDraft.phone || user.phone || '');
    if (!alt.ok) {
      showToast(alt.error);
      return false;
    }
    const pinCheck = pincodeDeliveryMessage(String(editDraft.pincode));
    if (!pinCheck.ok) {
      showToast(pinCheck.message);
      return false;
    }
    setSavingAddress(true);
    try {
      const result = await updateUserAddress(user, editDraft.id, {
        type: editDraft.type,
        name: editDraft.name,
        phone: editDraft.phone,
        alternatePhone: alt.value,
        address: editDraft.address,
        landmark: editDraft.landmark,
        city: editDraft.city || 'Chennai',
        pincode: String(editDraft.pincode),
      });
      if (result.ok) {
        setSavedAddresses((prev) => prev.map((a) => (a.id === result.address.id ? result.address : a)));
        setSelectedAddrId(result.address.id);
        setEditDraft(null);
        showToast('Address updated');
        return true;
      }
      showToast(result.error);
      return false;
    } finally {
      setSavingAddress(false);
    }
  };

  const goToReview = async () => {
    if (!isMoqSatisfied(cart)) {
      showToast(`Minimum order quantity is ${MIN_BOOKS_PER_ORDER} book(s) (or 1 Combo Pack).`);
      return;
    }
    if (selectedAddrId === 'new' || savedAddresses.length === 0) {
      const ok = await handleSaveInlineAddress();
      if (!ok) return;
    } else {
      const chosen = savedAddresses.find((a) => a.id === selectedAddrId);
      if (!chosen?.address) {
        showToast('Select a delivery address to continue.');
        return;
      }
      const pinCheck = pincodeDeliveryMessage(String(chosen.pincode || ''));
      if (!pinCheck.ok) {
        showToast(pinCheck.message);
        setEditDraft({ ...chosen });
        return;
      }
      if (!addressHasRequiredAlternate(chosen)) {
        showToast('Add a different 10-digit alternate mobile on this address before paying.');
        setEditDraft({ ...chosen });
        return;
      }
    }
    setStep(2);
  };

  const handlePlaceOrder = async () => {
    if (IS_CHECKOUT_PAUSED) {
      showToast(CHECKOUT_PAUSE_MESSAGE);
      return;
    }
    if (orderSubmitLock.current || isPlacingOrder || !user) return;
    if (!isMoqSatisfied(cart)) {
      showToast(`Minimum order quantity is ${MIN_BOOKS_PER_ORDER} book(s) (or 1 Combo Pack).`);
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

    if (!selectedAddress?.address) {
      showToast('Select a delivery address before paying.');
      setStep(1);
      release();
      return;
    }
    if (!addressHasRequiredAlternate(selectedAddress)) {
      showToast('Add a valid alternate mobile number on the delivery address.');
      if ('id' in selectedAddress && selectedAddress.id) {
        setEditDraft({ ...selectedAddress });
      }
      setStep(1);
      release();
      return;
    }

    if (finalPayable < 1) {
      showToast('⚠️ Razorpay minimum transaction amount is ₹1.00 (cannot process amounts below ₹1).');
      release();
      return;
    }

    try {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = `bpg-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      }
      const baseAmount = checkoutTotal > 0 ? checkoutTotal : cartGrandTotal > 0 ? cartGrandTotal : cartTotal;
      const finalAmount = Math.max(1, baseAmount - effectiveDiscount);

      const processOrderCompletion = async (payId?: string, rzpOrderId?: string, rzpSignature?: string) => {
        let serverOrderId: string | null = null;
        let confirmedTotal = finalAmount;
        let orderStatus = 'Confirmed';
        let paymentStatus = 'Payment Confirmed';

        // 1. First attempt: Server-authoritative checkout status / signature verification
        try {
          const statusRes = await fetch('/api/checkout/status', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(user.token ? { Authorization: `Bearer ${user.token}` } : {}),
            },
            body: JSON.stringify({
              razorpayOrderId: rzpOrderId,
              razorpayPaymentId: payId,
              razorpaySignature: rzpSignature,
            }),
          });
          const statusData = await statusRes.json();
          if (statusRes.ok && statusData.orderId) {
            serverOrderId = statusData.orderId;
            confirmedTotal = Number(statusData.totalAmount || finalAmount);
          }
        } catch (_) {}

        // 2. Second attempt: If status wasn't immediately ready, poll status endpoint for up to 5 seconds
        if (!serverOrderId && rzpOrderId) {
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise((r) => setTimeout(r, 1000));
            try {
              const pollRes = await fetch(`/api/checkout/status?orderId=${encodeURIComponent(rzpOrderId)}`, {
                headers: user.token ? { Authorization: `Bearer ${user.token}` } : {},
              });
              const pollData = await pollRes.json();
              if (pollData.status === 'ORDER_CONFIRMED' && pollData.orderId) {
                serverOrderId = pollData.orderId;
                confirmedTotal = Number(pollData.totalAmount || finalAmount);
                break;
              }
            } catch (_) {}
          }
        }

        // 3. Fallback: call /api/orders if status endpoint did not finalize
        if (!serverOrderId) {
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
              alternatePhone: selectedAddress.alternatePhone || '',
              address: selectedAddress.address,
              city: selectedAddress.city || 'Chennai',
              pincode: selectedAddress.pincode || '600012',
              items: cart.map((i) => ({ id: i.id, qty: i.qty, price: i.price })),
              paymentMethod: 'Razorpay UPI / Online',
              razorpayPaymentId: payId || null,
              razorpayOrderId: rzpOrderId || null,
              razorpaySignature: rzpSignature || null,
              idempotencyKey: idempotencyKeyRef.current,
              couponCode: appliedCoupon?.code || null,
            }),
          });
          const orderData = await orderRes.json();
          if (orderRes.ok && orderData.orderId) {
            serverOrderId = orderData.orderId;
            confirmedTotal = Number(orderData.totalAmount ?? finalAmount);
            orderStatus = orderData.status || 'Confirmed';
            paymentStatus = orderData.paymentStatus || 'Payment Confirmed';
          } else if (!orderRes.ok) {
            showToast(`❌ ${orderData.error || 'Order failed'}`);
            pendingRazorpayOrderIdRef.current = null;
            return false;
          }
        }

        if (!serverOrderId) {
          showToast('❌ Order verification in progress. Please check your orders page.');
          pendingRazorpayOrderIdRef.current = null;
          router.push('/orders');
          return true;
        }

        pendingRazorpayOrderIdRef.current = null;
        try {
          sessionStorage.removeItem('bpg_pending_rzp_order');
        } catch {}
        clearCartAfterOrder();
        try {
          localStorage.removeItem('bpg_checkout_phone');
          localStorage.removeItem('bpg_checkout_addr_draft');
        } catch {}
        idempotencyKeyRef.current = null;

        setOrderSuccessData({
          orderId: serverOrderId,
          totalAmount: confirmedTotal,
          customerName: selectedAddress.name || user.name || 'Customer',
          address: selectedAddress.address,
          city: selectedAddress.city || 'Chennai',
          phone: selectedAddress.phone || user.phone || '',
          paymentMethod: 'Razorpay UPI / Online',
          paymentStatus: paymentStatus,
          status: orderStatus,
          items: cart.map((i) => ({
            title: i.title,
            qty: i.qty,
            price: i.price,
          })),
        });

        showToast(`🎉 Order #${serverOrderId} confirmed!`);
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
          address: selectedAddress,
          couponCode: appliedCoupon?.code || null,
          receipt: `rcpt-${Date.now()}`,
        }),
      });

      const rzpData = await res.json();
      if (!res.ok) {
        showToast(`❌ ${rzpData.error || 'Payment initialization failed'}`);
        release();
        return;
      }

      try {
        sessionStorage.setItem('bpg_pending_rzp_order', rzpData.orderId);
      } catch {}

      if (typeof rzpData.discountAmount === 'number' && appliedCoupon) {
        setAppliedCoupon((prev) =>
          prev
            ? {
                ...prev,
                discountAmount: rzpData.discountAmount,
                message: `✓ Coupon applied: save ₹${rzpData.discountAmount}`,
              }
            : prev
        );
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
    <main className="min-h-screen bg-slate-50 flex flex-col pb-24 sm:pb-0">
      <AnnouncementBar />
      <Header />

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-5 sm:py-8 w-full flex-1">
        {/* Step Indicator */}
        <div className="flex items-center justify-between max-w-md mx-auto mb-6 sm:mb-8 text-[11px] sm:text-xs font-bold px-1 sm:px-0">
          <div className={`flex items-center gap-1 sm:gap-1.5 ${step >= 1 ? 'text-[#0044AA]' : 'text-slate-400'}`}>
            <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-current text-white flex items-center justify-center text-[10px] shrink-0 font-black">
              1
            </span>
            <span>Address</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-300 shrink-0" />
          <div className={`flex items-center gap-1 sm:gap-1.5 ${step >= 2 ? 'text-[#0044AA]' : 'text-slate-400'}`}>
            <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-current text-white flex items-center justify-center text-[10px] shrink-0 font-black">
              2
            </span>
            <span>Summary</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-300 shrink-0" />
          <div className={`flex items-center gap-1 sm:gap-1.5 ${step >= 3 ? 'text-[#0044AA]' : 'text-slate-400'}`}>
            <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-current text-white flex items-center justify-center text-[10px] shrink-0 font-black">
              3
            </span>
            <span>Confirm</span>
          </div>
        </div>

        {/* Minimum Books Alert Banner */}
        {!isMoqSatisfied(cart) && (
          <div className="max-w-2xl mx-auto mb-6 p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 text-amber-900 text-xs font-medium shadow-sm">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-extrabold text-sm mb-0.5">Minimum Order Quantity: {MIN_BOOKS_PER_ORDER} Book(s)</p>
              <p>
                You currently have <strong>{cartCount} book(s)</strong> in your cart. Please add{' '}
                <strong>{MIN_BOOKS_PER_ORDER - cartCount} more guide(s)</strong> (or 1 Combo Pack) to complete your order.
              </p>
              <Link href="/search" className="inline-block mt-2 font-bold text-[#0044AA] hover:underline cursor-pointer">
                + Browse Guides & Add to Cart →
              </Link>
            </div>
          </div>
        )}

        {IS_CHECKOUT_PAUSED && (
          <div className="max-w-2xl mx-auto mb-5 p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 text-amber-950 flex items-start gap-3 shadow-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-heading font-black text-sm text-amber-950">Online Checkout Temporarily Paused</p>
              <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                We have temporarily paused online order processing. If you wish to place an order or have questions about books, please contact us directly on WhatsApp at{' '}
                <a
                  href="https://wa.me/919486017820"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-black text-emerald-700 underline"
                >
                  +91-9486017820
                </a>.
              </p>
            </div>
          </div>
        )}

        <div className="max-w-2xl mx-auto bg-white rounded-3xl p-4 sm:p-6 md:p-8 border border-slate-200 shadow-xl">
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
                        onChange={() => {
                          setSelectedAddrId(a.id);
                          setEditDraft(addressHasRequiredAlternate(a) ? null : { ...a });
                        }}
                        className="sr-only"
                      />
                      <span className="font-bold text-slate-900">{a.name}</span> · {a.phone}
                      {a.alternatePhone ? (
                        <span className="text-slate-500"> · alt {a.alternatePhone}</span>
                      ) : (
                        <span className="text-amber-700 font-bold"> · add alternate number</span>
                      )}
                      <p className="text-slate-600 text-[11px] mt-0.5">
                        {a.address}, {a.city} — {a.pincode}
                      </p>
                      {selectedAddrId === a.id ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setEditDraft({ ...a });
                          }}
                          className="mt-1.5 text-[11px] font-extrabold text-blue-700 hover:underline"
                        >
                          Edit this address
                        </button>
                      ) : null}
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
                      onChange={() => {
                        setSelectedAddrId('new');
                        setEditDraft(null);
                      }}
                      className="sr-only"
                    />
                    <span className="font-bold text-blue-600 flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Add a new address
                    </span>
                  </label>
                </div>
              )}

              {editDraft && selectedAddrId !== 'new' && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <p className="font-extrabold text-slate-800">Update this address</p>
                  <p className="text-[11px] text-amber-800">
                    ST Courier needs a second mobile that is different from the primary number.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Mobile Phone *</label>
                      <input
                        maxLength={10}
                        value={editDraft.phone}
                        onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value.replace(/\D/g, '') })}
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-700 mb-1">Alternate Mobile *</label>
                      <input
                        maxLength={10}
                        value={editDraft.alternatePhone || ''}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, alternatePhone: e.target.value.replace(/\D/g, '') })
                        }
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                        placeholder="Different 10-digit number for ST Courier"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Address *</label>
                    <input
                      value={editDraft.address}
                      onChange={(e) => setEditDraft({ ...editDraft, address: e.target.value })}
                      className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">City / District *</label>
                      <input
                        value={editDraft.city}
                        onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })}
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Pincode *</label>
                      <input
                        maxLength={6}
                        value={editDraft.pincode}
                        onChange={(e) =>
                          setEditDraft({ ...editDraft, pincode: e.target.value.replace(/\D/g, '') })
                        }
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingAddress}
                    onClick={() => void handleUpdateSavedAddress()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold min-h-12 py-3 rounded-lg disabled:opacity-60 transition-all touch-manipulation"
                  >
                    {savingAddress ? 'Saving…' : 'Save address changes'}
                  </button>
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
                    <div className="sm:col-span-2">
                      <label className="block font-bold text-slate-700 mb-1">Alternate Mobile *</label>
                      <input
                        maxLength={10}
                        value={newAddr.alternatePhone}
                        onChange={(e) => setNewAddr({ ...newAddr, alternatePhone: e.target.value.replace(/\D/g, '') })}
                        className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                        placeholder="Different 10-digit number for ST Courier"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Required. Courier calls this if the first number does not answer. Must be a different mobile.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Address *</label>
                    <input
                      value={newAddr.address}
                      onChange={(e) => setNewAddr({ ...newAddr, address: e.target.value })}
                      className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                      placeholder="Door no., Street name, Area"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Near Landmark <span className="font-normal text-slate-400">(optional)</span></label>
                    <input
                      value={newAddr.landmark}
                      onChange={(e) => setNewAddr({ ...newAddr, landmark: e.target.value })}
                      className="w-full px-3 py-3 min-h-12 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-sm"
                      placeholder="e.g. Near SBI Bank, Opposite Bus Stop"
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
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold min-h-12 py-3 rounded-lg disabled:opacity-60 transition-all touch-manipulation"
                  >
                    {savingAddress ? 'Saving Address…' : 'Save Address'}
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={!isMoqSatisfied(cart)}
                onClick={() => void goToReview()}
                className="hidden sm:flex w-full items-center justify-center bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-sm py-3.5 rounded-xl uppercase tracking-wider disabled:opacity-50 transition-all min-h-12 touch-manipulation"
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
                    {selectedAddress?.alternatePhone ? ` · alt ${selectedAddress.alternatePhone}` : ''}
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
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-slate-900 truncate">{item.title}</p>
                          {item.selectedMedium && (
                            <span className={`inline-block text-[9px] font-black px-1.5 py-0.2 rounded shrink-0 ${
                              item.selectedMedium.toLowerCase().includes('tamil')
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                            }`}>
                              {item.selectedMedium}
                            </span>
                          )}
                        </div>
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
                {shippingFee === 0 ? (
                  <p className="font-bold flex items-center gap-1 text-emerald-700">
                    <Check className="w-4 h-4 text-emerald-600" /> 🎉 FREE Doorstep Delivery Unlocked! {cartHasCombo(cart) ? '(Combo Pack Offer)' : `(${cartCount} books)`}
                  </p>
                ) : (
                  <p className="font-medium">
                    📦 Delivery Charge: <strong>₹150</strong> ({cartCount} books). Add{' '}
                    <strong>{5 - cartCount} more guide(s)</strong> (or 1 Combo Pack) for <strong>FREE Delivery</strong>!
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
                disabled={!isMoqSatisfied(cart) || hasBlockingItem}
                onClick={async () => {
                  const clean = await validateCartStock();
                  if (!clean) return;
                  setStep(3);
                }}
                className="hidden sm:flex w-full items-center justify-center bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-sm py-3.5 rounded-xl uppercase tracking-wider disabled:opacity-50 transition-all min-h-12"
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
                  {selectedAddress?.alternatePhone ? ` · alt ${selectedAddress.alternatePhone}` : ''}
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

              {/* Coupon Code Section */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-slate-800">
                    <Tag className="w-4 h-4 text-blue-600" />
                    <span>Have a Promo / Coupon Code?</span>
                  </div>
                  {appliedCoupon && (
                    <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300">
                      APPLIED
                    </span>
                  )}
                </div>

                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-emerald-900">{appliedCoupon.code}</span>
                          <button
                            type="button"
                            onClick={() => setShowCouponsModal(true)}
                            className="text-[10px] font-bold text-blue-700 hover:underline cursor-pointer"
                          >
                            Change offer
                          </button>
                        </div>
                        <p className="text-[10px] text-emerald-700 font-semibold">{appliedCoupon.message}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      className="text-xs font-bold text-red-600 hover:text-red-800 p-1 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                        placeholder="Enter promo code from the shop offer"
                        className="flex-1 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase tracking-wider outline-none focus:border-blue-600 shadow-2xs"
                      />
                      <button
                        type="button"
                        disabled={couponLoading || !couponInput.trim()}
                        onClick={() => void handleApplyCoupon()}
                        className="px-4 py-2.5 bg-[#001B3A] hover:bg-blue-600 disabled:opacity-50 text-white font-extrabold text-xs rounded-xl uppercase tracking-wider transition-colors cursor-pointer shrink-0 min-h-10"
                      >
                        {couponLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Apply'
                        )}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-[11px] text-red-600 font-semibold">{couponError}</p>
                    )}
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      {eligibleOffers.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => void handleApplyCoupon(eligibleOffers[0].code)}
                          className="font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
                        >
                          <span>⚡ Quick Apply:</span>
                          <span className="font-mono font-black underline">{eligibleOffers[0].code}</span>
                          <span>(-₹{eligibleOffers[0].discountValue})</span>
                        </button>
                      ) : (
                        <span />
                      )}
                      <button
                        type="button"
                        onClick={() => setShowCouponsModal(true)}
                        className="font-bold text-blue-700 hover:text-blue-800 hover:underline cursor-pointer flex items-center gap-0.5"
                      >
                        <span>All coupons</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Animated One-Click Coupon Apply Chip right above the subtotal */}
              {!appliedCoupon && eligibleOffers.length > 0 && (
                <div className="relative overflow-hidden rounded-2xl p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-2 border-emerald-400 shadow-md">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-bounce">
                        <Tag className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-black uppercase text-emerald-950 tracking-wider">
                            Available for this order:
                          </span>
                          <span className="font-mono font-black text-xs px-2 py-0.5 rounded-md bg-emerald-700 text-white shadow-xs tracking-wider">
                            {eligibleOffers[0].code}
                          </span>
                        </div>
                        <p className="text-[11px] font-extrabold text-emerald-800 truncate mt-0.5">
                          Save ₹{eligibleOffers[0].discountType === 'flat' ? eligibleOffers[0].discountValue : `${eligibleOffers[0].discountValue}%`} instantly — click to claim
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={couponLoading}
                      onClick={() => void handleApplyCoupon(eligibleOffers[0].code)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md transition-all hover:scale-105 shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {couponLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <span>APPLY</span>
                          <span className="text-amber-300">⚡</span>
                        </>
                      )}
                    </button>
                  </div>
                  {eligibleOffers.length > 1 && (
                    <div className="mt-2.5 pt-2 border-t border-emerald-200/70 flex items-center justify-between gap-1.5 flex-wrap text-[10px]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-slate-600 font-extrabold">Other offers:</span>
                        {eligibleOffers.slice(1, 3).map((c) => (
                          <button
                            key={c.code}
                            type="button"
                            onClick={() => void handleApplyCoupon(c.code)}
                            className="font-mono font-black text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded-md hover:bg-blue-50 cursor-pointer shadow-2xs"
                          >
                            {c.code} (-₹{c.discountValue})
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCouponsModal(true)}
                        className="font-bold text-emerald-800 hover:underline cursor-pointer flex items-center gap-0.5 ml-auto"
                      >
                        <span>View all offers</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal ({hasComboInCart ? (cartCount === 1 ? '1 combo set' : `${cartCount} items`) : `${cartCount} guides`})</span>
                  <span>₹{cartTotal}</span>
                </div>
                {appliedCoupon && (
                  <div className="flex justify-between text-emerald-700 font-bold text-xs">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      Coupon Discount ({appliedCoupon.code})
                    </span>
                    <span>-₹{effectiveDiscount}</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-600">
                  <span>Delivery Charge</span>
                  <span className={shippingFee === 0 ? 'text-emerald-600 font-bold' : ''}>
                    {shippingFee === 0 ? 'FREE' : `₹${shippingFee}`}
                  </span>
                </div>
                <div className="flex justify-between font-black text-lg text-[#001B3A] pt-2 border-t border-slate-200">
                  <span>Total Amount</span>
                  <span>₹{finalPayable}</span>
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
                disabled={IS_CHECKOUT_PAUSED || isPlacingOrder || cart.length === 0 || !isMoqSatisfied(cart) || hasBlockingItem}
                onClick={() => void handlePlaceOrder()}
                className="hidden sm:flex w-full items-center justify-center bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-700 text-[#001B3A] font-black text-sm py-4 rounded-xl uppercase tracking-wider shadow-lg shadow-amber-500/20 disabled:opacity-60 transition-all hover:scale-[1.01] min-h-12 touch-manipulation"
              >
                {IS_CHECKOUT_PAUSED
                  ? 'Online Checkout Paused'
                  : isPlacingOrder
                  ? 'Opening Razorpay…'
                  : `Confirm order · Pay ₹${finalPayable}`}
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

      {/* Mobile sticky primary CTA — anchored to screen bottom */}
      <div className="fixed inset-x-0 bottom-0 z-40 sm:hidden border-t border-slate-200 bg-white/95 backdrop-blur-md p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl">
        {step === 1 && (
          <button
            type="button"
            disabled={!isMoqSatisfied(cart)}
            onClick={() => void goToReview()}
            className="w-full bg-gradient-to-r from-amber-400 to-amber-500 disabled:opacity-50 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider min-h-12 touch-manipulation"
          >
            Deliver Here →
          </button>
        )}

        {step === 2 && (
          <button
            type="button"
            disabled={!isMoqSatisfied(cart) || hasBlockingItem}
            onClick={async () => {
              const clean = await validateCartStock();
              if (!clean) return;
              setStep(3);
            }}
            className="w-full bg-gradient-to-r from-amber-400 to-amber-500 disabled:opacity-50 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider min-h-12 touch-manipulation"
          >
            Review & Confirm →
          </button>
        )}

        {step === 3 && (
          <div className="flex items-center gap-3 max-w-7xl mx-auto">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-500 uppercase">Pay</p>
              <p className="font-black text-lg text-[#001B3A] leading-none">₹{finalPayable}</p>
            </div>
            <button
              type="button"
              disabled={IS_CHECKOUT_PAUSED || isPlacingOrder || cart.length === 0 || !isMoqSatisfied(cart) || hasBlockingItem}
              onClick={() => void handlePlaceOrder()}
              className="flex-1 bg-gradient-to-r from-amber-400 to-amber-500 disabled:opacity-50 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider min-h-12 touch-manipulation"
            >
              {IS_CHECKOUT_PAUSED ? 'Checkout Paused' : isPlacingOrder ? 'Opening Razorpay…' : 'Confirm order'}
            </button>
          </div>
        )}
      </div>

      <SwiggyCouponsModal
        isOpen={showCouponsModal}
        onClose={() => setShowCouponsModal(false)}
        availableCoupons={availableOffers}
        appliedCoupon={appliedCoupon}
        cartTotal={cartTotal}
        cartCount={cartCount}
        effectiveCartCount={effectiveCartCount}
        hasCombo={hasComboInCart}
        onApplyCoupon={async (code: string) => {
          return await handleApplyCoupon(code);
        }}
        onRemoveCoupon={handleRemoveCoupon}
        isApplying={couponLoading}
      />
    </main>
  );
}
