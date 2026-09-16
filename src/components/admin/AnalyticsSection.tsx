'use client';

import React, { useState, useMemo } from 'react';
import {
  IndianRupee,
  TrendingUp,
  ShoppingCart,
  Calendar,
  Download,
  RefreshCw,
  Award,
  CreditCard,
  Clock,
  Package,
  CheckCircle2,
  FileSpreadsheet,
  ArrowUpRight,
  Zap,
} from 'lucide-react';

export interface AnalyticsSummary {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  paidOrders: number;
  todayOrders: number;
  todayRevenue: number;
  monthOrders?: number;
  monthRevenue?: number;
}

export interface DailyPoint {
  day: string;
  orders: number;
  revenue: number;
}

export interface MethodBreakdown {
  method: string;
  count: number;
  revenue: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
  revenue: number;
}

export interface TopProduct {
  title: string;
  totalQty: number;
  totalRevenue: number;
  orderCount: number;
}

export interface MonthlyTrendPoint {
  month: string;
  orders: number;
  revenue: number;
}

export interface HourlyPoint {
  hour: number;
  orders: number;
}

export interface AnalyticsData {
  summary: AnalyticsSummary;
  daily: DailyPoint[];
  paymentMethods: MethodBreakdown[];
  orderStatuses: StatusBreakdown[];
  paymentStatuses: StatusBreakdown[];
  topProducts: TopProduct[];
  monthlyTrend?: MonthlyTrendPoint[];
  hourly?: HourlyPoint[];
  range: number;
  error?: string;
  dbDisconnected?: boolean;
}

