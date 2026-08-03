'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Package,
  Truck,
  Search,
  CheckCircle2,
  MapPin,
  ExternalLink,
  Phone,
  Clock,
  X,
  ChevronRight,
  ShoppingBag,
} from 'lucide-react';
import { isOrderCancelled } from '@/lib/orderStatus';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';

function TrackForm() {
  const searchParams = useSearchParams();
  const { user } = useStore();

  const [orderId, setOrderId] = useState(searchParams.get('orderId') || '');
  const [phone, setPhone] = useState(searchParams.get('phone') || user?.phone || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);

  // User Orders list for logged in state
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [loadingUserOrders, setLoadingUserOrders] = useState(false);

  useEffect(() => {
    if (user?.token) {
      setLoadingUserOrders(true);
      fetch('/api/orders', {
        headers: authHeaders(user),
      })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (Array.isArray(data)) setUserOrders(data);
        })
        .catch(() => {})
        .finally(() => setLoadingUserOrders(false));
    }
  }, [user]);

  const runTrack = async (oid?: string, ph?: string) => {
    const id = (oid ?? orderId).trim();
    const mobile = (ph ?? phone ?? user?.phone ?? '').trim();
    setError(null);
    setLoading(true);
    setOrder(null);
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id, phone: mobile }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not track order. Please verify Order ID and Mobile number.');
        return;
      }
      setOrder(data.order);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const oid = searchParams.get('orderId');
    const ph = searchParams.get('phone') || user?.phone;
    if (oid && ph) {
      setOrderId(oid);
      setPhone(ph);
      void runTrack(oid, ph);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, user]);

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <div className="text-center space-y-2">
        <BrandLogo size={56} className="w-14 h-14 mx-auto mb-1" />
        <div className="inline-flex items-center gap-2 text-amber-700 text-xs font-bold uppercase tracking-wider">
          <Truck className="w-4 h-4" />
          ST Courier Live Tracking
        </div>
        <h1 className="font-heading font-black text-2xl md:text-3xl text-[#001B3A]">Track Your Order</h1>
        <p className="text-sm text-slate-500">
          {user
            ? `Welcome back, ${user.name}! Select any order below or enter Order ID to track live ST Courier status.`
            : 'No login needed — enter Order ID + the 10-digit mobile number used at checkout.'}
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
                  <span>Track Live</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Track Form for Guests or Manual Search */}
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
          <label className="text-[11px] font-bold text-slate-600 uppercase">Mobile Number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit mobile number from checkout"
            inputMode="tel"
            className="mt-1 w-full px-3 py-3 border border-slate-300 rounded-xl text-sm outline-none focus:border-blue-600 min-h-12"
            required
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
          {loading ? 'Tracking Order…' : 'Track Live Order'}
        </button>
      </form>

      {/* Live Tracking Result */}
      {order && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Order Details</p>
              <p className="font-heading font-black text-xl text-[#001B3A]">#{order.orderId}</p>
              <p className="text-xs text-slate-500 mt-1">
                {order.customer?.name} · {order.customer?.phone}
                {order.customer?.city ? ` · ${order.customer.city}` : ''}
              </p>
            </div>
            <div className="text-right">
              {order.cancelled || isOrderCancelled(order.status) ? (
                <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-800 border border-red-200 text-xs font-bold px-3 py-1.5 rounded-full">
                  <X className="w-3.5 h-3.5" />
                  Cancelled
                </span>
              ) : order.awaitingConfirmation || String(order.status || '').toLowerCase().includes('awaiting') ? (
                <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200 text-xs font-bold px-3 py-1.5 rounded-full">
                  <Clock className="w-3.5 h-3.5" />
                  Confirm on WhatsApp
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-3 py-1.5 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {order.status}
                </span>
              )}
              {!order.cancelled && !isOrderCancelled(order.status) && order.autoUpdated && (
                <p className="text-[10px] text-blue-600 font-semibold mt-1">Just synced from ST Courier</p>
              )}
            </div>
          </div>

          {order.cancelled || isOrderCancelled(order.status) ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-5 text-center space-y-1">
              <p className="font-heading font-black text-red-800 text-sm">Order Cancelled</p>
              <p className="text-xs text-red-700/80">This order will not be shipped. You can place a new order anytime.</p>
            </div>
          ) : order.awaitingConfirmation || String(order.status || '').toLowerCase().includes('awaiting') ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-5 text-center space-y-1">
              <p className="font-heading font-black text-amber-900 text-sm">Confirm on WhatsApp</p>
              <p className="text-xs text-amber-800/90">
                Reply <strong>YES</strong> to confirm or <strong>NO</strong> to cancel on the WhatsApp message we sent.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto pb-2">
              <div className="flex items-start min-w-[520px] gap-0">
                {order.steps?.map((step: any, i: number) => (
                  <div key={step.key} className="flex-1 flex flex-col items-center relative">
                    {i > 0 && (
                      <div
                        className={`absolute top-3 right-1/2 w-full h-0.5 -translate-y-1/2 ${
                          step.done ? 'bg-emerald-500' : 'bg-slate-200'
                        }`}
                        style={{ zIndex: 0 }}
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
                    <p className={`text-[11px] font-bold mt-2 text-center ${step.done ? 'text-slate-900' : 'text-slate-400'}`}>
                      {step.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ST Courier AWB Tracking Details */}
          {order.trackingNumber && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">ST Courier Docket Number</p>
                <p className="font-mono font-bold text-sm text-slate-900">{order.trackingNumber}</p>
              </div>
              <a
                href={order.trackingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#001B3A] text-white text-xs font-bold rounded-lg hover:bg-blue-900 transition-colors"
              >
                <span>Track on ST Courier</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans">
      <AnnouncementBar />
      <Header />
      <main className="flex-1 px-4 py-8 md:py-12">
        <Suspense fallback={<div className="text-center py-12 text-slate-400 text-sm">Loading tracker…</div>}>
          <TrackForm />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
