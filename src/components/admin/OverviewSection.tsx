'use client';

import React, { useState } from 'react';
import {
  IndianRupee,
  ShoppingCart,
  Package,
  TrendingUp,
  Boxes,
  Truck,
  ArrowRight,
  Plus,
  BookOpen,
  CheckCircle2,
  Clock,
  Unlock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AdminTab } from './AdminSidebar';

export interface StockHoldItem {
  id: string;
  holdGroupId?: string;
  bookId: string;
  title: string;
  cls?: string;
  price?: number;
  qty: number;
  razorpayOrderId?: string;
  expiresAt?: string;
  createdAt?: string;
}

export interface ActiveStockHoldsData {
  count: number;
  totalQty: number;
  list?: StockHoldItem[];
}

interface OverviewSectionProps {
  analytics: any;
  orders: any[];
  lowStockItems: Array<{ id: string; title: string; stock: number; cls?: string; subject?: string }>;
  activeStockHolds: ActiveStockHoldsData;
  systemHealth?: any;
  onNavigate: (tab: AdminTab) => void;
  onReleaseHold?: (holdGroupId: string, bookTitle: string) => Promise<void>;
}

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  analytics,
  orders,
  lowStockItems,
  activeStockHolds,
  onNavigate,
  onReleaseHold,
}) => {
  const [showHoldsDetail, setShowHoldsDetail] = useState(false);
  const [releasingHoldId, setReleasingHoldId] = useState<string | null>(null);

  const summary = analytics?.summary || {};
  const todayRevenue = summary.todayRevenue || 0;
  const todayOrders = summary.todayOrders || 0;
  const monthRevenue = summary.monthRevenue || summary.totalRevenue || 0;
  const monthOrders = summary.monthOrders || summary.totalOrders || 0;

  // Unfulfilled orders needing packing
  const pendingOrders = orders.filter((o) => {
    const s = String(o.courierStatus || o.order_status || '').toLowerCase();
    return (
      (s.includes('confirm') || s.includes('placed') || s.includes('paid')) &&
      !s.includes('pack') &&
      !s.includes('handed') &&
      !s.includes('transit') &&
      !s.includes('deliver') &&
      !s.includes('cancel')
    );
  });

  const inTransitOrders = orders.filter((o) => {
    const s = String(o.courierStatus || o.order_status || '').toLowerCase();
    return s.includes('transit') || s.includes('handed') || s.includes('out');
  });

  const handleRelease = async (hold: StockHoldItem) => {
    if (!onReleaseHold) return;
    const targetId = hold.holdGroupId || hold.id;
    if (!targetId) return;

    if (!confirm(`Release hold on ${hold.qty}x "${hold.title}"?\n\nThis will immediately restore the copies to the rack catalog.`)) {
      return;
    }

    setReleasingHoldId(targetId);
    try {
      await onReleaseHold(targetId, hold.title);
    } finally {
      setReleasingHoldId(null);
    }
  };

  const holdsList = activeStockHolds.list || [];

  return (
    <div className="space-y-6">
      {/* ─── Top KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span>TODAY&apos;S SALES</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <p className="font-bold text-2xl text-slate-900 tracking-tight">
            {fmt(todayRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            <strong className="text-slate-900 font-bold">{todayOrders}</strong> paid order(s) today
          </p>
        </div>

        {/* Monthly Total */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span>MONTHLY TOTAL</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#2874f0] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="font-bold text-2xl text-slate-900 tracking-tight">
            {fmt(monthRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            <strong className="text-slate-900 font-bold">{monthOrders}</strong> total orders this month
          </p>
        </div>

        {/* Pending to Pack */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span>UNPACKED ORDERS</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <p className="font-bold text-2xl text-amber-600 tracking-tight">
            {pendingOrders.length}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="text-xs text-[#2874f0] font-bold mt-1 flex items-center gap-1 hover:underline cursor-pointer"
          >
            <span>Open Packing Table</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Active ST Courier Parcels */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span>IN TRANSIT (ST COURIER)</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <p className="font-bold text-2xl text-purple-700 tracking-tight">
            {inTransitOrders.length}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('courier')}
            className="text-xs text-purple-600 font-bold mt-1 flex items-center gap-1 hover:underline cursor-pointer"
          >
            <span>Track Live Deliveries</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ─── Middle Section: Low Stock Warnings & Active Checkout Holds ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Alerts (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <span>Live Inventory Alerts</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Live Synced via SSE Stream" />
                </h3>
                <p className="text-[11px] text-slate-500">Real-time stock rack monitors &amp; checkout holds</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('catalog')}
              className="text-xs font-bold text-[#2874f0] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Catalog</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Low Stock List */}
          {lowStockItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-slate-400">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
              <p className="font-bold text-xs text-slate-800">All Guide Books Fully Stocked</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                No publications currently below the 5-copy threshold.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {lowStockItems.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 text-xs"
                >
                  <div className="min-w-0 flex-1 mr-3">
                    <span className="font-bold text-slate-900 block truncate">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-amber-800 font-medium">
                      Only <strong className="font-bold">{item.stock}</strong> copies remaining in rack
                      {item.cls ? ` (${item.cls} Standard)` : ''}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('catalog')}
                    className="px-3 py-1.5 bg-[#2874f0] hover:bg-blue-600 text-white rounded-lg text-xs font-bold shrink-0 transition-colors cursor-pointer shadow-xs"
                  >
                    Restock
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Active Checkout Holds (Held Books Widget) */}
          <div className="border border-blue-100 bg-blue-50/40 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600 animate-spin" />
                <span className="font-bold text-xs text-slate-900">
                  {activeStockHolds.count > 0 ? (
                    <span>
                      <strong className="text-blue-700">{activeStockHolds.count} student(s)</strong> currently in checkout ({activeStockHolds.totalQty} copies held)
                    </span>
                  ) : (
                    <span className="text-slate-600">0 Active Student Holds in Checkout</span>
                  )}
                </span>
              </div>
              {holdsList.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowHoldsDetail(!showHoldsDetail)}
                  className="text-xs font-bold text-[#2874f0] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>{showHoldsDetail ? 'Hide Held Books' : `View ${holdsList.length} Held Book(s)`}</span>
                  {showHoldsDetail ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {/* Expanded Detailed Holds Table */}
            {showHoldsDetail && holdsList.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-blue-200/60 animate-fade-in">
                {holdsList.map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200 text-xs shadow-2xs"
                  >
                    <div className="min-w-0 flex-1 mr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 truncate">{h.title}</span>
                        {h.cls && (
                          <span className="bg-slate-100 text-slate-600 text-[10px] font-semibold px-1.5 py-0.5 rounded">
                            {h.cls}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                        <span className="font-bold text-blue-700">{h.qty} copy(s) held</span>
                        {h.razorpayOrderId && (
                          <span className="font-mono text-slate-400">Order: {h.razorpayOrderId.slice(-8)}</span>
                        )}
                        {h.expiresAt && (
                          <span className="text-amber-700">
                            Expires: {new Date(h.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>

                    {onReleaseHold && (
                      <button
                        type="button"
                        disabled={releasingHoldId === (h.holdGroupId || h.id)}
                        onClick={() => handleRelease(h)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-700 border border-slate-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        title="Release hold and return copies immediately to rack catalog"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>{releasingHoldId === (h.holdGroupId || h.id) ? 'Releasing…' : 'Release'}</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Operations Shortcuts (1 col) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-900 mb-1">Quick Actions</h3>
            <p className="text-xs text-slate-500">Fast shortcuts for daily store tasks</p>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="w-full p-3 rounded-xl bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-[#2874f0] text-xs font-bold flex items-center justify-between transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-[#2874f0]" />
                <span>Pack Pending Orders</span>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('courier')}
              className="w-full p-3 rounded-xl bg-purple-50 hover:bg-purple-100/80 border border-purple-200 text-purple-700 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4 text-purple-600" />
                <span>Assign ST Courier AWBs</span>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('catalog')}
              className="w-full p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>Add New Guide Book</span>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-2.5">
                <TrendingUp className="w-4 h-4 text-slate-600" />
                <span>Download GST Report CSV</span>
              </div>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewSection;
