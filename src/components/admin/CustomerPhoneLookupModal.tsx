'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  Phone,
  User,
  Package,
  MapPin,
  ExternalLink,
  MessageCircle,
  Printer,
  Calendar,
  IndianRupee,
  Clock,
  Truck,
  CheckCircle2,
} from 'lucide-react';
import { openShippingLabelPrint } from '@/lib/shippingLabel';
import { fulfillmentStatus, isRecordCancelled, isParcelDelivered } from '@/lib/orderStatus';

interface OrderItem {
  title: string;
  qty: number;
  price?: number;
  subtotal?: number;
  medium?: string;
}

interface Order {
  orderId: string;
  id: string;
  customerName: string;
  customerPhone: string;
  customerAltPhone?: string;
  address: string;
  city: string;
  pincode: string;
  state?: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  courierStatus: string;
  trackingNumber: string;
  shipmentId?: string;
  isOfficialAwb?: boolean;
  trackingUrl?: string;
  courierName: string;
  items: OrderItem[];
  createdAt: string;
  isCancelled?: boolean;
  orderStatus?: string;
}

interface CustomerPhoneLookupModalProps {
  orders: Order[];
  onClose: () => void;
  initialQuery?: string;
  onShowToast?: (msg: string) => void;
}

export const CustomerPhoneLookupModal: React.FC<CustomerPhoneLookupModalProps> = ({
  orders,
  onClose,
  initialQuery = '',
  onShowToast,
}) => {
  const [query, setQuery] = useState(initialQuery);

  // Group matching results
  const matchingOrders = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/\s+/g, '');
    if (!q || q.length < 2) return [];

    return orders.filter((o) => {
      const p = String(o.customerPhone || '').replace(/\D/g, '');
      const altP = String(o.customerAltPhone || '').replace(/\D/g, '');
      const name = String(o.customerName || '').toLowerCase().replace(/\s+/g, '');
      const ordId = String(o.orderId || o.id || '').toLowerCase();
      const awb = String(o.trackingNumber || '').toLowerCase();

      return (
        p.includes(q) ||
        altP.includes(q) ||
        name.includes(q) ||
        ordId.includes(q) ||
        awb.includes(q)
      );
    });
  }, [orders, query]);

  // Aggregate customer details if matches exist
  const customerProfile = useMemo(() => {
    if (matchingOrders.length === 0) return null;
    const first = matchingOrders[0];
    const cleanPhone = String(first.customerPhone || '').replace(/\D/g, '').slice(-10);
    const totalSpent = matchingOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0);
    const deliveredCount = matchingOrders.filter((o) => isParcelDelivered(fulfillmentStatus(o))).length;

    return {
      name: first.customerName || 'Customer',
      phone: cleanPhone,
      altPhone: first.customerAltPhone,
      city: first.city,
      address: first.address,
      pincode: first.pincode,
      state: first.state || 'Tamil Nadu',
      totalOrders: matchingOrders.length,
      totalSpent,
      deliveredCount,
    };
  }, [matchingOrders]);

  const handleOpenWhatsApp = (order?: Order) => {
    if (!customerProfile?.phone) return;
    const phone = `91${customerProfile.phone}`;
    let text = `Hello ${customerProfile.name}! 👋 Greeting from Blessing Power Guide Bookstore.`;

    if (order) {
      const orderRef = order.orderId || order.id;
      const trackUrl = `https://blessingpowerguide.in/track?orderId=${encodeURIComponent(orderRef)}`;
      const hasAwb = Boolean(order.trackingNumber && !order.trackingNumber.startsWith('SHP-') && !order.trackingNumber.includes('Pending'));
      
      text += ` Regarding your order #${orderRef}:\n`;
      if (hasAwb) {
        text += `📦 Courier Docket: ${order.trackingNumber} (${order.courierName || 'ST Courier'})\n`;
      }
      text += `📍 Track Parcel Live: ${trackUrl}\n`;
      text += `\nPlease let us know if you have any questions!`;
    }

    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl space-y-5 my-auto max-h-[92vh] overflow-y-auto custom-scrollbar border border-slate-200">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="text-[10px] font-black tracking-widest text-emerald-600 uppercase bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Customer Intelligence
            </span>
            <h2 className="text-base sm:text-lg font-black text-slate-900 mt-1 flex items-center gap-2">
              <Phone className="w-5 h-5 text-emerald-600" />
              <span>Instant Customer &amp; Phone Lookup</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Bar */}
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus
            placeholder="Enter student or parent 10-digit phone number, name, or Order ID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-semibold outline-none focus:border-emerald-500 focus:bg-white text-slate-900 shadow-inner"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 p-1"
            >
              Clear
            </button>
          )}
        </div>

        {/* Results Area */}
        {query.trim().length >= 2 && matchingOrders.length === 0 ? (
          <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No customer records found</p>
            <p className="text-xs text-slate-500 mt-1">
              No orders matched &ldquo;{query}&rdquo;. Check the phone number or name and try again.
            </p>
          </div>
        ) : customerProfile ? (
          <div className="space-y-4">
            
            {/* Customer Summary Card */}
            <div className="bg-gradient-to-br from-emerald-50 via-teal-50/50 to-slate-50 p-4 rounded-2xl border border-emerald-200 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
                    {customerProfile.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">
                      {customerProfile.name}
                    </h3>
                    <div className="text-xs font-bold text-slate-600 flex items-center gap-2 mt-0.5">
                      <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
                        ☎ +91 {customerProfile.phone}
                      </span>
                      {customerProfile.altPhone && (
                        <span className="text-slate-500">
                          Alt: +91 {customerProfile.altPhone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenWhatsApp()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0"
                >
                  <MessageCircle className="w-4 h-4 fill-white" />
                  <span>Chat on WhatsApp</span>
                </button>
              </div>

              {/* Address & Quick Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-emerald-200/60 text-xs">
                <div className="sm:col-span-2 text-slate-600 flex items-start gap-1.5">
                  <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-snug">
                    {customerProfile.address}, {customerProfile.city} - {customerProfile.pincode} ({customerProfile.state})
                  </span>
                </div>
                <div className="bg-white/80 p-2 rounded-xl border border-emerald-200/50 flex items-center justify-between">
                  <span className="font-semibold text-slate-500 text-[11px]">Orders:</span>
                  <span className="font-black text-slate-900">
                    {customerProfile.totalOrders} (₹{customerProfile.totalSpent.toLocaleString('en-IN')})
                  </span>
                </div>
              </div>
            </div>

            {/* Orders History List */}
            <div className="space-y-2">
              <h4 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-slate-400" />
                <span>Orders History ({matchingOrders.length})</span>
              </h4>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
                {matchingOrders.map((o) => {
                  const items = Array.isArray(o.items) ? o.items : [];
                  const orderRef = o.orderId || o.id;
                  const currentFulfillment = fulfillmentStatus(o) || o.courierStatus || 'Processing';
                  const isDelivered = isParcelDelivered(currentFulfillment);
                  const isCancelled = isRecordCancelled(o);

                  return (
                    <div key={o.id} className="p-3.5 bg-white hover:bg-slate-50 transition-colors space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            #{orderRef}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(o.createdAt).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isCancelled
                                ? 'bg-red-100 text-red-700'
                                : isDelivered
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {isCancelled ? 'Cancelled' : currentFulfillment}
                          </span>
                          <span className="text-xs font-black text-slate-900">
                            ₹{Number(o.totalAmount || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>

                      {/* Items */}
                      <div className="text-xs text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100 space-y-0.5">
                        {items.map((it, idx) => (
                          <div key={idx} className="flex justify-between text-[11px]">
                            <span className="font-medium truncate">{it.qty}× {it.title}</span>
                            {it.medium && <span className="text-slate-400 font-semibold shrink-0">[{it.medium}]</span>}
                          </div>
                        ))}
                      </div>

                      {/* Courier & Action Buttons */}
                      <div className="flex items-center justify-between pt-1 text-xs">
                        <div className="text-[11px] font-mono text-slate-500">
                          {o.trackingNumber && !o.trackingNumber.startsWith('SHP-') ? (
                            <span className="text-purple-700 font-bold">
                              AWB: {o.trackingNumber} ({o.courierName || 'ST Courier'})
                            </span>
                          ) : (
                            <span className="text-slate-400">AWB Pending Dispatch</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openShippingLabelPrint(o, 'thermal4x6')}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="Print Shipping Label"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenWhatsApp(o)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                            title="Send Tracking on WhatsApp"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Send Tracking</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        ) : (
          <div className="text-center py-10 text-slate-400 text-xs">
            Start typing a phone number or name above to look up instant customer intelligence.
          </div>
        )}

      </div>
    </div>
  );
};
