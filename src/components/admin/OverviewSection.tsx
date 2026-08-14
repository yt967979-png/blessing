'use client';

import React from 'react';
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
} from 'lucide-react';
import { AdminTab } from './AdminSidebar';

interface OverviewSectionProps {
  analytics: any;
  orders: any[];
  lowStockItems: Array<{ id: string; title: string; stock: number }>;
  activeStockHolds: { count: number; totalQty: number };
  systemHealth?: any;
  onNavigate: (tab: AdminTab) => void;
}

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  analytics,
  orders,
  lowStockItems,
  activeStockHolds,
  onNavigate,
}) => {
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

      {/* ─── Middle Section: Low Stock Warnings & Quick Operations ───────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Alerts (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-sm text-slate-900">
                Low Inventory Alerts & Student Carts
              </h3>
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

          {/* Active Student Carts / Stock Holds Bar */}
          {activeStockHolds.count > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500 animate-spin" />
                <span>
                  <strong className="text-slate-900 font-bold">{activeStockHolds.count}</strong> student(s) currently checking out ({activeStockHolds.totalQty} copies reserved)
                </span>
              </div>
              <span className="text-[11px] text-slate-400">Auto-expires in 10 mins if abandoned</span>
            </div>
          )}
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
