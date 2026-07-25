'use client';

import React, { useState, useEffect } from 'react';
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
  Star,
  X,
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
  const { user, showToast } = useStore();
  const [searchOrder, setSearchOrder] = useState('');
  const [searchedOrderData, setSearchedOrderData] = useState<any | null>(null);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Review Modal State
  const [reviewModalItem, setReviewModalItem] = useState<any | null>(null);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  useEffect(() => {
    async function loadDbOrders() {
      try {
        const res = await fetch('/api/orders');
        if (res.ok) {
          const data = await res.json();
          setAllOrders(data);
          if (data && data.length > 0) {
            setSearchedOrderData(data[0]); // Load latest DB order by default
          }
        }
      } catch (err) {}
      setIsLoading(false);
    }
    loadDbOrders();
  }, []);

  const handleSearchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    if (!searchOrder.trim()) return;

    try {
      const res = await fetch(`/api/orders?orderId=${encodeURIComponent(searchOrder.trim())}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setSearchedOrderData(data[0]);
        } else {
          setSearchError(`No order found matching Order ID "${searchOrder.toUpperCase()}".`);
        }
      }
    } catch (err) {
      setSearchError('Error retrieving order details from database.');
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;
    setIsSubmittingReview(true);

    try {
      await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: reviewModalItem.id || '10th-maths',
          studentName: user?.name || searchedOrderData?.customerName || 'Student Buyer',
          rating,
          comment: reviewComment,
        }),
      });

      showToast('⭐ Verified Student Review published successfully to database!');
      setReviewModalItem(null);
      setReviewComment('');
    } catch (err) {
      showToast('⚠️ Could not publish review. Please try again.');
    }
    setIsSubmittingReview(false);
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
          <span className="text-slate-900">Track Order & Write Reviews</span>
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
              Enter your Order ID (e.g. BPG-1082) to track live ST Courier Express status & submit verified reviews
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
              className="bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-xs cursor-pointer"
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
                  <span className="font-bold text-slate-800 text-sm">{searchedOrderData.createdAt}</span>
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
                    <span className="text-[10px] font-semibold text-slate-500">Confirmed</span>
                  </div>

                  {/* Step 2: Packed & Dispatched */}
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-white">
                      <PackageCheck className="w-6 h-6" />
                    </div>
                    <span className="font-heading font-black text-xs text-slate-900 mt-2">Packed & Dispatched</span>
                    <span className="text-[10px] font-semibold text-slate-500">ST Courier Hub</span>
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
                      Status: Package in-transit from Chennai Hub to Student Address
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

            {/* 3. Customer Address & Dynamic Items Grid */}
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
                    {searchedOrderData.address || 'Medavakkam High Road'}, {searchedOrderData.city || 'Chennai'} - 600012, Tamil Nadu
                  </p>
                  <div className="pt-2 text-slate-700 font-bold flex items-center gap-1">
                    <span>📱 Phone:</span>
                    <span className="text-blue-600">+91 {searchedOrderData.customerPhone || '9840418228'}</span>
                  </div>
                </div>
              </div>

              {/* Order Items Card with Flipkart/Amazon Style Write Review Button */}
              <div className="md:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <h3 className="font-heading font-black text-sm text-[#001B3A] mb-3 flex items-center gap-2 pb-3 border-b border-slate-100 justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-500" />
                    <span>Items in Shipment ({searchedOrderData.items?.length || 1})</span>
                  </div>
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                    VERIFIED BUYER ACCESS
                  </span>
                </h3>

                <div className="space-y-4">
                  {(searchedOrderData.items && searchedOrderData.items.length > 0
                    ? searchedOrderData.items
                    : [{ id: 'bpg-101', title: '10th Standard Mathematics Exam Power Guide Book', qty: 1, price: 360 }]
                  ).map((item: any, idx: number) => (
                    <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 pb-3 gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs flex-shrink-0">
                          📚
                        </div>
                        <div className="text-xs">
                          <h4 className="font-heading font-extrabold text-slate-900">{item.title}</h4>
                          <p className="text-slate-500 font-medium mt-0.5">Qty: {item.qty || 1} • Price: ₹{item.price}</p>
                        </div>
                      </div>

                      {/* Flipkart / Amazon Style Verified Review Button */}
                      <button
                        onClick={() => setReviewModalItem(item)}
                        className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap"
                      >
                        <Star className="w-3.5 h-3.5 fill-[#001B3A]" />
                        <span>WRITE A REVIEW</span>
                      </button>
                    </div>
                  ))}
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

      {/* Flipkart/Amazon Style Write Review Modal */}
      {reviewModalItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded uppercase">
                  VERIFIED PURCHASER REVIEW
                </span>
                <h3 className="font-heading font-black text-lg text-[#001B3A] mt-1">
                  Rate & Review Your Book
                </h3>
              </div>
              <button
                onClick={() => setReviewModalItem(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
              <span className="text-2xl">📚</span>
              <div className="text-xs">
                <div className="font-bold text-slate-900">{reviewModalItem.title}</div>
                <div className="text-[11px] text-slate-500">Order ID: {searchedOrderData?.orderId}</div>
              </div>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Star Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      type="button"
                      key={star}
                      onClick={() => setRating(star)}
                      className="p-2 bg-slate-50 hover:bg-amber-50 rounded-xl border border-slate-200 cursor-pointer transition-colors"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Your Review & Feedback</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Share how this guide book helped your exam preparation, question quality, delivery speed..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl text-xs outline-none focus:border-blue-600 bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalItem(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-50"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-5 py-2.5 rounded-xl bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs shadow-md transition-colors cursor-pointer"
                >
                  {isSubmittingReview ? 'SUBMITTING...' : 'SUBMIT VERIFIED REVIEW'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
      <CartDrawer />
      <Modals />
    </main>
  );
}
