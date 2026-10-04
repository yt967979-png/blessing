'use client';

import React, { useMemo, useState } from 'react';
import { X, Printer, Package, Check, Phone, MapPin, BookOpen, CheckSquare, Square } from 'lucide-react';
import { adminFulfillmentBucket, isRecordCancelled } from '@/lib/orderStatus';

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
  address: string;
  city: string;
  pincode: string;
  state?: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  courierStatus: string;
  trackingNumber: string;
  courierName: string;
  items: OrderItem[];
  createdAt: string;
  isCancelled?: boolean;
  orderStatus?: string;
}

interface PackingPickListModalProps {
  orders: Order[];
  onClose: () => void;
  onShowToast?: (msg: string) => void;
}

export const PackingPickListModal: React.FC<PackingPickListModalProps> = ({
  orders,
  onClose,
  onShowToast,
}) => {
  const [filterMode, setFilterMode] = useState<'unpacked' | 'all'>('unpacked');
  const [checkedOrders, setCheckedOrders] = useState<Record<string, boolean>>({});

  // Eligible orders
  const activeOrders = useMemo(() => {
    return orders.filter((o) => {
      if (isRecordCancelled(o)) return false;
      if (filterMode === 'unpacked') {
        const bucket = adminFulfillmentBucket(o);
        return bucket === 'pending';
      }
      return true;
    });
  }, [orders, filterMode]);

  // Aggregated book quantities for shelf pull
  const shelfSummary = useMemo(() => {
    const map = new Map<string, { title: string; medium: string; qty: number; count: number }>();

    activeOrders.forEach((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      items.forEach((it) => {
        const title = (it.title || 'Guide Book').trim();
        const medium = (it.medium || 'Standard').trim();
        const key = `${title}__${medium}`.toLowerCase();
        const q = Number(it.qty) || 1;

        if (!map.has(key)) {
          map.set(key, { title, medium, qty: 0, count: 0 });
        }
        const entry = map.get(key)!;
        entry.qty += q;
        entry.count += 1;
      });
    });

    return Array.from(map.values()).sort((a, b) => b.qty - a.qty);
  }, [activeOrders]);

  const totalCopiesNeeded = useMemo(() => {
    return shelfSummary.reduce((acc, cur) => acc + cur.qty, 0);
  }, [shelfSummary]);

  const toggleOrderCheck = (id: string) => {
    setCheckedOrders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl max-w-4xl w-full p-5 sm:p-7 shadow-2xl space-y-6 my-auto max-h-[92vh] overflow-y-auto custom-scrollbar border border-slate-200 print:max-h-none print:overflow-visible print:border-none print:p-0 print:shadow-none print:w-full">
        
        {/* Header (Screen only) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 print:hidden">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black tracking-widest text-[#2874f0] uppercase bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                Warehouse Dispatch Manifest
              </span>
              <span className="text-xs font-bold text-slate-500">
                {activeOrders.length} Order{activeOrders.length === 1 ? '' : 's'} · {totalCopiesNeeded} Total Books
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900 mt-1 flex items-center gap-2">
              <Package className="w-5 h-5 text-[#2874f0]" />
              <span>Daily Packing Pick-List &amp; Shelf Manifest</span>
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setFilterMode('unpacked')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  filterMode === 'unpacked'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Unpacked Only
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Orders
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-[#2874f0] hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Sheet</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Header (Visible on print) */}
        <div className="hidden print:block border-b-2 border-black pb-3 mb-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight text-black">
                BLESSING POWER GUIDE — PACKING &amp; DISPATCH PICK-LIST
              </h1>
              <p className="text-xs text-gray-700 font-semibold mt-0.5">
                Printed: {new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} | Orders in Batch: {activeOrders.length} | Total Books: {totalCopiesNeeded}
              </p>
            </div>
            <div className="text-right text-xs">
              <span className="font-bold border border-black px-2 py-1">OFFICIAL DISPATCH SHEET</span>
            </div>
          </div>
        </div>

        {activeOrders.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Package className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">No unpacked orders in this view</p>
            <p className="text-xs text-slate-500 mt-1">All current orders have already been packed or dispatched.</p>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* PART 1: SHELF PULL SUMMARY (Pull from racks first) */}
            <div className="bg-gradient-to-br from-blue-50/70 via-slate-50 to-indigo-50/50 rounded-2xl p-4 sm:p-5 border border-blue-200/80 space-y-3 print:bg-white print:border-black print:p-2">
              <div className="flex items-center justify-between border-b border-blue-200/60 pb-2 print:border-black">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-700 print:text-black" />
                  <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                    Step 1: Pull from Book Racks ({totalCopiesNeeded} Total Books)
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full print:border print:border-black print:text-black print:bg-white">
                  {shelfSummary.length} Unique Titles
                </span>
              </div>
              <p className="text-[11px] text-slate-600 print:hidden">
                Take these exact copies off the shelves before packing boxes to ensure 100% accuracy:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 print:grid-cols-2 print:gap-1">
                {shelfSummary.map((item, idx) => (
                  <div
                    key={`${item.title}-${item.medium}-${idx}`}
                    className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200 shadow-2xs print:border print:border-black print:p-1"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-xs text-slate-900 truncate">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-1.5 mt-0.5">
                        <span className="text-blue-700 font-bold print:text-black">
                          Medium: {item.medium}
                        </span>
                        <span>· in {item.count} order{item.count === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-3 py-1 bg-blue-600 text-white font-black text-sm rounded-lg shadow-2xs print:bg-black print:text-white">
                        × {item.qty}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PART 2: ORDER PACKING CHECKLIST */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 print:text-black" />
                  <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wide">
                    Step 2: Order Box Packing Checklist ({activeOrders.length} Parcels)
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-slate-500 print:hidden">
                  Tick off parcels as you pack and seal
                </span>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden print:border-black print:divide-black">
                {activeOrders.map((o, idx) => {
                  const isChecked = Boolean(checkedOrders[o.id]);
                  const items = Array.isArray(o.items) ? o.items : [];
                  const orderRef = o.orderId || o.id;

                  return (
                    <div
                      key={o.id}
                      onClick={() => toggleOrderCheck(o.id)}
                      className={`p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isChecked ? 'bg-emerald-50/60' : 'bg-white hover:bg-slate-50/80'
                      } print:bg-white print:p-2 print:break-inside-avoid`}
                    >
                      {/* Left: Checkbox & Order ID */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          className="mt-0.5 text-slate-400 hover:text-slate-700 shrink-0 print:border print:border-black print:w-4 print:h-4"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-300" />
                          )}
                        </button>

                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-black text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded print:border print:border-black print:bg-white">
                              #{orderRef}
                            </span>
                            <span className="font-extrabold text-xs text-slate-900">
                              {o.customerName || 'Customer'}
                            </span>
                            <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              +91 {o.customerPhone || '—'}
                            </span>
                          </div>

                          {/* Address */}
                          <div className="text-[11px] text-slate-600 flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>
                              {o.city || 'City'}, {o.pincode || 'Pincode'} ({o.state || 'Tamil Nadu'})
                            </span>
                          </div>

                          {/* Items in this parcel */}
                          <div className="text-xs font-bold text-blue-900 bg-blue-50/80 p-2 rounded-xl border border-blue-100 space-y-0.5 print:bg-white print:border-none print:p-0 print:text-black">
                            {items.map((it, iIdx) => (
                              <div key={iIdx} className="flex items-center justify-between text-[11px]">
                                <span>• {it.qty}× {it.title}</span>
                                {it.medium && (
                                  <span className="text-[10px] text-blue-700 font-semibold print:text-black">
                                    [{it.medium}]
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Right: Payment badge & Courier Docket */}
                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 print:border-black print:text-black print:bg-white">
                          ₹{Number(o.totalAmount || 0).toLocaleString('en-IN')} (PREPAID)
                        </span>
                        {o.trackingNumber && !o.trackingNumber.startsWith('SHP-') ? (
                          <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
                            AWB: {o.trackingNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-semibold">
                            AWB Pending
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 print:hidden">
          <div className="text-xs text-slate-500 font-medium">
            💡 Tip: Use <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[10px] font-mono font-bold">Ctrl + P</kbd> or click <strong>Print Sheet</strong> to generate physical clipboard printout.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
          >
            Close Manifest
          </button>
        </div>

      </div>
    </div>
  );
};
