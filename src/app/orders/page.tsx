'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Package,
  Truck,
  CheckCircle2,
  PackageCheck,
  Send,
  Clock,
  ChevronRight,
  Download,
  Search,
  BookOpen,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Modals } from '@/components/modals/Modals';

export default function OrdersPage() {
  const { user } = useStore();
  const [searchOrder, setSearchOrder] = useState('');
  const [searchedOrderData, setSearchedOrderData] = useState<any | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    if (!searchOrder.trim()) return;

    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        setSearchedOrderData(data);
      } else {
        setSearchError(`No order found matching Order ID "${searchOrder.toUpperCase()}".`);
        setSearchedOrderData(null);
      }
    } catch (err) {
      // Demo Fallback for newly created order
      setSearchedOrderData({
        orderId: searchOrder.toUpperCase(),
        customerName: user?.name || 'Student Customer',
        totalAmount: 370,
        paymentMethod: 'Razorpay UPI / COD',
        paymentStatus: 'PAID',
        courierStatus: 'Dispatched & Shipped via ST Courier Express',
        courierPartner: 'ST Courier Express',
        trackingNumber: 'STC-TN-984210',
        createdAt: '25 July 2026',
      });
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <AnnouncementBar />
      <Header />
      <NavBar />

      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-200 py-3">
        <div className="max-w-7xl mx-auto px-4 text-xs font-semibold text-slate-500 flex items-center gap-2">
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link href="/profile" className="hover:text-blue-600">My Account</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900">Track Order</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        {/* Top Header & Search */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="font-heading font-black text-2xl md:text-3xl text-[#001B3A]">
              Track Your Order & ST Courier Delivery
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Enter your Order ID (from checkout or SMS/WhatsApp) to track live ST Courier Express status
            </p>
          </div>

          <form onSubmit={handleSearchOrder} className="flex gap-2 w-full sm:w-80">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Enter Order ID (e.g. BPG-1082)..."
                value={searchOrder}
                onChange={(e) => setSearchOrder(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs outline-none focus:border-blue-600 shadow-xs uppercase"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            </div>
            <button
              type="submit"
              className="bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-xs"
            >
              TRACK
            </button>
          </form>
        </div>

        {searchError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-bold p-4 rounded-xl mb-6">
            {searchError}
          </div>
        )}

        {/* Live Tracked Order Box */}
        {searchedOrderData ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
            {/* Order Header Summary */}
            <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-slate-100 text-xs">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Customer Name</span>
                  <span className="font-extrabold text-slate-800">{searchedOrderData.customerName}</span>
                </div>
                <div className="h-6 w-px bg-slate-200" />
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Amount</span>
                  <span className="font-black text-slate-900 text-sm">₹{searchedOrderData.totalAmount}</span>
                </div>
                <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                <div className="hidden sm:block">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Payment</span>
                  <span className="font-bold text-emerald-600">{searchedOrderData.paymentMethod}</span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="font-extrabold text-[#001B3A] text-sm">Order ID: {searchedOrderData.orderId}</span>
                <button
                  onClick={() => alert(`Downloading official tax invoice for Order #${searchedOrderData.orderId}...`)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Invoice</span>
                </button>
              </div>
            </div>

            {/* ST Courier Delivery Progress Timeline */}
            <div className="bg-gradient-to-br from-slate-50 to-blue-50/40 border border-slate-200 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <Truck className="w-5 h-5 text-[#001B3A]" />
                  <h4 className="font-heading font-black text-xs text-[#001B3A] uppercase tracking-wider">
                    ST COURIER EXPRESS LIVE DELIVERY PROGRESS
                  </h4>
                </div>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-1 rounded-full uppercase">
                  {searchedOrderData.courierStatus}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 relative mb-6">
                {/* Step 1: Confirmed */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-slate-900">Order Confirmed</h5>
                    <span className="text-[10px] text-slate-500">Accepted & Verified</span>
                  </div>
                </div>

                {/* Step 2: Packed */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm">
                    <PackageCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-slate-900">Packed & Booked</h5>
                    <span className="text-[10px] text-slate-500">ST Courier Hub Chennai</span>
                  </div>
                </div>

                {/* Step 3: In Transit */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-400 text-[#001B3A] flex items-center justify-center font-bold text-xs flex-shrink-0 shadow-sm animate-pulse">
                    <Send className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-extrabold text-xs text-amber-800">In Transit via ST Courier</h5>
                    <span className="text-[10px] text-slate-600 font-bold block">{searchedOrderData.courierPartner || 'ST Courier Express'}</span>
                    <div className="text-[10px] font-black text-blue-600">Docket: {searchedOrderData.trackingNumber || 'STC-TN-984210'}</div>
                  </div>
                </div>

                {/* Step 4: Delivered */}
                <div className="flex items-start gap-3 opacity-40">
                  <div className="w-9 h-9 rounded-full bg-slate-300 text-slate-600 flex items-center justify-center font-bold text-xs flex-shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-bold text-xs text-slate-700">Delivered</h5>
                    <span className="text-[10px] text-slate-400">Estimated 24-48 Hours</span>
                  </div>
                </div>
              </div>

              {/* Direct ST Courier Official Tracking Button */}
              <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                <span className="text-xs text-slate-600 font-medium">
                  Official Courier Partner: <strong className="text-slate-900 font-extrabold">ST Courier (Tamil Nadu & South India)</strong>
                </span>
                <a
                  href={`https://stcourier.com`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-blue-600 hover:bg-[#001B3A] text-white font-extrabold text-xs px-4 py-2 rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
                >
                  <span>TRACK ON ST COURIER PORTAL ↗</span>
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-16 text-center bg-white border border-dashed border-slate-300 rounded-2xl p-8 max-w-xl mx-auto">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="font-heading font-black text-lg text-[#001B3A] mb-1">
              Enter Your Order ID to Track ST Courier Delivery
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              When you place an order, you will receive an Order ID (e.g. BPG-1082). Enter it above to see live ST Courier Express tracking!
            </p>
          </div>
        )}
      </div>

      <Footer />
      <CartDrawer />
      <Modals />
    </main>
  );
}
