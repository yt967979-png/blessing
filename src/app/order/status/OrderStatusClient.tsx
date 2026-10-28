'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  CheckCircle2,
  Clock,
  Package,
  Truck,
  FileText,
  MessageCircle,
  ExternalLink,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { formatIndianDateTime } from '@/lib/indianTime';

export default function OrderStatusClient() {
  const searchParams = useSearchParams();
  const initialOrderId = searchParams.get('orderId') || searchParams.get('id') || '';
  const initialPhone = searchParams.get('phone') || '';

  const [orderQuery, setOrderQuery] = useState(initialOrderId);
  const [phoneQuery, setPhoneQuery] = useState(initialPhone);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [orderData, setOrderData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchOrder = useCallback(async (oid: string, phone: string) => {
    if (!oid.trim() && !phone.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setSearched(true);

    try {
      const q = new URLSearchParams();
      if (oid.trim()) q.set('orderId', oid.trim());
      if (phone.trim()) q.set('phone', phone.trim());

      const res = await fetch(`/api/track?${q.toString()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.orderNumber) {
          setOrderData(data);
        } else {
          setOrderData(null);
          setErrorMsg('No order found matching these details. Please verify your phone number or Order ID.');
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setOrderData(null);
        setErrorMsg(err.error || 'Could not locate order. Please verify your phone number.');
      }
    } catch {
      setErrorMsg('Network error checking order. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialOrderId || initialPhone) {
      void fetchOrder(initialOrderId, initialPhone);
    }
  }, [initialOrderId, initialPhone, fetchOrder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchOrder(orderQuery, phoneQuery);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 sm:py-12">
        {/* Page Title */}
        <div className="text-center mb-8">
          <span className="text-[11px] font-black uppercase tracking-wider text-blue-700 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
            Self-Service Recovery
          </span>
          <h1 className="font-heading font-black text-2xl sm:text-3xl text-[#001B3A] mt-2 mb-2">
            Recover Your Order & Receipt
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
            If your browser closed or redirect failed after payment, enter your Order ID or phone number to retrieve your confirmed receipt and tracking details.
          </p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm mb-8 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Order ID (e.g. BPG-12345)
              </label>
              <input
                type="text"
                placeholder="BPG-XXXXX (optional)"
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                10-Digit Phone Number
              </label>
              <input
                type="tel"
                placeholder="Mobile number used at checkout"
                value={phoneQuery}
                onChange={(e) => setPhoneQuery(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || (!orderQuery.trim() && !phoneQuery.trim())}
            className="w-full bg-[#001B3A] hover:bg-blue-900 active:scale-98 text-white font-bold text-xs py-3 px-6 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-50 min-h-11"
          >
            <Search className="w-4 h-4" />
            {loading ? 'Finding Your Order…' : 'Lookup Order Status'}
          </button>
        </form>

        {/* Results Box */}
        {orderData ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-md space-y-6 animate-in fade-in-50 duration-300">
            {/* Header Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-slate-100 gap-3">
              <div>
                <span className="text-[11px] font-mono text-slate-400 block">Confirmed Order</span>
                <h2 className="font-heading font-black text-xl text-[#001B3A]">
                  #{orderData.orderNumber}
                </h2>
                {orderData.orderedAt && (
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Placed on {formatIndianDateTime(orderData.orderedAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {orderData.status || 'Confirmed'}
                </span>
              </div>
            </div>

            {/* ST Courier Docket Info */}
            <div className="bg-blue-50/60 border border-blue-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">ST Courier Express</p>
                  <p className="text-[11px] text-slate-600">
                    {orderData.awbNumber ? (
                      <>AWB Docket: <strong className="font-mono text-blue-700">{orderData.awbNumber}</strong></>
                    ) : (
                      'Guides packed — awaiting courier dispatch scan'
                    )}
                  </p>
                </div>
              </div>

              {orderData.awbNumber && (
                <a
                  href={`https://stcourier.com/track/shipment?docket=${encodeURIComponent(orderData.awbNumber)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 bg-white border border-blue-300 hover:bg-blue-50 text-blue-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shrink-0 transition-colors shadow-2xs"
                >
                  Live Courier Tracking
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {/* Delivery Destination */}
            {orderData.shippingAddress && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase mb-1">Delivering To</p>
                <p className="text-xs font-bold text-slate-800">
                  {orderData.shippingAddress.name} ({orderData.shippingAddress.phone})
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {orderData.shippingAddress.address}, {orderData.shippingAddress.city} - {orderData.shippingAddress.pincode}
                </p>
              </div>
            )}

            {/* Action Buttons: Invoice + Support */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <a
                href={`/api/orders/${encodeURIComponent(orderData.orderNumber)}/invoice`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-[#001B3A] hover:bg-blue-900 text-white font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <FileText className="w-4 h-4" />
                Download Tax Invoice (PDF)
              </a>
              <Link
                href={`/track?orderId=${encodeURIComponent(orderData.orderNumber)}`}
                className="flex-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                Full Tracking Timeline
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : searched && !loading ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4">
            <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-200">
              <AlertCircle className="w-7 h-7" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">Order Not Found</h2>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                {errorMsg || 'We couldn&apos;t find an order matching that information. If your payment was deducted, our team can locate it instantly.'}
              </p>
            </div>
            <a
              href="https://wa.me/919486017820?text=Hi%20Blessing%20Power%20Guide%2C%20I%20need%20help%20locating%20my%20order%20status"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
            >
              <MessageCircle className="w-4 h-4" />
              Chat on WhatsApp (+91 94860 17820)
            </a>
          </div>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
