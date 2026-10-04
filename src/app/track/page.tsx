'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Truck,
  Search,
  CheckCircle2,
  X,
  ChevronRight,
  ShoppingBag,
  Headphones,
  MessageSquare,
  HelpCircle,
  ReceiptText,
  FileText,
  ArrowDownToLine,
  Tag,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { ShipmentTrackingCard } from '@/components/orders/ShipmentTrackingCard';
import { useStore } from '@/context/StoreContext';
import { isParcelDelivered, isDeliveryAttempted, customerCourierHeadline } from '@/lib/orderStatus';
import { authHeaders } from '@/lib/clientAuth';
import { useOrderLiveSync } from '@/hooks/useOrderLiveSync';

function TrackForm() {
  const searchParams = useSearchParams();
  const { user } = useStore();

  const [orderId, setOrderId] = useState(searchParams.get('orderId') || searchParams.get('order') || '');
  const [phone, setPhone] = useState(searchParams.get('phone') || user?.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);

  const [trackToken, setTrackToken] = useState(searchParams.get('t') || searchParams.get('token') || '');

  // User Orders list for logged in state
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [loadingUserOrders, setLoadingUserOrders] = useState(false);

  useEffect(() => {
    if (user?.id) {
      setLoadingUserOrders(true);
      fetch('/api/orders', {
        headers: authHeaders(user),
        credentials: 'include',
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (Array.isArray(data)) setUserOrders(data);
        })
        .catch(() => {})
        .finally(() => setLoadingUserOrders(false));
    }
  }, [user]);

  const runTrack = async (oid?: string, ph?: string, opts?: { soft?: boolean; token?: string }) => {
    const rawTarget = oid ?? orderId;
    const id = String(rawTarget || '').trim().replace(/^#+/, '').replace(/\s+/g, '-');
    const mobile = (ph ?? phone ?? user?.phone ?? '').trim();
    const token = (opts?.token ?? trackToken).trim();
    setError(null);
    if (!id) return;
    if (!opts?.soft) {
      setLoading(true);
      setOrder(null);
    }
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id, phone: mobile, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (!opts?.soft) {
          setError(data.error || 'Could not track order. Please verify Order ID.');
        }
        return;
      }
      setOrder(data.order);
    } catch {
      if (!opts?.soft) setError('Network error. Please try again.');
    } finally {
      if (!opts?.soft) setLoading(false);
    }
  };

  useEffect(() => {
    const rawOid = searchParams.get('orderId') || searchParams.get('order');
    const cleanOid = rawOid ? rawOid.trim().replace(/^#+/, '').replace(/\s+/g, '-') : '';
    const ph = searchParams.get('phone') || user?.phone || '';
    const t = searchParams.get('t') || searchParams.get('token') || '';
    if (cleanOid) setOrderId(cleanOid);
    if (ph) setPhone(ph);
    if (t) setTrackToken(t);
    if (cleanOid) {
      void runTrack(cleanOid, ph, { token: t });
    }
  }, [searchParams, user]);

  // Auto-refresh while Track page is open — stop after delivered / cancelled
  useEffect(() => {
    if (!order?.orderId) return;
    if (order.cancelled) return;
    const st = String(order.status || '').toLowerCase();
    if (isParcelDelivered(st) || st.includes('rto')) return;
    const mobile = phone || user?.phone || '';
    if (!mobile && !trackToken) return;
    const t = window.setInterval(() => {
      void runTrack(order.orderId, mobile, { soft: true, token: trackToken });
    }, 45_000);
    return () => clearInterval(t);
     
  }, [order?.orderId, order?.cancelled, order?.status, phone, user?.phone, trackToken]);

  // Instant soft re-track when admin updates this order
  useOrderLiveSync(Boolean(user?.id && orderId.trim()), (evt) => {
    const oid = orderId.trim();
    if (!oid) return;
    if (evt.orderId && String(evt.orderId) !== oid) return;
    const mobile = (phone || user?.phone || '').trim();
    if (!mobile && !trackToken) return;
    void runTrack(oid, mobile, { soft: true, token: trackToken });
  });

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <div className="text-center space-y-2">
        <BrandLogo size={56} className="w-14 h-14 mx-auto mb-1" />
        <div className="inline-flex items-center gap-2 text-amber-700 text-xs font-bold uppercase tracking-wider">
          <Truck className="w-4 h-4" />
          Shipment tracking powered by ST Courier
        </div>
        <h1 className="font-heading font-black text-2xl md:text-3xl text-[#001B3A]">Track Your Order</h1>
        <p className="text-sm text-slate-500">
          {user
            ? `Welcome back, ${user.name}! Select an order below or enter Order ID — status comes from ST Courier hub scans.`
            : 'No login needed — enter Order ID + the 10-digit mobile used at checkout.'}
        </p>
      </div>

      {/* Logged-In User Seamless Order History Selector */}
      {user && userOrders.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-[#0044AA]" />
            <span>Your Recent Orders ({userOrders.length})</span>
          </h2>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {userOrders.map((o) => (
              <button
                key={o.id || o.orderId}
                type="button"
                onClick={() => {
                  setOrderId(o.orderId);
                  setPhone(o.customerPhone || user.phone || '');
                  void runTrack(o.orderId, o.customerPhone || user.phone || '');
                }}
                className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-[#0044AA] hover:bg-blue-50/50 transition-all flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[#001B3A]">#{o.orderId}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      ₹{o.totalAmount}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {o.createdAt} · {o.courierStatus || o.orderStatus}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-[#0044AA] group-hover:translate-x-1 transition-transform">
                  <span>Track</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Live Loading State when opening from direct tracking link */}
      {loading && (
        <div className="bg-white border border-blue-100 rounded-2xl p-8 shadow-sm flex flex-col items-center justify-center text-center space-y-3 animate-pulse">
          <div className="w-10 h-10 border-4 border-[#001B3A] border-t-blue-500 rounded-full animate-spin" />
          <p className="font-heading font-black text-base text-[#001B3A]">
            Locating Shipment {orderId ? `#${orderId}` : ''}…
          </p>
          <p className="text-xs text-slate-500">
            Checking live parcel scans from ST Courier Express hub network
          </p>
        </div>
      )}

      {/* Track Form for Guests or Manual Search (displayed if no order is currently active) */}
      {(!order || !order.orderId) && !loading && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runTrack();
          }}
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3"
        >
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase">Order ID</label>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value.toUpperCase())}
              placeholder="e.g. BPG-1048"
              className="mt-1 w-full px-3 py-3 border border-slate-300 rounded-xl text-sm font-bold outline-none focus:border-blue-600 min-h-12 uppercase"
              required
            />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase flex items-center justify-between">
              <span>Mobile Number</span>
              <span className="text-slate-400 font-normal lowercase text-[10px]">(optional)</span>
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile number (optional)"
              inputMode="tel"
              className="mt-1 w-full px-3 py-3 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-600 min-h-12"
            />
          </div>
          {error && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#001B3A] hover:bg-blue-700 text-white font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider min-h-12 flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer shadow-md transition-all"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Checking ST Courier…' : 'Track shipment'}
          </button>
        </form>
      )}

      {/* Flipkart-style live ST result - Displayed Immediately */}
      {order && !loading && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Tracking Order</p>
              <p className="font-heading font-black text-xl text-[#001B3A]">#{order.orderId}</p>
              <p className="text-xs text-slate-500 mt-1">
                {order.customer?.name}
                {order.customer?.phone ? ` · ${order.customer.phone}` : ''}
                {order.customer?.city ? ` · ${order.customer.city}` : ''}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border ${
                order.cancelled
                  ? 'bg-red-50 text-red-800 border-red-200'
                  : isParcelDelivered(order.status)
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : isDeliveryAttempted(order.status)
                      ? 'bg-amber-50 text-amber-900 border-amber-200'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}
            >
              {order.cancelled ? (
                <>
                  <X className="w-3.5 h-3.5" /> Cancelled
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {order.statusHeadline || customerCourierHeadline(order.status)}
                </>
              )}
            </span>
          </div>

          {!order.cancelled && order.steps?.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm overflow-x-auto scroll-chips">
              <div className="flex items-start min-w-[480px] gap-0">
                {order.steps.map((step: any, i: number) => (
                  <div key={step.key} className="flex-1 flex flex-col items-center relative">
                    {i > 0 && (
                      <div
                        className={`absolute top-3 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                          step.done ? 'bg-emerald-500' : 'bg-slate-200'
                        }`}
                      />
                    )}
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold z-10 ${
                        step.done
                          ? 'bg-emerald-500 text-white ring-4 ring-emerald-100'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {step.done ? '✓' : i + 1}
                    </div>
                    <p
                      className={`text-[11px] font-bold mt-2 text-center ${
                        step.done ? 'text-slate-900' : 'text-slate-400'
                      }`}
                    >
                      {step.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ShipmentTrackingCard
            orderId={order.orderId}
            status={order.status}
            cancelled={!!order.cancelled}
            awb={order.trackingNumber || order.awb}
            trackingUrl={order.trackingUrl}
            courierName={order.courierName}
            destinationCity={order.customer?.city}
            destinationPincode={order.customer?.pincode}
            scans={order.scans}
            liveSynced={!!order.liveSynced || !!order.autoUpdated}
            stRawStatus={order.stRawStatus}
            statusHeadline={order.statusHeadline}
            estimatedArrival={order.estimatedArrival}
            estimatedArrivalHint={order.estimatedArrivalHint}
            lastUpdatedAt={order.lastUpdatedAt}
            refreshing={loading}
            onRefresh={() => void runTrack(order.orderId, phone || user?.phone || '', { soft: true })}
          />

          {/* ── Flipkart/Amazon-Style Product, MRP & Bill Details Card ──────────── */}
          {((Array.isArray(order.items) && order.items.length > 0) || order.bill) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#0044AA] flex items-center justify-center font-bold">
                    <ReceiptText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-heading font-black text-sm text-[#001B3A]">
                      Order Bill & Product Details
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      HSN 4901 · Official Tax Invoice for Educational Guides
                    </p>
                  </div>
                </div>

                {order.invoiceUrl && (
                  <a
                    href={order.invoiceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#0044AA] text-xs font-bold rounded-xl transition-colors border border-blue-200 shadow-2xs"
                  >
                    <ArrowDownToLine className="w-3.5 h-3.5" />
                    <span>Download Tax Bill / Invoice</span>
                  </a>
                )}
              </div>

              {/* Items with MRP & Discount Breakdown */}
              {Array.isArray(order.items) && order.items.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                    Books in this Package ({order.items.reduce((s: number, it: any) => s + (it.qty || 1), 0)} items)
                  </p>
                  <div className="divide-y divide-slate-100">
                    {order.items.map((it: any, idx: number) => {
                      const qty = Number(it.qty || 1);
                      const price = Number(it.price || 0);
                      const mrp = Number(it.mrp || price || 0);
                      const subtotal = Number(it.subtotal || price * qty);
                      const hasDiscount = mrp > price && price > 0;

                      return (
                        <div key={idx} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                              {it.title}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {it.medium && (
                                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                                  {it.medium}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-500 font-semibold">
                                Qty: {qty}
                              </span>
                              {hasDiscount && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                  <Tag className="w-2.5 h-2.5" /> Save ₹{mrp - price}/book
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="font-black text-slate-900 text-xs sm:text-sm">
                              {price > 0 ? `₹${(subtotal || price * qty).toLocaleString('en-IN')}` : 'Included'}
                            </div>
                            {hasDiscount && (
                              <div className="text-[11px] text-slate-400 line-through">
                                MRP ₹{(mrp * qty).toLocaleString('en-IN')}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Complete Bill Summary */}
              {order.bill && (
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600 font-medium">
                    <span>Subtotal / Books MRP:</span>
                    <span className="font-bold text-slate-800">
                      ₹{Number(order.bill.subtotal || order.bill.totalAmount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  {Number(order.bill.discount || 0) > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Discount / Coupon Applied:</span>
                      <span>-₹{Number(order.bill.discount).toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-slate-600 font-medium">
                    <span>ST Courier Delivery:</span>
                    <span className="font-bold text-emerald-700">
                      {Number(order.bill.shippingCharge || 0) === 0 ? 'FREE' : `₹${Number(order.bill.shippingCharge)}`}
                    </span>
                  </div>

                  <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-sm font-black text-[#001B3A]">
                    <span>Total Amount Paid:</span>
                    <span className="text-base text-[#0044AA]">
                      ₹{Number(order.bill.totalAmount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                    <span>Payment Mode: <strong>{order.bill.paymentMethod || 'Online (Razorpay)'}</strong></span>
                    <span className="font-bold text-emerald-700">✓ {order.bill.paymentStatus || 'Payment Verified'}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Flipkart-Style Need Help with this Order? Card ──────────── */}
          <div className="bg-gradient-to-r from-blue-50/70 via-white to-indigo-50/70 border border-blue-200 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-[#001B3A] text-white flex items-center justify-center shrink-0 shadow-xs">
                <Headphones className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <h4 className="font-black text-sm text-[#001B3A]">
                  Need Help with Order #{order.orderId}?
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chat directly with our 24/7 AI Assistant or human support team for delivery assistance, address updates, or replacement.
                </p>
              </div>
            </div>
            <Link
              href={`/help?orderId=${encodeURIComponent(order.orderId)}&phone=${encodeURIComponent(phone || user?.phone || '')}`}
              className="w-full sm:w-auto px-5 py-3 bg-[#2874f0] hover:bg-blue-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chat with Support</span>
            </Link>
          </div>

          {/* Quick link to search another order */}
          <div className="text-center pt-1 pb-2">
            <button
              type="button"
              onClick={() => {
                setOrder(null);
                setOrderId('');
                setError(null);
              }}
              className="text-xs font-bold text-[#0044AA] hover:underline inline-flex items-center gap-1.5 cursor-pointer py-2 px-3 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Track a different shipment</span>
            </button>
          </div>
        </div>
      )}

      {/* General Help Hint for Guests */}
      {!order && (
        <div className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-2xl text-xs text-slate-600 shadow-2xs">
          <span className="flex items-center gap-2.5 font-semibold text-slate-700">
            <HelpCircle className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Have a question about books, delivery dates, or payment?</span>
          </span>
          <Link
            href="/help"
            className="font-extrabold text-[#2874f0] hover:text-blue-700 hover:underline shrink-0 ml-2"
          >
            Visit Help Center ↗
          </Link>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans page-mobile-nav">
      <AnnouncementBar />
      <Header />
      <main className="flex-1 px-4 py-6 md:py-12">
        <Suspense fallback={<div className="text-center py-12 text-slate-400 text-sm">Loading tracker…</div>}>
          <TrackForm />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