interface AnalyticsSectionProps {
  analytics: AnalyticsData | null;
  analyticsLoading: boolean;
  analyticsRange: number;
  onSetRange: (days: number) => void;
  onRefresh: () => void;
  onExportCsv: () => void;
}

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function AnalyticsSection({
  analytics,
  analyticsLoading,
  analyticsRange,
  onSetRange,
  onRefresh,
  onExportCsv,
}: AnalyticsSectionProps) {
  const [chartMode, setChartMode] = useState<'revenue' | 'orders'>('revenue');
  const [hoveredPoint, setHoveredPoint] = useState<DailyPoint | null>(null);

  const summary = analytics?.summary || {
    totalOrders: 0,
    totalRevenue: 0,
    avgOrderValue: 0,
    paidOrders: 0,
    todayOrders: 0,
    todayRevenue: 0,
    monthOrders: 0,
    monthRevenue: 0,
  };

  const daily = analytics?.daily || [];
  const topProducts = analytics?.topProducts || [];
  const paymentMethods = analytics?.paymentMethods || [];
  const orderStatuses = analytics?.orderStatuses || [];
  const monthlyTrend = analytics?.monthlyTrend || [];
  const hourly = analytics?.hourly || [];

  // Computed metrics
  const paidConversionRate = useMemo(() => {
    if (!summary.totalOrders) return 0;
    return Math.round((summary.paidOrders / summary.totalOrders) * 100);
  }, [summary]);

  const peakDay = useMemo(() => {
    if (!daily.length) return null;
    return daily.reduce((max, cur) => (cur.revenue > max.revenue ? cur : max), daily[0]);
  }, [daily]);

  const peakHour = useMemo(() => {
    if (!hourly.length) return null;
    return hourly.reduce((max, cur) => (cur.orders > max.orders ? cur : max), hourly[0]);
  }, [hourly]);

  const totalCatalogRevenue = useMemo(() => {
    return topProducts.reduce((acc, p) => acc + Number(p.totalRevenue || 0), 0) || summary.totalRevenue || 1;
  }, [topProducts, summary.totalRevenue]);

  return (
    <div className="space-y-6">
      {/* ─── Top Control & Export Bar ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xs">
        <div>
          <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#2874f0]" />
            Revenue Analytics & Sales Intelligence
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time bookstore sales velocity, student order habits, and GST tax ledger
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onRefresh}
            disabled={analyticsLoading}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${analyticsLoading ? 'animate-spin text-[#2874f0]' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export GST Ledger CSV</span>
          </button>

          {/* Time range quick filters */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {[7, 14, 30, 90, 180].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onSetRange(d)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  analyticsRange === d
                    ? 'bg-[#2874f0] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Executive KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Gross Revenue */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span className="uppercase tracking-wider font-bold text-[10px]">TOTAL REVENUE</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <p className="font-bold text-2xl text-slate-900 tracking-tight">
            {fmt(summary.totalRevenue)}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
              AOV: {fmt(summary.avgOrderValue)}
            </span>
            <span>avg per order</span>
          </div>
        </div>

        {/* Total Orders & Conversion */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span className="uppercase tracking-wider font-bold text-[10px]">TOTAL ORDERS</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#2874f0] flex items-center justify-center">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <p className="font-bold text-2xl text-slate-900 tracking-tight">
            {summary.totalOrders}
          </p>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
            <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
              {paidConversionRate}% Paid
            </span>
            <span>{summary.paidOrders} confirmed orders</span>
          </div>
        </div>

        {/* Today's Sales Velocity */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span className="uppercase tracking-wider font-bold text-[10px]">TODAY&apos;S VELOCITY</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <p className="font-bold text-2xl text-amber-600 tracking-tight">
            {fmt(summary.todayRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            <strong className="text-slate-900 font-bold">{summary.todayOrders}</strong> paid order(s) placed today
          </p>
        </div>

        {/* Current Month */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium mb-2">
            <span className="uppercase tracking-wider font-bold text-[10px]">MONTHLY RUN-RATE</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <p className="font-bold text-2xl text-slate-900 tracking-tight">
            {fmt(summary.monthRevenue || summary.totalRevenue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            <strong className="text-slate-900 font-bold">{summary.monthOrders || summary.totalOrders}</strong> orders this calendar month
          </p>
        </div>
      </div>

      {/* ─── Main Daily Sales Volume Chart ──────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
              Daily Sales Volume ({analyticsRange} Days)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hover over bars to inspect daily revenue and order volume
            </p>
          </div>

          <div className="flex items-center gap-3">
            {peakDay && peakDay.revenue > 0 && (
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-bold bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-lg">
                <span>Peak: {fmt(peakDay.revenue)}</span>
                <span className="text-amber-500">({new Date(peakDay.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})</span>
              </span>
            )}

            {/* Mode switch: Revenue vs Orders */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setChartMode('revenue')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  chartMode === 'revenue' ? 'bg-[#2874f0] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Revenue (₹)
              </button>
              <button
                type="button"
                onClick={() => setChartMode('orders')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  chartMode === 'orders' ? 'bg-[#2874f0] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Orders Count
              </button>
            </div>
          </div>
        </div>

        {/* Hover inspector tooltip badge */}
        <div className="h-6 flex items-center">
          {hoveredPoint ? (
            <div className="text-xs font-bold text-slate-900 flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-lg border border-blue-200">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>{new Date(hoveredPoint.day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}:</span>
              <span className="text-[#2874f0]">{fmt(hoveredPoint.revenue)}</span>
              <span className="text-slate-500">({hoveredPoint.orders} orders)</span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400 italic">Hover any date bar to view details</span>
          )}
        </div>

        {/* Interactive SVG Bar Chart */}
        <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
          {daily.length === 0 ? (
            <div className="flex items-center justify-center h-44 text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              No sales recorded for this timeframe
            </div>
          ) : (
            (() => {
              const height = 180;
              const maxValue = Math.max(
                ...daily.map((d) => (chartMode === 'revenue' ? d.revenue : d.orders)),
                1
              );
              const barW = Math.max(8, Math.min(32, Math.floor(720 / daily.length) - 4));
              const gap = Math.max(4, Math.floor(720 / daily.length) - barW);
              const chartWidth = Math.max(daily.length * (barW + gap), 400);

              return (
                <svg width={chartWidth} height={height + 34} className="block select-none">
                  {/* Horizontal grid lines */}
                  {[0.25, 0.5, 0.75, 1].map((ratio) => (
                    <line
                      key={ratio}
                      x1={0}
                      y1={height - height * ratio}
                      x2={chartWidth}
                      y2={height - height * ratio}
                      stroke="#f1f5f9"
                      strokeDasharray="4 4"
                      strokeWidth={1}
                    />
                  ))}

                  {/* Bars */}
                  {daily.map((d, i) => {
                    const value = chartMode === 'revenue' ? d.revenue : d.orders;
                    const barH = Math.max(4, Math.round((value / maxValue) * height));
                    const x = i * (barW + gap);
                    const y = height - barH;
                    const isToday = i === daily.length - 1;
                    const isPeak = d === peakDay;
                    const isHovered = hoveredPoint?.day === d.day;

                    let fillColor = '#93c5fd';
                    if (isToday) fillColor = '#2874f0';
                    if (isPeak && chartMode === 'revenue') fillColor = '#3b82f6';
                    if (isHovered) fillColor = '#1d4ed8';

                    return (
                      <g
                        key={d.day}
                        onMouseEnter={() => setHoveredPoint(d)}
                        onMouseLeave={() => setHoveredPoint(null)}
                        className="cursor-pointer"
                      >
                        <rect
                          x={x}
                          y={y}
                          width={barW}
                          height={barH}
                          rx={4}
                          fill={fillColor}
                          className="transition-colors duration-150"
                        />
                        {/* Date label (spaced out) */}
                        {i % Math.max(1, Math.floor(daily.length / 8)) === 0 && (
                          <text
                            x={x + barW / 2}
                            y={height + 20}
                            textAnchor="middle"
                            fontSize={10}
                            fill="#64748b"
                            fontWeight="600"
                          >
                            {new Date(d.day).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              );
            })()
          )}
        </div>
      </div>

      {/* ─── Row 2: MoM Monthly Trend & Peak Hourly Heatmap ──────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Month-Over-Month Rolling Growth */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                6-Month Revenue Trajectory (MoM)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Month-by-month sales progression</p>
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>

          {monthlyTrend.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">Historical trend data computing…</p>
          ) : (
            <div className="space-y-3.5">
              {monthlyTrend.map((m, idx) => {
                const maxMoM = Math.max(...monthlyTrend.map((t) => t.revenue), 1);
                const percent = Math.round((m.revenue / maxMoM) * 100);
                return (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900">{m.month}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-medium">{m.orders} orders</span>
                        <strong className="text-slate-900 font-black">{fmt(m.revenue)}</strong>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-[#2874f0] rounded-full transition-all duration-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Peak Order Hours Heatmap */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                Peak Shopping Hours (24H Heatmap)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {peakHour ? `Busiest rush: ${peakHour.hour}:00 (${peakHour.orders} orders)` : 'Student ordering traffic by time of day'}
              </p>
            </div>
            <Clock className="w-4 h-4 text-[#2874f0]" />
          </div>

          {hourly.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">Order timeline aggregating…</p>
          ) : (
            <div className="pt-2">
              <div className="grid grid-cols-12 gap-1.5 items-end h-28 border-b border-slate-200 pb-2">
                {Array.from({ length: 24 }).map((_, h) => {
                  const match = hourly.find((hp) => hp.hour === h);
                  const orders = match?.orders || 0;
                  const maxH = Math.max(...hourly.map((hp) => hp.orders), 1);
                  const barH = Math.max(6, Math.round((orders / maxH) * 88));
                  const isPeak = match === peakHour && orders > 0;

                  return (
                    <div key={h} className="flex flex-col items-center gap-1 group relative">
                      <div
                        className={`w-full rounded-t-sm transition-all duration-200 ${
                          isPeak
                            ? 'bg-amber-500'
                            : orders > 0
                            ? 'bg-blue-400 group-hover:bg-[#2874f0]'
                            : 'bg-slate-100'
                        }`}
                        style={{ height: `${barH}px` }}
                      />
                      {/* Tooltip */}
                      <span className="absolute -top-7 hidden group-hover:block bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded shadow-sm z-10 whitespace-nowrap">
                        {h}:00 - {orders} orders
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 font-bold pt-2">
                <span>12 AM</span>
                <span>6 AM</span>
                <span>12 PM</span>
                <span>6 PM</span>
                <span>11 PM</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Row 3: Top Selling Books & Payment Methods ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Selling Products Leaderboard */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                Top Selling Guide Books
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Ranked by unit volume and gross store revenue</p>
            </div>
            <Award className="w-4 h-4 text-amber-500" />
          </div>

          <div className="space-y-3">
            {topProducts.slice(0, 7).map((tp, idx) => {
              const revPercent = Math.round((Number(tp.totalRevenue) / totalCatalogRevenue) * 100);
              return (
                <div key={idx} className="pb-3 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start text-xs gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                        idx === 0 ? 'bg-amber-100 text-amber-800' : idx === 1 ? 'bg-slate-200 text-slate-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-slate-900 truncate" title={tp.title}>
                        {tp.title}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-slate-900 block">{fmt(tp.totalRevenue)}</span>
                      <span className="text-[11px] text-slate-500">{tp.totalQty} sold ({tp.orderCount} orders)</span>
                    </div>
                  </div>
                  {/* Share indicator */}
                  <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full bg-[#2874f0] rounded-full"
                      style={{ width: `${Math.max(revPercent, 3)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Payment Methods & Order Fulfillment */}
        <div className="space-y-6">
          {/* Payment Methods Breakdown */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                  Payment Channels & Gateway Split
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">UPI, Debit/Credit Card, NetBanking & COD</p>
              </div>
              <CreditCard className="w-4 h-4 text-[#2874f0]" />
            </div>

            <div className="space-y-3">
              {paymentMethods.map((pm, idx) => {
                const percent = summary.totalRevenue > 0 ? Math.round((pm.revenue / summary.totalRevenue) * 100) : 0;
                return (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-900 capitalize">{pm.method}</span>
                      <span className="font-medium text-slate-500">
                        {pm.count} orders ({fmt(pm.revenue)})
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.max(percent, 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order Fulfillment Status */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                  Fulfillment Status Breakdown
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">Orders by delivery pipeline stage</p>
              </div>
              <Package className="w-4 h-4 text-amber-600" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {orderStatuses.map((st, idx) => (
                <div key={idx} className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block truncate">
                    {st.status}
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-base font-black text-slate-900">{st.count}</span>
                    <span className="text-[11px] font-semibold text-slate-500">{fmt(st.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ─── GST Accounting Card ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 to-[#001B3A] text-white rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold border border-emerald-500/30">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Audited Accounting Ledger</span>
          </div>
          <h3 className="font-black text-xl text-white">GST Sales Ledger & Chartered Accountant Report</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Download one-click tax-compliant CSV reports with exact customer details, state jurisdiction, ST Courier docket numbers, and itemized textbook sales for monthly GST return filing.
          </p>
        </div>
        <button
          type="button"
          onClick={onExportCsv}
          className="px-6 py-3.5 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg transition-transform hover:scale-105 cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4 text-[#2874f0]" />
          <span>DOWNLOAD GST LEDGER (.CSV)</span>
        </button>
      </div>
    </div>
  );
}
