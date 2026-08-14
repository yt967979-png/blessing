'use client';

import React from 'react';
import {
  IndianRupee,
  ShoppingCart,
  Package,
  TrendingUp,
  AlertTriangle,
  Boxes,
  Truck,
  CheckCircle2,
  Activity,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { AdminTab } from './AdminSidebar';

interface OverviewSectionProps {
  analytics: any;
  orders: any[];
  lowStockItems: Array<{ id: string; title: string; stock: number }>;
  activeStockHolds: { count: number; totalQty: number };
  systemHealth: {
    healthy: boolean;
    deadLetterCount: number;
    stalePendingRefunds: number;
    dailyRefundPercent: number;
  };
  onNavigate: (tab: AdminTab) => void;
}

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  analytics,
  orders,
  lowStockItems,
  activeStockHolds,
  systemHealth,
  onNavigate,
}) => {
  const summary = analytics?.summary || {};
  const todayRevenue = summary.todayRevenue || 0;
  const todayOrders = summary.todayOrders || 0;
  const monthRevenue = summary.monthRevenue || summary.totalRevenue || 0;
  const monthOrders = summary.monthOrders || summary.totalOrders || 0;

  // Unfulfilled orders that need warehouse packing
  const pendingOrders = orders.filter((o) => {
    const s = String(o.courierStatus || o.order_status || '').toLowerCase();
    return (s.includes('confirm') || s.includes('placed') || s.includes('paid')) && !s.includes('pack') && !s.includes('handed') && !s.includes('transit') && !s.includes('deliver') && !s.includes('cancel');
  });

  const packedOrders = orders.filter((o) => {
    const s = String(o.courierStatus || o.order_status || '').toLowerCase();
    return s.includes('pack') && !s.includes('handed') && !s.includes('transit') && !s.includes('deliver');
  });

  return (
    <div className="space-y-6">
      {/* ─── Top Ledger Summary Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Revenue */}
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#55607A] font-mono mb-2">
            <span>TODAY'S REVENUE</span>
            <div className="w-6 h-6 rounded-md bg-[#2F9E60]/10 text-[#2F9E60] flex items-center justify-center">
              <IndianRupee className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif font-black text-2xl text-[#1E2A4A]">
            {fmt(todayRevenue)}
          </p>
          <p className="text-[11px] text-[#55607A] font-sans mt-1">
            <strong className="text-[#1E2A4A]">{todayOrders}</strong> paid order(s) today
          </p>
        </div>

        {/* Month-to-Date Revenue */}
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#55607A] font-mono mb-2">
            <span>MONTHLY TOTAL</span>
            <div className="w-6 h-6 rounded-md bg-[#D98C2B]/10 text-[#D98C2B] flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif font-black text-2xl text-[#1E2A4A]">
            {fmt(monthRevenue)}
          </p>
          <p className="text-[11px] text-[#55607A] font-sans mt-1">
            <strong className="text-[#1E2A4A]">{monthOrders}</strong> orders this cycle
          </p>
        </div>

        {/* Pending Fulfillment Queue */}
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#55607A] font-mono mb-2">
            <span>PENDING TO PACK</span>
            <div className="w-6 h-6 rounded-md bg-[#0284c7]/10 text-[#0284c7] flex items-center justify-center">
              <Package className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif font-black text-2xl text-[#0284c7]">
            {pendingOrders.length}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="text-[11px] text-[#0284c7] font-bold mt-1 flex items-center gap-1 hover:underline cursor-pointer"
          >
            <span>Open Packing Table</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Ready for ST Courier Dispatch */}
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#55607A] font-mono mb-2">
            <span>PACKED & AWAITING AWB</span>
            <div className="w-6 h-6 rounded-md bg-[#D98C2B]/10 text-[#D98C2B] flex items-center justify-center">
              <Truck className="w-3.5 h-3.5" />
            </div>
          </div>
          <p className="font-serif font-black text-2xl text-[#D98C2B]">
            {packedOrders.length}
          </p>
          <button
            type="button"
            onClick={() => onNavigate('courier')}
            className="text-[11px] text-[#D98C2B] font-bold mt-1 flex items-center gap-1 hover:underline cursor-pointer"
          >
            <span>Assign ST Courier AWBs</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* ─── Middle Section: Operational Alerts & Actions ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Alerts (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#55607A]/20 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#D98C2B]" />
              <h3 className="font-serif font-bold text-sm text-[#1E2A4A]">
                Inventory Alerts & Stock Holds
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-xs font-mono font-bold text-[#D98C2B] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Inventory</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {lowStockItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-[#55607A]">
              <CheckCircle2 className="w-8 h-8 text-[#2F9E60] mb-2 opacity-80" />
              <p className="text-xs font-semibold text-[#1E2A4A]">All Book Titles Well Stocked</p>
              <p className="text-[11px] text-[#55607A] mt-0.5">
                No items are currently running below the 5-copy threshold.
              </p>
            </div>
          ) : (
            <div className="space-y-2 flex-1">
              <p className="text-[11px] text-[#C43B3B] font-bold font-mono uppercase">
                ⚠️ {lowStockItems.length} Title(s) Need Restocking:
              </p>
              <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto custom-scrollbar">
                {lowStockItems.slice(0, 5).map((item) => (
                  <div key={item.id} className="py-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#1E2A4A] truncate max-w-[280px]">
                      {item.title}
                    </span>
                    <span className="font-mono font-black text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200 shrink-0">
                      {item.stock === 0 ? 'OUT OF STOCK' : `ONLY ${item.stock} LEFT`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStockHolds.count > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 bg-[#FAF7F0] p-2.5 rounded-lg flex items-center justify-between text-xs text-[#55607A]">
              <span className="font-mono text-[11px]">
                🔒 <strong>{activeStockHolds.count}</strong> Active Checkout Hold(s) ({activeStockHolds.totalQty} books held temporarily)
              </span>
              <span className="text-[10px] text-[#55607A]">Auto-expires in 10m</span>
            </div>
          )}
        </div>

        {/* System & Refund Health Card (1 col) */}
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 border-b border-slate-100 pb-2.5">
              <Activity className="w-4 h-4 text-[#1E2A4A]" />
              <h3 className="font-serif font-bold text-sm text-[#1E2A4A]">
                System & Refund Health
              </h3>
            </div>

            <div className="space-y-3 font-sans text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[#55607A]">Background Workers:</span>
                <span
                  className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                    systemHealth.healthy
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {systemHealth.healthy ? 'HEALTHY' : 'DEGRADED'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#55607A]">Dead-Letter Webhooks:</span>
                <span
                  className={`font-mono font-bold px-2 py-0.5 rounded text-[11px] ${
                    systemHealth.deadLetterCount === 0
                      ? 'text-[#55607A]'
                      : 'bg-red-50 text-red-700 border border-red-200 animate-pulse'
                  }`}
                >
                  {systemHealth.deadLetterCount} Pending
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#55607A]">Stale Pending Refunds:</span>
                <span className="font-mono font-bold text-[#1E2A4A]">
                  {systemHealth.stalePendingRefunds}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[#55607A]">Daily Refund Ratio:</span>
                <span className="font-mono font-bold text-[#1E2A4A]">
                  {systemHealth.dailyRefundPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 mt-4">
            <button
              type="button"
              onClick={() => onNavigate('system')}
              className="w-full bg-[#FAF7F0] hover:bg-slate-100 text-[#1E2A4A] border border-[#55607A]/20 py-2 rounded-lg text-xs font-mono font-bold transition-colors cursor-pointer text-center"
            >
              Open Health Telemetry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewSection;
