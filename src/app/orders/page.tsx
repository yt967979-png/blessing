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

import { downloadTaxInvoice } from '@/lib/invoiceGenerator';

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
          <div className="space-y-6">
            {/* 1. Main Order Summary Card */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <div className="flex flex-wrap justify-between items-center gap-4 pb-4 border-b border-slate-100 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">ORDER ID</span>
                  <span className="font-heading font-black text-lg text-[#001B3A]">{searchedOrderData.orderId}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">ORDER DATE</span>
                  <span className="font-bold text-slate-700">{searchedOrderData.createdAt || '25 July 2026'}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">TOTAL AMOUNT</span>
                  <span className="font-black text-slate-900 text-base">₹{searchedOrderData.totalAmount}</span>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">PAYMENT METHOD</span>
                  <span className="font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded border border-emerald-200">
                    {searchedOrderData.paymentMethod || 'Razorpay UPI'}
                  </span>
                </div>

                <button
                  onClick={() => downloadTaxInvoice(searchedOrderData)}
                  className="bg-slate-900 hover:bg-blue-600 text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                >
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>TAX INVOICE PDF</span>
                </button>
              </div>

              {/* 2. Visual Stepper Line (Flipkart / Amazon Style) */}
              <div className="pt-8 pb-4 px-2">
                <div className="relative flex items-center justify-between">
                  {/* Connecting Progress Line */}
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 z-0 rounded-full" />
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-3/4 h-1 bg-gradient-to-r from-emerald-500 via-emerald-600 to-amber-500 z-0 rounded-full" />

                  {/* Step 1: Confirmed */}
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-white">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <span className="font-heading font-black text-xs text-slate-900 mt-2">Order Placed</span>
                    <span className="text-[10px] font-semibold text-slate-500">25 Jul, 10:30 AM</span>
                  </div>

                  {/* Step 2: Packed & Dispatched */}
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-white">
                      <PackageCheck className="w-6 h-6" />
                    </div>
                    <span className="font-heading font-black text-xs text-slate-900 mt-2">Packed & Dispatched</span>
                    <span className="text-[10px] font-semibold text-slate-500">25 Jul, 02:15 PM</span>
                  </div>

                  {/* Step 3: In-Transit ST Courier */}
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[#001B3A] flex items-center justify-center font-black text-sm shadow-lg ring-4 ring-white animate-pulse">
                      <Truck className="w-6 h-6" />
                    </div>
                    <span className="font-heading font-black text-xs text-amber-900 mt-2">Shipped via ST Courier</span>
                    <span className="text-[10px] font-bold text-blue-600">Medavakkam Hub</span>
                  </div>

                  {/* Step 4: Delivered */}
                  <div className="relative z-10 flex flex-col items-center text-center opacity-50">
                    <div className="w-10 h-10 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm ring-4 ring-white">
                      <Clock className="w-5 h-5" />
                    </div>
                    <span className="font-heading font-bold text-xs text-slate-600 mt-2">Delivery</span>
                    <span className="text-[10px] font-semibold text-slate-400">Est: Tomorrow 5 PM</span>
                  </div>
                </div>
              </div>

              {/* ST Courier Live Docket Details Banner */}
              <div className="mt-6 bg-gradient-to-r from-[#001B3A] via-[#002B5B] to-[#0044AA] rounded-2xl p-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 flex-shrink-0">
                    <Send className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider">
                      ST COURIER OFFICIAL LOGISTICS PARTNER
                    </div>
                    <h4 className="font-heading font-black text-base text-white">
                      Docket No: <span className="text-amber-400">{searchedOrderData.trackingNumber || 'STC-TN-984210'}</span>
                    </h4>
                    <p className="text-xs text-slate-300">
                      Status: Package in-transit from Chennai Central Hub to Student Address
                    </p>
                  </div>
                </div>

                <a
                  href="https://stcourier.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>TRACK LIVE ON ST COURIER ↗</span>
                </a>
              </div>
            </div>

            {/* 3. Customer Address & Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Delivery Address Card */}
              <div className="md:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <h3 className="font-heading font-black text-sm text-[#001B3A] mb-3 flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Truck className="w-4 h-4 text-blue-600" />
                  <span>Delivery Address</span>
                </h3>
                <div className="space-y-1 text-xs">
                  <div className="font-extrabold text-slate-900 text-sm mb-1">{searchedOrderData.customerName}</div>
                  <p className="text-slate-600 leading-relaxed font-medium">
                    No. 45, Medavakkam High Road, Near Post Office, Chennai - 600012, Tamil Nadu
                  </p>
                  <div className="pt-2 text-slate-700 font-bold flex items-center gap-1">
                    <span>📱 Phone:</span>
                    <span className="text-blue-600">+91 98404 18228</span>
                  </div>
                </div>
              </div>

              {/* Order Items Card */}
              <div className="md:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <h3 className="font-heading font-black text-sm text-[#001B3A] mb-3 flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Package className="w-4 h-4 text-amber-500" />
                  <span>Items in Shipment</span>
                </h3>

                <div className="flex items-center gap-4 py-2">
                  <img
                    src="https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80"
                    alt="Guide Book"
                    className="w-16 h-16 object-contain rounded-xl border border-slate-200 p-1 bg-slate-50 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0 text-xs">
                    <h4 className="font-heading font-extrabold text-slate-900 truncate">
                      10th Standard Mathematics Exam Power Guide Book
                    </h4>
                    <p className="text-slate-500 font-medium mt-0.5">Class: 10th Standard | Qty: 1</p>
                    <div className="font-black text-sm text-[#001B3A] mt-1">
                      ₹360 <span className="text-slate-400 line-through text-xs font-normal">₹450</span>
                    </div>
                  </div>
                </div>
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
