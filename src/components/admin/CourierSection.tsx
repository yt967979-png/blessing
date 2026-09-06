'use client';

import React, { useState } from 'react';
import {
  Truck,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  Clock,
  Package,
} from 'lucide-react';
import OrderStatusStamp from './OrderStatusStamp';
import { isRecordCancelled, fulfillmentStatus } from '@/lib/orderStatus';

interface CourierSectionProps {
  orders: any[];
  onRefresh: () => void;
  onShowToast: (msg: string) => void;
  authHeaders: Record<string, string>;
}

export const CourierSection: React.FC<CourierSectionProps> = ({
  orders,
  onRefresh,
  onShowToast,
  authHeaders,
}) => {
  const [syncing, setSyncing] = useState(false);
  const [docketSearch, setDocketSearch] = useState('');

  // Filter orders that have an assigned AWB
  const shippedOrders = orders.filter((o) => Boolean(o.trackingNumber) && !isRecordCancelled(o));

  const activeInTransit = shippedOrders.filter((o) => {
    const s = String(fulfillmentStatus(o) || '').toLowerCase();
    return !s.includes('deliver');
  });

  const deliveredCount = shippedOrders.filter((o) => {
    const s = String(fulfillmentStatus(o) || '').toLowerCase();
    return s.includes('deliver') && !s.includes('attempt');
  }).length;

  const handleManualSyncAll = async () => {
    setSyncing(true);
    onShowToast('⏳ Checking ST Courier network for live parcel updates...');
    try {
      const res = await fetch('/api/courier/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
      });
      const data = await res.json();
      if (res.ok) {
        onShowToast(`✅ ${data.message || `Checked ${data.checked || 0} shipments`}`);
        onRefresh();
      } else {
        onShowToast(`❌ Sync failed: ${data.error || 'Unknown error'}`);
      }
    } catch {
      onShowToast('❌ Network error while querying ST Courier');
    } finally {
      setSyncing(false);
    }
  };

  const filteredShipped = shippedOrders.filter((o) => {
    const q = docketSearch.trim().toLowerCase();
    return (
      !q ||
      o.trackingNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.orderId.toLowerCase().includes(q) ||
      o.city.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* ─── Top Control Toolbar ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg text-slate-900 flex items-center gap-2">
            <Truck className="w-5 h-5 text-[#2874f0]" />
            <span>ST Courier Logistics & Delivery Tracker</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor doorstep dispatches, live delivery scans, and docket tracking links.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <span className="px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
              <strong>{activeInTransit.length}</strong> In Transit
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <strong>{deliveredCount}</strong> Delivered
            </span>
          </div>

          <button
            type="button"
            disabled={syncing}
            onClick={handleManualSyncAll}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#2874f0] hover:bg-blue-700 disabled:opacity-50 rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing…' : 'Sync ST Courier Now'}</span>
          </button>
        </div>
      </div>

      {/* ─── Search & Active Shipments Table ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Docket #, Order ID, Customer, or City..."
              value={docketSearch}
              onChange={(e) => setDocketSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#2874f0] focus:bg-white text-slate-900 shadow-inner"
            />
          </div>

          <span className="text-xs font-medium text-slate-500">
            Showing <strong className="text-slate-900">{filteredShipped.length}</strong> shipments
          </span>
        </div>

        {filteredShipped.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <Truck className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-bold text-sm text-slate-800">No Dispatched Shipments Yet</p>
            <p className="text-xs text-slate-500">
              Assign an ST Courier docket number to packed orders to track them here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="p-3.5">Order #</th>
                  <th className="p-3.5">Student & Address</th>
                  <th className="p-3.5">ST Courier Docket #</th>
                  <th className="p-3.5">Delivery Status</th>
                  <th className="p-3.5 text-right">Official Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredShipped.map((o) => {
                  const trackingUrl =
                    o.trackingUrl ||
                    `https://stcourier.com/track/view?docket=${encodeURIComponent(o.trackingNumber)}`;
                  const isDelivered = String(o.courierStatus || '')
                    .toLowerCase()
                    .includes('deliver');

                  return (
                    <tr key={o.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-slate-900">
                        #{o.orderId}
                      </td>
                      <td className="p-3.5">
                        <span className="font-bold text-slate-900 block">{o.customerName}</span>
                        <span className="text-slate-500 text-[11px] block">
                          {o.city}{o.pincode ? ` — ${o.pincode}` : ''}
                        </span>
                      </td>
                      <td className="p-3.5 font-mono font-bold text-blue-700">
                        {o.trackingNumber}
                      </td>
                      <td className="p-3.5">
                        <OrderStatusStamp status={fulfillmentStatus(o) || 'DISPATCHED'} />
                      </td>
                      <td className="p-3.5 text-right">
                        <a
                          href={trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-[#2874f0] border border-slate-200 hover:border-blue-300 rounded-lg text-xs font-bold transition-all shadow-xs"
                        >
                          <span>Open ST Courier</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourierSection;
