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
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { BrandLogo } from '@/components/ui/BrandLogo';

function TrackForm() {
  const searchParams = useSearchParams();
  const [orderId, setOrderId] = useState(searchParams.get('orderId') || '');
  const [phone, setPhone] = useState(searchParams.get('phone') || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);

  const runTrack = async (oid?: string, ph?: string) => {
    const id = (oid ?? orderId).trim();
    const mobile = (ph ?? phone).trim();
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
        setError(data.error || 'Could not track order');
        return;
      }
      setOrder(data.order);
    } catch {
      setError('Network error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const oid = searchParams.get('orderId');
    const ph = searchParams.get('phone');
    if (oid && ph) {
      setOrderId(oid);
      setPhone(ph);
      void runTrack(oid, ph);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <div className="text-center space-y-2">
        <BrandLogo size={56} className="w-14 h-14 mx-auto mb-1" />
        <div className="inline-flex items-center gap-2 text-amber-700 text-xs font-bold uppercase tracking-wider">
          <Truck className="w-4 h-4" />
          ST Courier live tracking
        </div>
        <h1 className="font-heading font-black text-2xl md:text-3xl text-[#001B3A]">Track your order</h1>
        <p className="text-sm text-slate-500">
          No login needed — enter Order ID + mobile number from checkout (or last 4 digits).
        </p>
      </div>

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
            placeholder="BPG-1234"
            className="mt-1 w-full px-3 py-3 border border-slate-300 rounded-xl text-sm font-bold outline-none focus:border-blue-600 min-h-12 uppercase"
            required
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-slate-600 uppercase">Mobile number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="10-digit or last 4 digits"
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
          className="w-full bg-[#001B3A] hover:bg-blue-700 text-white font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider min-h-12 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <Search className="w-4 h-4" />
          {loading ? 'Tracking…' : 'Track order'}
        </button>
      </form>

      {order && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase">Order</p>
              <p className="font-heading font-black text-xl text-[#001B3A]">{order.orderId}</p>
              <p className="text-xs text-slate-500 mt-1">
                {order.customer?.name} · {order.customer?.phone}
                {order.customer?.city ? ` · ${order.customer.city}` : ''}
              </p>
            </div>
            <div className="text-right">
              <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-3 py-1.5 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {order.status}
              </span>
              {order.autoUpdated && (
                <p className="text-[10px] text-blue-600 font-semibold mt-1">Just synced from ST Courier</p>
              )}
            </div>
          </div>

          {/* Flipkart-style stepper */}
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
                    className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                      step.active
                        ? 'bg-amber-400 text-[#001B3A] ring-4 ring-amber-100'
                        : step.done
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {step.done ? '✓' : i + 1}
                  </div>
                  <p
                    className={`mt-2 text-[10px] font-bold text-center px-1 ${
                      step.active ? 'text-[#001B3A]' : step.done ? 'text-emerald-700' : 'text-slate-400'
                    }`}
                  >
                    {step.short || step.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="font-bold text-slate-500 uppercase text-[10px] mb-1">Courier</p>
              <p className="font-extrabold text-[#001B3A] flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-blue-600" />
                {order.courierName}
              </p>
              <p className="mt-1 text-slate-600">
                AWB:{' '}
                <span className="font-bold">{order.awb || 'Pending booking'}</span>
              </p>
              {order.trackingUrl && order.awb && (
                <a
                  href={order.trackingUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 font-bold mt-2 hover:underline"
                >
                  Open ST Courier site <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="font-bold text-slate-500 uppercase text-[10px] mb-1">Books</p>
              <ul className="space-y-1">
                {(order.items || []).map((it: any, idx: number) => (
                  <li key={idx} className="font-semibold text-slate-800 flex gap-2">
                    <Package className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      {it.title} × {it.qty}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Timeline */}
          {(order.timeline?.length > 0 || order.scans?.length > 0) && (
            <div>
              <h3 className="font-heading font-extrabold text-sm text-[#001B3A] mb-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                Tracking updates
              </h3>
              <ol className="space-y-3 border-l-2 border-slate-200 ml-2 pl-4">
                {(order.scans?.length ? order.scans : order.timeline).map((ev: any, i: number) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[1.35rem] top-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-2 ring-white" />
                    <p className="text-xs font-bold text-slate-900">{ev.activity || ev.label}</p>
                    <p className="text-[11px] text-slate-500 flex flex-wrap gap-x-2 mt-0.5">
                      {ev.location || ev.hub ? (
                        <span className="inline-flex items-center gap-0.5">
                          <MapPin className="w-3 h-3" />
                          {ev.location || ev.hub}
                        </span>
                      ) : null}
                      <span>{ev.time || (ev.at ? new Date(ev.at).toLocaleString('en-IN') : '')}</span>
                    </p>
                    {ev.remarks && <p className="text-[11px] text-slate-400 mt-0.5">{ev.remarks}</p>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <Phone className="w-3 h-3" />
            Help: +91 98404 18228
          </p>
        </div>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />
      <div className="flex-1 px-4 py-8">
        <Suspense
          fallback={
            <div className="text-center text-sm font-semibold text-slate-500 py-20">Loading tracker…</div>
          }
        >
          <TrackForm />
        </Suspense>
      </div>
      <Footer />
      <div className="text-center pb-6">
        <Link href="/" className="text-xs font-bold text-blue-600 hover:underline">
          ← Back to store
        </Link>
      </div>
    </main>
  );
}
