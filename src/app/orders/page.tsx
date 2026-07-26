'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Modals } from '@/components/modals/Modals';
import { useStore } from '@/context/StoreContext';
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
  AlertCircle
} from 'lucide-react';
import { downloadTaxInvoice } from '@/lib/invoiceGenerator';

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
    { key: 'Order Placed', label: 'Order Placed', desc: 'Order submitted by customer' },
    { key: 'Payment Confirmed', label: 'Payment Confirmed', desc: 'Payment verified & approved' },
    { key: 'Preparing Order', label: 'Preparing Order', desc: 'Retrieving books from inventory' },
    { key: 'Packed', label: 'Packed', desc: 'Parcel packaged & sealed' },
    { key: 'Handed to ST Courier', label: 'Handed to ST Courier', desc: 'Dispatched to ST Courier Hub' },
    { key: 'In Transit', label: 'In Transit', desc: 'En route via ST Courier express network' },
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
        if (queryOrderId) {
          const res = await fetch(`/api/orders?orderId=${encodeURIComponent(queryOrderId)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.length > 0) {
              setSearchedOrderData(data[0]);
              setOrderSearchInput(queryOrderId);
            }
          }
        }

        if (user) {
          const res = await fetch(`/api/orders?userId=${encodeURIComponent(user.id || user.email || '')}`);
          if (res.ok) {
            const data = await res.json();
            setUserOrders(data);
            if (!queryOrderId && data.length > 0) {
              setSearchedOrderData(data[0]);
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
  }, [user, queryOrderId]);

  const handleSearchOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderSearchInput.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/orders?orderId=${encodeURIComponent(orderSearchInput.trim())}`);
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

  return (
    <div className="space-y-8 pb-16">
      {/* Page Title & Order Search Bar */}
      <div className="bg-gradient-to-br from-[#001B3A] via-[#002B5B] to-[#0044AA] rounded-3xl p-6 sm:p-10 text-white shadow-xl">
        <div className="max-w-2xl">
          <span className="text-[10px] font-extrabold text-amber-300 uppercase tracking-widest bg-amber-400/10 border border-amber-400/30 px-3 py-1 rounded-full">
            REALTIME ST COURIER ORDER TRACKING
          </span>
          <h1 className="font-heading font-black text-2xl sm:text-4xl text-white mt-3 mb-2">
            Track Your Shipment
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mb-6">
            Enter your Order ID (e.g. BPG-1082) or ST Courier Docket Number to view live status updates &amp; download tax invoices.
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
              <span>TRACK LIVE</span>
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
          {/* 1. Main Order Summary Card */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-wrap justify-between items-center gap-4 pb-6 border-b border-slate-100 text-xs">
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">ORDER ID</span>
                <span className="font-heading font-black text-xl text-[#001B3A]">{searchedOrderData.orderId}</span>
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
                <span className="font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 inline-block mt-0.5">
                  {searchedOrderData.paymentMethod || 'Razorpay UPI'} • {searchedOrderData.paymentStatus || 'Payment Confirmed'}
                </span>
              </div>

              <button
                onClick={() => downloadTaxInvoice(searchedOrderData)}
                className="bg-slate-900 hover:bg-blue-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>TAX INVOICE PDF</span>
              </button>
            </div>

            {/* 2. Official E-Commerce Recommended 8-Status Checklist */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-black text-sm text-[#001B3A] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>Order Progress Checklist</span>
                </h3>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
                  Current Status: {searchedOrderData.courierStatus || 'Order Placed'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {ALL_STATUS_STEPS.map((step, idx) => {
                  const isDone = idx <= currentStepIdx;
                  return (
                    <div
                      key={step.key}
                      className={`p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
                        isDone
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                          : 'bg-slate-50/60 border-slate-200 text-slate-400 opacity-60'
                      }`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5 ${
                          isDone ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                        }`}
                      >
                        {isDone ? '✔' : '○'}
                      </div>
                      <div>
                        <div className="font-extrabold text-xs">{step.label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{step.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Logistics & Docket Number Banner */}
            <div className="bg-gradient-to-r from-[#001B3A] via-[#002B5B] to-[#0044AA] rounded-2xl p-5 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider">
                    COURIER PARTNER: ST COURIER EXPRESS
                  </div>
                  <h4 className="font-heading font-black text-base text-white">
                    {isOfficialAwb ? (
                      <>
                        Docket Number: <span className="text-amber-400 font-mono font-extrabold">{searchedOrderData.trackingNumber}</span>
                      </>
                    ) : (
                      <>
                        Shipment ID: <span className="text-amber-300 font-mono font-bold">{searchedOrderData.shipmentId || searchedOrderData.trackingNumber || 'Pending ST Courier Booking'}</span>
                      </>
                    )}
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {isOfficialAwb ? 'Official ST Courier AWB assigned & active' : 'Internal Shipment Created • Official ST Courier Docket pending booking'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {isOfficialAwb ? (
                  <a
                    href={searchedOrderData.trackingUrl || `https://stcourier.com/track/shipment?docket=${searchedOrderData.trackingNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs px-5 py-3 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <ExternalLink className="w-4 h-4 text-[#001B3A]" />
                    <span>TRACK ON ST COURIER</span>
                  </a>
                ) : (
                  <button
                    onClick={() => setShowTrackingModal(true)}
                    className="w-full sm:w-auto bg-white/10 hover:bg-white/20 border border-white/30 text-white font-extrabold text-xs px-5 py-3 rounded-xl transition-all flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer backdrop-blur-xs"
                  >
                    <Send className="w-4 h-4 text-amber-400" />
                    <span>VIEW LIVE TIMELINE</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 4. Delivery Address & Purchased Guide Books Grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-5 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-3">
              <h3 className="font-heading font-black text-sm text-[#001B3A] pb-3 border-b border-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Delivery Address</span>
              </h3>
              <div className="text-xs space-y-1">
                <div className="font-extrabold text-slate-900 text-sm">{searchedOrderData.customerName}</div>
                {searchedOrderData.address ? (
                  <p className="text-slate-600 font-medium leading-relaxed">
                    {searchedOrderData.address}{searchedOrderData.city ? `, ${searchedOrderData.city}` : ''}{searchedOrderData.pincode ? ` - ${searchedOrderData.pincode}` : ''}
                  </p>
                ) : (
                  <p className="text-slate-400 italic">Address on file</p>
                )}
                {searchedOrderData.customerPhone && (
                  <div className="pt-2 font-bold text-slate-700">
                    <span>📱 Phone: </span>
                    <span className="text-blue-600">+91 {searchedOrderData.customerPhone}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-7 bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-4">
              <h3 className="font-heading font-black text-sm text-[#001B3A] pb-3 border-b border-slate-100 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                <span>Purchased Guide Books ({searchedOrderData.items?.length || 1})</span>
              </h3>
              <div className="space-y-3">
                {searchedOrderData.items?.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-extrabold text-slate-900">{item.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Qty: {item.qty || 1} • Price: ₹{item.price}
                      </div>
                    </div>
                    <button
                      onClick={() => handleOpenReviewModal(item)}
                      className="bg-amber-400/20 text-amber-900 hover:bg-amber-400/30 border border-amber-300 font-extrabold text-[11px] px-3 py-1.5 rounded-xl transition-all flex items-center gap-1 cursor-pointer"
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
      ) : (
        <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-md mx-auto space-y-4">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto opacity-80" />
          <h3 className="font-heading font-black text-lg text-slate-900">No Active Order Selected</h3>
          <p className="text-xs text-slate-500">
            Enter your Order ID (e.g. BPG-1082) in the search box above to track your ST Courier shipment!
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

            <div className="p-6 space-y-4 text-xs">
              <div className="space-y-3">
                {ALL_STATUS_STEPS.map((step, idx) => {
                  const isDone = idx <= currentStepIdx;
                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isDone ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                        {isDone ? '✔' : '○'}
                      </div>
                      <div className={`font-bold ${isDone ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</div>
                    </div>
                  );
                })}
              </div>

              {isOfficialAwb && (
                <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                  <a
                    href={searchedOrderData.trackingUrl || `https://stcourier.com/track/shipment?docket=${searchedOrderData.trackingNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-bold underline text-xs"
                  >
                    Open Official ST Courier Site ↗
                  </a>
                  <button
                    onClick={() => setShowTrackingModal(false)}
                    className="bg-[#001B3A] text-white font-extrabold text-xs px-5 py-2 rounded-xl"
                  >
                    CLOSE
                  </button>
                </div>
              )}
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <Suspense fallback={<div className="py-20 text-center">Loading...</div>}>
          <OrdersContent />
        </Suspense>
      </div>
      <Footer />
      <CartDrawer />
      <Modals />
    </main>
  );
}
