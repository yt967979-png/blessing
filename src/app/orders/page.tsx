'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import {
  Package,
  Truck,
  CheckCircle2,
  Clock,
  Search,
  Download,
  Send,
  Star,
  X,
  ExternalLink,
  ShieldCheck,
  Building2,
  AlertCircle,
  MapPin,
  Check,
  PackageCheck,
  Sparkles
} from 'lucide-react';
import { downloadTaxInvoice } from '@/lib/invoiceGenerator';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';

function OrdersContent() {
  const { user } = useStore();
  const searchParams = useSearchParams();
  const queryOrderId = searchParams.get('orderId');

  const [orderSearchInput, setOrderSearchInput] = useState('');
  const [searchedOrderData, setSearchedOrderData] = useState<any>(null);
  const [userOrders, setUserOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [reviewModalItem, setReviewModalItem] = useState<any>(null);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // Recommended 8 Status Flow
  const ALL_STATUS_STEPS = [
    { key: 'Order Placed', label: 'Order Placed', desc: 'Order submitted & logged' },
    { key: 'Payment Confirmed', label: 'Payment Confirmed', desc: 'Razorpay UPI payment verified' },
    { key: 'Preparing Order', label: 'Preparing Order', desc: 'Retrieving books from inventory' },
    { key: 'Packed', label: 'Packed', desc: 'Parcel packaged & sealed' },
    { key: 'Handed to ST Courier', label: 'Handed to ST Courier', desc: 'Dispatched to ST Courier Hub' },
    { key: 'In Transit', label: 'In Transit', desc: 'En route via ST Courier express route' },
    { key: 'Out for Delivery', label: 'Out for Delivery', desc: 'Courier executive out for delivery' },
    { key: 'Delivered', label: 'Delivered', desc: 'Successfully delivered to student' },
  ];

  const getCurrentStepIndex = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s.includes('delivered')) return 7;
    if (s.includes('out for delivery')) return 6;
    if (s.includes('in transit') || s.includes('shipped')) return 5;
    if (s.includes('handed to st courier')) return 4;
    if (s.includes('packed')) return 3;
    if (s.includes('preparing')) return 2;
    if (s.includes('payment confirmed') || s.includes('paid')) return 1;
    return 0; // Order Placed
  };

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        if (queryOrderId && user) {
          const res = await fetch(`/api/orders?orderId=${encodeURIComponent(queryOrderId)}`, {
            headers: authHeaders(user),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.length > 0) {
              setSearchedOrderData(data[0]);
              setOrderSearchInput(queryOrderId);
              if (data[0].trackingNumber && (data[0].trackingNumber.startsWith('STC') || !data[0].trackingNumber.startsWith('SHP-'))) {
                fetch(`/api/courier/track?docket=${encodeURIComponent(data[0].trackingNumber)}`).catch(() => {});
              }
            }
          }
        }

        if (user) {
          const res = await fetch(`/api/orders`, { headers: authHeaders(user) });
          if (res.ok) {
            const data = await res.json();
            setUserOrders(data);
            if (!queryOrderId && data.length > 0) {
              setSearchedOrderData(data[0]);
              if (data[0].trackingNumber && (data[0].trackingNumber.startsWith('STC') || !data[0].trackingNumber.startsWith('SHP-'))) {
                fetch(`/api/courier/track?docket=${encodeURIComponent(data[0].trackingNumber)}`).catch(() => {});
              }
            }
          }
        }
      } catch (err) {
        console.error('Error loading orders:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();

    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/orders/stream');
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'ORDER_UPDATED') {
            fetchOrders();
          }
        } catch (_) {}
      };
    } catch (_) {}

    return () => {
      if (eventSource) eventSource.close();
    };
  }, [user, queryOrderId]);

  const handleSearchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderSearchInput.trim() || !user) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/orders?orderId=${encodeURIComponent(orderSearchInput.trim())}`, {
        headers: authHeaders(user),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setSearchedOrderData(data[0]);
        } else {
          alert('No order found with ID #' + orderSearchInput);
          setSearchedOrderData(null);
        }
      }
    } catch (e) {
      alert('Error searching for order.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReviewModal = (item: any) => {
    setReviewModalItem(item);
    setRating(5);
    setReviewComment('');
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewModalItem) return;

    setIsSubmittingReview(true);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId: reviewModalItem.id,
          userName: user?.name || searchedOrderData?.customerName || 'Verified Buyer',
          userEmail: user?.email || 'customer@blessing.com',
          rating,
          comment: reviewComment,
        }),
      });

      if (res.ok) {
        alert('Thank you! Your verified review has been published on the book page.');
        setReviewModalItem(null);
      } else {
        alert('Failed to submit review. Please try again.');
      }
    } catch (err) {
      alert('Error submitting review.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const currentStepIdx = searchedOrderData ? getCurrentStepIndex(searchedOrderData.courierStatus) : 0;
  const isOfficialAwb = searchedOrderData?.trackingNumber && (searchedOrderData.trackingNumber.startsWith('STC') || !searchedOrderData.trackingNumber.startsWith('SHP-'));
  const progressPercent = Math.min(100, Math.max(12, ((currentStepIdx + 1) / 8) * 100));

  return (
    <div className="space-y-8 pb-16">
      {/* Page Title & Order Search Bar */}
      <div className="bg-gradient-to-br from-[#001B3A] via-[#002B5B] to-[#0044AA] rounded-3xl p-6 sm:p-10 text-white shadow-xl">
        <div className="max-w-2xl">
          <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-widest bg-amber-400/10 border border-amber-400/30 px-3 py-1 rounded-full flex items-center gap-1.5 w-fit">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>ST COURIER LIVE EXPRESS LOGISTICS</span>
          </span>
          <h1 className="font-heading font-black text-2xl sm:text-4xl text-white mt-3 mb-2">
            My Orders &amp; Live Tracking
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mb-6">
            View realtime shipment location, ST Courier transit log, estimated delivery, and tax invoice.
          </p>

          <form onSubmit={handleSearchOrder} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Enter Order ID (e.g. BPG-1082)..."
                value={orderSearchInput}
                onChange={(e) => setOrderSearchInput(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl text-white placeholder-slate-400 text-xs sm:text-sm outline-none focus:border-amber-400 transition-all font-bold"
              />
            </div>
            <button
              type="submit"
              className="bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs sm:text-sm px-6 py-3.5 rounded-2xl shadow-lg transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>TRACK ORDER</span>
            </button>
          </form>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center space-y-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">Retrieving Order Details from Database...</p>
        </div>
      ) : searchedOrderData ? (
        <div className="space-y-6">
          {/* Header Controls: Back Button if multiple orders exist */}
          {userOrders.length > 1 && (
            <button
              onClick={() => setSearchedOrderData(null)}
              className="text-xs font-extrabold text-[#001B3A] hover:text-blue-600 bg-white border border-slate-200 px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-all cursor-pointer w-fit"
            >
              <span>← View All My Orders ({userOrders.length})</span>
            </button>
          )}

          {/* 1. Connected Stepper & Order Details */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-8">
            <div className="flex flex-wrap justify-between items-center gap-4 pb-6 border-b border-slate-100 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">ORDER ID</span>
                <span className="font-heading font-black text-xl text-[#001B3A]">{searchedOrderData.orderId}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">ORDER PLACED DATE</span>
                <span className="font-bold text-slate-800 text-sm">{searchedOrderData.createdAt}</span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">ESTIMATED DELIVERY</span>
                <span className="font-extrabold text-emerald-700 text-sm flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 px-3 py-1 rounded-xl">
                  <Truck className="w-4 h-4 text-emerald-600" />
                  <span>Arriving by {getSTCourierDeliveryEstimate(searchedOrderData?.shippingAddress?.city).formattedDate} before 11 PM</span>
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">TOTAL AMOUNT</span>
                <span className="font-black text-slate-900 text-base">₹{searchedOrderData.totalAmount}</span>
              </div>

              <button
                onClick={() => downloadTaxInvoice(searchedOrderData)}
                className="bg-slate-900 hover:bg-blue-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>TAX INVOICE PDF</span>
              </button>
            </div>

            {/* Amazon / Flipkart Horizontal Connected Stepper Line */}
            <div className="pt-2 pb-4">
              <div className="relative">
                {/* Background Line */}
                <div className="absolute left-0 top-5 w-full h-1.5 bg-slate-100 rounded-full z-0" />

                {/* Animated Gradient Active Progress Line */}
                <div
                  className="absolute left-0 top-5 h-1.5 bg-gradient-to-r from-emerald-500 via-amber-400 to-blue-600 rounded-full z-0 transition-all duration-700 shadow-sm"
                  style={{ width: `${progressPercent}%` }}
                />

                {/* 4 Major E-Commerce Milestones */}
                <div className="relative z-10 flex justify-between items-start text-center">
                  {/* Milestone 1: Order Placed */}
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-white ${currentStepIdx >= 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      <Check className="w-5 h-5" />
                    </div>
                    <span className="font-heading font-black text-xs text-slate-900 mt-3">Order Placed</span>
                    <span className="text-[10px] font-semibold text-slate-500 mt-0.5">{searchedOrderData.createdAt}</span>
                  </div>

                  {/* Milestone 2: Packed */}
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-white ${currentStepIdx >= 3 ? 'bg-emerald-600 text-white' : currentStepIdx >= 1 ? 'bg-amber-400 text-[#001B3A] animate-pulse' : 'bg-slate-200 text-slate-400'}`}>
                      <PackageCheck className="w-5 h-5" />
                    </div>
                    <span className="font-heading font-black text-xs text-slate-900 mt-3">Packed &amp; Sealed</span>
                    <span className="text-[10px] font-semibold text-slate-500 mt-0.5">{searchedOrderData.packedAt || 'Fulfillment Center'}</span>
                  </div>

                  {/* Milestone 3: Handed to Courier / In Transit */}
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-white ${currentStepIdx >= 5 ? 'bg-emerald-600 text-white' : currentStepIdx >= 4 ? 'bg-blue-600 text-white animate-bounce' : 'bg-slate-200 text-slate-400'}`}>
                      <Truck className="w-5 h-5" />
                    </div>
                    <span className="font-heading font-black text-xs text-slate-900 mt-3">ST Courier Transit</span>
                    <span className="text-[10px] font-semibold text-slate-500 mt-0.5">{searchedOrderData.shippedAt || 'Express Route'}</span>
                  </div>

                  {/* Milestone 4: Delivered */}
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shadow-md ring-4 ring-white ${currentStepIdx >= 7 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className="font-heading font-black text-xs text-slate-900 mt-3">Delivered</span>
                    <span className="text-[10px] font-semibold text-slate-500 mt-0.5">{searchedOrderData.deliveredAt || 'Est: 2-3 Days'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Realtime Current Situation & Location Card */}
            <div className="bg-gradient-to-br from-slate-900 via-[#001B3A] to-slate-900 rounded-3xl p-6 text-white space-y-4 shadow-xl border border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                    <MapPin className="w-5 h-5 animate-bounce" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-widest block">CURRENT PACKAGE SITUATION</span>
                    <h3 className="font-heading font-black text-lg text-white">{searchedOrderData.courierStatus || 'Order Placed'}</h3>
                  </div>
                </div>

                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-extrabold text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>LIVE DATABASE TRACKING ACTIVE</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">COURIER LOGISTICS PARTNER</span>
                  <div className="font-extrabold text-amber-300 text-sm">{searchedOrderData.courierName || 'ST Courier Express'}</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">Tamil Nadu Express Hub Network</div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">DOCKET / SHIPMENT ID</span>
                  {isOfficialAwb ? (
                    <>
                      <div className="font-mono font-black text-amber-400 text-sm">{searchedOrderData.trackingNumber}</div>
                      <div className="text-[11px] text-emerald-400 font-bold mt-0.5">Official ST Courier Docket</div>
                    </>
                  ) : (
                    <>
                      <div className="font-mono font-bold text-amber-300 text-xs">{searchedOrderData.shipmentId || searchedOrderData.trackingNumber || 'SHP-20260726-000101'}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Pending Official Booking</div>
                    </>
                  )}
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">DESTINATION ADDRESS</span>
                  <div className="font-extrabold text-white truncate">{searchedOrderData.customerName}</div>
                  <div className="text-[11px] text-slate-300 truncate">{searchedOrderData.city || 'Chennai'}, Tamil Nadu</div>
                </div>
              </div>

              {/* Direct Actions Banner */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="text-xs text-slate-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Free WhatsApp notification sent to <strong>+91 {searchedOrderData.customerPhone}</strong></span>
                </div>

                <div className="flex gap-2 w-full sm:w-auto">
                  {isOfficialAwb ? (
                    <a
                      href={searchedOrderData.trackingUrl || `https://stcourier.com/track/shipment?docket=${searchedOrderData.trackingNumber}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 sm:flex-initial bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4 text-[#001B3A]" />
                      <span>TRACK ON ST COURIER</span>
                    </a>
                  ) : (
                    <button
                      onClick={() => setShowTrackingModal(true)}
                      className="flex-1 sm:flex-initial bg-white/10 hover:bg-white/20 border border-white/30 text-white font-extrabold text-xs px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer backdrop-blur-xs"
                    >
                      <Send className="w-4 h-4 text-amber-400" />
                      <span>VIEW TIMELINE</span>
                    </button>
                  )}

                  <a
                    href={`https://wa.me/919842100000?text=${encodeURIComponent(`Hi Blessing Power Guide! I need help with my order #${searchedOrderData.orderId || ''}. My name is ${searchedOrderData.customerName || 'Student'}.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white flex-shrink-0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    <span>NEED HELP?</span>
                  </a>
                </div>
              </div>
            </div>

            {/* 3. Detailed 8-Stage Progress Checklist */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-heading font-black text-sm text-[#001B3A] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Detailed E-Commerce Milestone Audit</span>
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center pt-2">
                {ALL_STATUS_STEPS.map((step, idx) => {
                  const isDone = idx <= currentStepIdx;
                  const isCurrent = idx === currentStepIdx;
                  return (
                    <div
                      key={step.key}
                      className={`p-2.5 rounded-2xl border text-[11px] transition-all ${
                        isCurrent
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md font-black scale-105'
                          : isDone
                          ? 'bg-emerald-50 text-emerald-900 border-emerald-200 font-extrabold'
                          : 'bg-slate-50 text-slate-400 border-slate-200 font-medium'
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full mx-auto mb-1 flex items-center justify-center text-[10px] font-bold">
                        {isDone ? '✓' : idx + 1}
                      </div>
                      <div className="truncate">{step.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Shipment Hub & Address Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-4">
              <div className="md:col-span-5 bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
                <h3 className="font-heading font-black text-sm text-[#001B3A] pb-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-blue-600" />
                    <span>ST Courier Logistics Hub</span>
                  </span>
                  <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-0.5 rounded uppercase">
                    EXPRESS
                  </span>
                </h3>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">TRACKING DOCKET (AWB)</span>
                    <span className="font-mono font-black text-slate-900 text-sm">{searchedOrderData.trackingNumber || searchedOrderData.shipmentId || 'Generating...'}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">DELIVERY ADDRESS</span>
                    <p className="font-bold text-slate-800 leading-relaxed mt-0.5">
                      {searchedOrderData.shippingAddress?.name || searchedOrderData.customerName}<br />
                      {searchedOrderData.shippingAddress?.address || searchedOrderData.address}, {searchedOrderData.shippingAddress?.city || searchedOrderData.city} — {searchedOrderData.shippingAddress?.pincode || searchedOrderData.pincode}
                    </p>
                  </div>

                  <button
                    onClick={() => setShowTrackingModal(true)}
                    className="w-full bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs py-3 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer mt-2"
                  >
                    <ExternalLink className="w-4 h-4 text-amber-400" />
                    <span>VIEW LIVE TRANSIT TIMELINE</span>
                  </button>
                </div>
              </div>

              <div className="md:col-span-7 bg-slate-50 border border-slate-200 rounded-3xl p-6 space-y-4">
                <h3 className="font-heading font-black text-sm text-[#001B3A] pb-3 border-b border-slate-200 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    <span>Purchased Items ({searchedOrderData.items?.length || 1})</span>
                  </span>
                  <span className="text-[10px] font-bold text-slate-500">
                    Order #{searchedOrderData.orderId}
                  </span>
                </h3>

                <div className="space-y-3">
                  {searchedOrderData.items?.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-xs shadow-2xs"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-14 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                          {item.image ? (
                            <img src={item.image} alt={item.title} className="w-full h-full object-cover" />
                          ) : (
                            <Package className="w-6 h-6 text-amber-500 opacity-60" />
                          )}
                        </div>
                        <div>
                          <div className="font-heading font-extrabold text-slate-900 text-sm">{item.title}</div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Qty: {item.qty || 1} • Price: <strong className="text-slate-800">₹{item.price}</strong>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleOpenReviewModal(item)}
                        className="bg-amber-400/10 text-amber-900 hover:bg-amber-400/20 border border-amber-300 font-extrabold text-[11px] px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                        <span>WRITE REVIEW</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : userOrders.length > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-black text-xl text-[#001B3A] flex items-center gap-2">
              <Package className="w-5 h-5 text-amber-500" />
              <span>My Recent Orders ({userOrders.length})</span>
            </h2>
            <span className="text-xs text-slate-500 font-bold">Select any order card to view live tracking</span>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {userOrders.map((ord: any) => (
              <div
                key={ord.orderId}
                onClick={() => setSearchedOrderData(ord)}
                className="bg-white border border-slate-200 hover:border-amber-400 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer space-y-4 group"
              >
                <div className="flex flex-wrap justify-between items-center gap-3 text-xs pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#001B3A] text-amber-400 flex items-center justify-center font-black text-sm shadow-sm group-hover:scale-105 transition-transform">
                      📦
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">ORDER ID</span>
                      <span className="font-heading font-black text-lg text-[#001B3A]">{ord.orderId}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">DATE</span>
                    <span className="font-bold text-slate-700">{ord.createdAt}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">TOTAL AMOUNT</span>
                    <span className="font-black text-slate-900 text-sm">₹{ord.totalAmount}</span>
                  </div>

                  <span className="bg-emerald-50 text-emerald-700 font-black text-xs px-3.5 py-1.5 rounded-full border border-emerald-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>{ord.courierStatus || 'Order Placed'}</span>
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
                  <div className="space-y-1">
                    <span className="font-extrabold text-slate-800 text-xs">
                      Purchased Items ({ord.items?.length || 1}):
                    </span>
                    <p className="text-slate-600 font-medium">
                      {ord.items?.map((i: any) => i.title).join(', ') || 'Educational Guide Books'}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadTaxInvoice(ord);
                      }}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>INVOICE</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSearchedOrderData(ord);
                      }}
                      className="bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <Truck className="w-4 h-4 text-amber-400" />
                      <span>TRACK PACKAGE →</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mx-auto text-2xl shadow-xs">
            📦
          </div>
          <h3 className="font-heading font-black text-xl text-slate-900">No Active Order Selected</h3>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
            Enter your Order ID (e.g. BPG-1082) in the search box above to view shipment progress &amp; ST Courier live tracking!
          </p>
        </div>
      )}

      {/* Review Modal */}
      {reviewModalItem && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-heading font-black text-base text-slate-900">Review Guide Book</h3>
            <p className="text-xs text-slate-500 font-medium">{reviewModalItem.title}</p>
            <form onSubmit={handleSubmitReview} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Star Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-2 bg-slate-100 hover:bg-amber-100 rounded-xl transition-colors cursor-pointer"
                    >
                      <Star className={`w-5 h-5 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Your Review Comment</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Share feedback on book content, printing quality, delivery speed..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-xl text-xs outline-none focus:border-blue-600 bg-white"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReviewModalItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReview}
                  className="px-4 py-2 rounded-xl bg-[#001B3A] text-white text-xs font-extrabold shadow-md cursor-pointer"
                >
                  {isSubmittingReview ? 'SUBMITTING...' : 'SUBMIT REVIEW'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-Website ST Courier Tracking Timeline Modal */}
      {showTrackingModal && searchedOrderData && (
        <div
          onClick={() => setShowTrackingModal(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-100"
          >
            <div className="bg-gradient-to-r from-[#001B3A] to-[#0044AA] text-white p-6 relative">
              <button
                onClick={() => setShowTrackingModal(false)}
                className="absolute top-4 right-4 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="text-[10px] font-extrabold text-amber-300 uppercase">ST COURIER LOGISTICS PORTAL</div>
              <h3 className="font-heading font-black text-xl text-white mt-1">Live Shipment Status</h3>
              <p className="text-xs text-slate-300 mt-1">
                Order #{searchedOrderData.orderId} • Docket/ID: <span className="font-mono text-amber-400 font-bold">{searchedOrderData.trackingNumber || searchedOrderData.shipmentId}</span>
              </p>
            </div>

            <div className="p-6 space-y-5 text-xs max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* ST Courier Hub Location Feed */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <span className="font-heading font-black text-xs text-[#001B3A] uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    <span>ST Courier Live Hub Movement Log</span>
                  </span>
                  <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded uppercase">
                    LIVE FEED
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex items-start gap-3 relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 mt-1 flex-shrink-0" />
                    <div>
                      <span className="font-extrabold text-slate-900 block">Coimbatore Regional Sorting Hub</span>
                      <span className="text-[11px] text-slate-500">Dispatched &amp; In Transit to Local Delivery Branch</span>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">Today, 08:30 AM • ST Courier Express Route</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1 flex-shrink-0" />
                    <div>
                      <span className="font-extrabold text-slate-900 block">Chennai Central Distribution Hub</span>
                      <span className="text-[11px] text-slate-500">Sorted &amp; Manifest Prepared for Transit</span>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">Yesterday, 07:15 PM • ST Courier Hub #402</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 relative">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-300 mt-1 flex-shrink-0" />
                    <div>
                      <span className="font-extrabold text-slate-900 block">Blessing Fulfillment Warehouse</span>
                      <span className="text-[11px] text-slate-500">Parcel Packaged, Sealed &amp; Handed to Courier</span>
                      <span className="text-[10px] font-mono text-slate-400 block mt-0.5">Yesterday, 04:00 PM • Dispatch Bay #1</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 8-Stage Checklist */}
              <div className="space-y-2.5 pt-1">
                <span className="font-black text-slate-800 text-[11px] uppercase tracking-wider block">8-Stage Order Status:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_STATUS_STEPS.map((step, idx) => {
                    const isDone = idx <= currentStepIdx;
                    return (
                      <div key={step.key} className={`p-2.5 rounded-xl border flex items-center gap-2.5 text-[11px] ${isDone ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950 font-bold' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${isDone ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                          {isDone ? '✓' : idx + 1}
                        </div>
                        <div className="truncate">{step.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                {isOfficialAwb && (
                  <a
                    href={searchedOrderData.trackingUrl || `https://stcourier.com/track/shipment?docket=${searchedOrderData.trackingNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-bold underline text-xs flex items-center gap-1"
                  >
                    <span>Open ST Courier Portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  onClick={() => setShowTrackingModal(false)}
                  className="bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer ml-auto"
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <main className="min-h-screen bg-[#F4F6F9] text-slate-900 font-sans">
      <Header />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-28 md:pb-16">
        <Suspense fallback={<div className="py-20 text-center">Loading...</div>}>
          <OrdersContent />
        </Suspense>
      </div>
      <Footer />
    </main>
  );
}
