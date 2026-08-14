'use client';

import React, { useState } from 'react';
import {
  Truck,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
} from 'lucide-react';
import OrderStatusStamp from './OrderStatusStamp';

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
  const shippedOrders = orders.filter((o) => Boolean(o.trackingNumber));

  const activeInTransit = shippedOrders.filter((o) => {
    const s = String(o.courierStatus || '').toLowerCase();
    return !s.includes('deliver') && !s.includes('cancel');
  });

  const deliveredCount = shippedOrders.filter((o) => {
    const s = String(o.courierStatus || '').toLowerCase();
    return s.includes('deliver') && !s.includes('attempt');
  }).length;

  const handleManualSyncAll = async () => {
    setSyncing(true);
    onShowToast('⏳ Polling ST Courier for live status updates...');
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
      {/* ─── Top KPIs & Action Bar ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
          <span className="text-xs font-mono text-[#55607A] block mb-1">ACTIVE IN-TRANSIT</span>
          <p className="font-serif font-black text-2xl text-[#1E2A4A]">{activeInTransit.length}</p>
          <p className="text-[11px] text-[#55607A] mt-0.5 font-sans">Moving across hubs</p>
        </div>

        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
          <span className="text-xs font-mono text-[#55607A] block mb-1">TOTAL DELIVERED</span>
          <p className="font-serif font-black text-2xl text-[#2F9E60]">{deliveredCount}</p>
          <p className="text-[11px] text-[#55607A] mt-0.5 font-sans">Verified doorstep deliveries</p>
        </div>

        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs flex flex-col justify-between">
          <span className="text-xs font-mono text-[#55607A] block mb-1">15-MIN AUTO SWEEPER</span>
          <button
            type="button"
            disabled={syncing}
            onClick={handleManualSyncAll}
            className="w-full bg-[#1E2A4A] hover:bg-[#D98C2B] text-white py-2 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Syncing...' : 'Sync ST Courier Now'}</span>
          </button>
        </div>
      </div>

      {/* ─── Shipments Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#55607A]/20 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <h3 className="font-serif font-bold text-sm text-[#1E2A4A] flex items-center gap-2">
            <Truck className="w-4 h-4 text-[#D98C2B]" />
            <span>ST Courier Express Shipments ({shippedOrders.length})</span>
          </h3>

          <div className="relative max-w-xs w-full">
            <Search className="w-4 h-4 text-[#55607A] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Docket, Order #, City..."
              value={docketSearch}
              onChange={(e) => setDocketSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg text-xs font-mono outline-none focus:border-[#D98C2B]"
            />
          </div>
        </div>

        {filteredShipped.length === 0 ? (
          <div className="p-12 text-center text-[#55607A] font-mono text-xs">
            No shipments found with assigned AWB dockets.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#FAF7F0] border-b border-[#55607A]/20 text-[11px] font-mono font-bold text-[#55607A] uppercase">
                  <th className="p-3">AWB Docket #</th>
                  <th className="p-3">Order # & Customer</th>
                  <th className="p-3">Destination</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Portal Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredShipped.map((order) => (
                  <tr key={order.id} className="hover:bg-[#FAF7F0]/60 transition-colors">
                    <td className="p-3 font-mono font-bold text-blue-700">
                      {order.trackingNumber}
                    </td>
                    <td className="p-3">
                      <span className="font-mono font-bold text-[#1E2A4A] block">
                        {order.orderId || order.id}
                      </span>
                      <span className="text-[#55607A] text-[11px] block">
                        {order.customerName} ({order.customerPhone})
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="font-bold text-[#1E2A4A] block">{order.city}</span>
                      <span className="text-[#55607A] font-mono text-[11px] block">
                        PIN: {order.pincode}
                      </span>
                    </td>
                    <td className="p-3">
                      <OrderStatusStamp status={order.courierStatus} size="sm" />
                    </td>
                    <td className="p-3 text-right">
                      <a
                        href={order.trackingUrl || `https://stcourier.com/track/shipment?docket=${order.trackingNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <span>Track Live</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourierSection;
