'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Package, ShoppingCart, Users, ArrowLeft, Edit2, Check,
  Plus, Trash2, Truck, Send, ShieldCheck,
  Download, X, Search, RefreshCw, TrendingUp, IndianRupee,
  Box, Clock, CheckCircle2, LogOut, BarChart2,
  CreditCard, Smartphone, Star, AlertCircle, Tag, Upload,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';

import { BrandLogo } from '@/components/ui/BrandLogo';
import AdminUsersTab from '@/components/admin/AdminUsersTab';
import AdminReviewsTab from '@/components/admin/AdminReviewsTab';
import AdminSidebar, { AdminTab } from '@/components/admin/AdminSidebar';
import AdminHeader from '@/components/admin/AdminHeader';
import OverviewSection from '@/components/admin/OverviewSection';
import OrdersSection from '@/components/admin/OrdersSection';
import CourierSection from '@/components/admin/CourierSection';
import CatalogSection from '@/components/admin/CatalogSection';

// ─── Types ───────────────────────────────────────────────────────────────────
interface OrderItem { title: string; qty: number; price?: number; subtotal?: number; }
interface Order {
  orderId: string; id: string; customerName: string; customerPhone: string;
  customerAltPhone?: string;
  address: string; city: string; pincode: string; state?: string; totalAmount: number;
  paymentMethod: string; paymentStatus: string; courierStatus: string;
  trackingNumber: string; shipmentId: string; isOfficialAwb: boolean;
  trackingUrl: string; courierName: string; items: OrderItem[]; createdAt: string;
}
interface AnalyticsSummary {
  totalOrders: number; totalRevenue: number; avgOrderValue: number;
  paidOrders: number; todayOrders: number; todayRevenue: number;
  monthOrders?: number; monthRevenue?: number;
}
interface DailyPoint { day: string; orders: number; revenue: number; }
interface MethodBreakdown { method: string; count: number; revenue: number; }
interface StatusBreakdown { status: string; count: number; revenue: number; }
interface TopProduct { title: string; totalQty: number; totalRevenue: number; orderCount: number; }
interface Analytics {
  summary: AnalyticsSummary; daily: DailyPoint[]; paymentMethods: MethodBreakdown[];
  orderStatuses: StatusBreakdown[]; paymentStatuses: StatusBreakdown[];
  topProducts: TopProduct[]; monthlyTrend: { month: string; orders: number; revenue: number }[];
  range: number;
  error?: string;
  dbDisconnected?: boolean;
}

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Simple SVG bar chart for revenue analytics
function SimpleBarChart({ data, height = 140 }: { data: DailyPoint[]; height?: number }) {
  if (!data || !data.length) return <div className="flex items-center justify-center h-32 text-xs text-slate-400">No sales recorded in this period</div>;
  const maxRev = Math.max(...data.map((d) => d.revenue), 1);
  const barW = Math.max(6, Math.min(32, Math.floor(580 / data.length) - 4));
  const gap = Math.max(3, Math.floor(580 / data.length) - barW);
  return (
    <div className="w-full overflow-x-auto pb-1">
      <svg width={Math.max(data.length * (barW + gap), 320)} height={height + 28} className="block">
        {data.map((d, i) => {
          const barH = Math.max(3, Math.round((d.revenue / maxRev) * height));
          const x = i * (barW + gap);
          const y = height - barH;
          const isToday = i === data.length - 1;
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={4}
                fill={isToday ? '#2874f0' : '#93c5fd'}
                className="transition-all hover:fill-[#0044aa]"
              />
              <title>{d.day}: {fmt(d.revenue)} ({d.orders} orders)</title>
              {i % Math.max(1, Math.floor(data.length / 7)) === 0 && (
                <text x={x + barW / 2} y={height + 18} textAnchor="middle"
                  fontSize={10} fill="#64748b" fontWeight="500">
                  {new Date(d.day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Short chime for new paid orders. */
function playAdminNewOrderBeep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t0 = ctx.currentTime;
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.setValueAtTime(1175, t0 + 0.12);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
    osc.start(t0);
    osc.stop(t0 + 0.4);
    osc.onended = () => {
      void ctx.close().catch(() => {});
    };
  } catch {}
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const {
    user,
    setIsAuthOpen,
    products: storeProducts,
    updateProductInDb,
    addNewProductToDb,
    deleteProductFromDb,
    showToast,
    logoutUser,
    refreshProducts,
  } = useStore();
  const products = storeProducts || [];

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // ── Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const soundUnlockedRef = useRef(false);

  // ── Analytics state
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsRange, setAnalyticsRange] = useState(30);

  // ── Low stock & holds state (Real-time live sync)
  const [lowStockAlerts, setLowStockAlerts] = useState<{ id: string; title: string; stock: number; cls?: string; subject?: string }[]>([]);
  const [activeStockHolds, setActiveStockHolds] = useState<{ count: number; totalQty: number; list?: any[] }>({ count: 0, totalQty: 0, list: [] });

  // ── Content (FAQs)
  const [faqs, setFaqs] = useState<any[]>([]);
  const [newFaqQ, setNewFaqQ] = useState('');
  const [newFaqA, setNewFaqA] = useState('');

  const isAdmin = !!user && (user.role === 'admin' || user.role === 'super_admin');

  const loadContent = useCallback(async () => {
    if (!user) return;
    try {
      const fRes = await fetch('/api/content?type=faq&admin=1', { headers: authHeaders(user) });
      if (fRes.ok) {
        const d = await fRes.json();
        if (Array.isArray(d)) setFaqs(d);
      }
    } catch (_) {}
  }, [user]);

  const loadLiveOrders = useCallback(async (opts?: { fromStream?: boolean }) => {
    if (!user?.id) return;
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const res = await fetch(`/api/orders`, {
        headers: authHeaders(user),
        credentials: 'include',
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const data = await res.json();
        const list: Order[] = Array.isArray(data) ? data : [];
        setOrders(list);

        const nextIds = new Set(list.map((o) => String(o.orderId || o.id || '')).filter(Boolean));
        if (knownOrderIdsRef.current === null) {
          knownOrderIdsRef.current = nextIds;
        } else {
          const newcomers: string[] = [];
          for (const id of nextIds) {
            if (!knownOrderIdsRef.current.has(id)) newcomers.push(id);
          }
          if (newcomers.length > 0) {
            if (soundUnlockedRef.current) playAdminNewOrderBeep();
            showToast(`🔔 New order ${newcomers[0]}${newcomers.length > 1 ? ` (+${newcomers.length - 1})` : ''}`);
            if (opts?.fromStream) setActiveTab('orders');
          }
          knownOrderIdsRef.current = nextIds;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setOrdersError(errData.error || errData.message || `Could not load orders (${res.status})`);
        setOrders([]);
      }
    } catch (e: any) {
      setOrdersError(e?.message || 'Network error loading orders');
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [user, showToast]);

  const loadLowStock = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch('/api/admin/users?view=low_stock', {
        headers: authHeaders(user),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.alerts)) setLowStockAlerts(data.alerts);
        if (data?.holds) setActiveStockHolds(data.holds);
      }
    } catch {}
  }, [user]);

  const loadAnalytics = useCallback(async () => {
    if (!user?.id) return;
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/admin/analytics?days=${analyticsRange}`, {
        headers: authHeaders(user),
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {}
    finally {
      setAnalyticsLoading(false);
    }
  }, [user, analyticsRange]);

  // Initial load
  useEffect(() => {
    if (user && isAdmin) {
      loadLiveOrders();
      loadAnalytics();
      loadLowStock();
      loadContent();
    }
  }, [user, isAdmin, loadLiveOrders, loadAnalytics, loadLowStock, loadContent]);

  // Real-time synchronization for stock, orders, and checkout holds
  useEffect(() => {
    if (!user || !isAdmin) return;

    let esStock: EventSource | null = null;
    let esOrders: EventSource | null = null;

    try {
      esStock = new EventSource('/api/stock/stream');
      esStock.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'STOCK_CHANGED' || data.type === 'CATALOG_CHANGED') {
            loadLowStock();
          }
        } catch (_) {}
      };
    } catch (_) {}

    try {
      esOrders = new EventSource('/api/orders/stream');
      esOrders.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'ORDER_CREATED' || data.type === 'ORDER_UPDATED' || data.type === 'REFRESH') {
            loadLiveOrders({ fromStream: true });
            loadLowStock();
            loadAnalytics();
            if (refreshProducts) refreshProducts(true);
          }
        } catch (_) {}
      };
    } catch (_) {}

    // Polling fallback every 10s for low-stock rack count and active holds
    const pollInterval = setInterval(() => {
      loadLowStock();
    }, 10000);

    return () => {
      clearInterval(pollInterval);
      if (esStock) esStock.close();
      if (esOrders) esOrders.close();
    };
  }, [user, isAdmin, loadLowStock, loadLiveOrders, loadAnalytics, refreshProducts]);

  // Manual stock hold release handler (Restores reserved stock immediately)
  const handleReleaseHold = async (holdGroupId: string, bookTitle: string) => {
    if (!user) return;
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ action: 'release_hold', holdGroupId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🔓 Hold released for "${bookTitle}". Copies restored to rack!`);
        loadLowStock();
        if (refreshProducts) refreshProducts(true);
      } else {
        showToast(`❌ ${data.error || 'Failed to release hold'}`);
      }
    } catch {
      showToast('❌ Network error releasing hold');
    }
  };

  // Order status update handler
  const handleUpdateOrderStatus = async (order: Order, newStatus: string, displayLabel?: string) => {
    if (!user) return;
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({
          orderId: order.orderId || order.id,
          status: newStatus,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`✅ Order #${order.orderId} marked as ${displayLabel || newStatus}`);
        loadLiveOrders();
      } else {
        showToast(`❌ ${data.error || 'Update failed'}`);
      }
    } catch {
      showToast('❌ Network error updating order status');
    }
  };

  // AWB assignment handler
  const handleAssignAwb = async (orderId: string, awb: string) => {
    if (!user) return;
    const cleanAwb = awb.trim().toUpperCase();
    if (!cleanAwb) {
      showToast('Please enter an ST Courier docket number');
      return;
    }
    try {
      const res = await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({
          orderId,
          trackingNumber: cleanAwb,
          courierName: 'ST Courier',
          trackingUrl: `https://stcourier.com/track/view?docket=${encodeURIComponent(cleanAwb)}`,
          status: 'DISPATCHED',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`🚚 ST Courier AWB ${cleanAwb} assigned`);
        loadLiveOrders();
      } else {
        showToast(`❌ ${data.error || 'Failed to assign AWB'}`);
      }
    } catch {
      showToast('❌ Network error assigning AWB');
    }
  };

  // Cancel order handler
  const handleCancelOrder = async (orderId: string) => {
    if (!user) return;
    const reason = prompt('Please enter cancellation reason for student records:');
    if (!reason) return;
    try {
      const res = await fetch('/api/orders/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ orderId, reason }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`🛑 Order #${orderId} cancelled & stock released`);
        loadLiveOrders();
      } else {
        showToast(`❌ ${data.error || 'Failed to cancel order'}`);
      }
    } catch {
      showToast('❌ Network error cancelling order');
    }
  };

  // CSV Export for GST & Audit
  const handleExportCsv = () => {
    if (!orders || orders.length === 0) {
      showToast('No orders to export');
      return;
    }
    const headers = ['Order ID', 'Date', 'Customer Name', 'Phone', 'City', 'Pincode', 'Amount (INR)', 'Payment Method', 'Payment Status', 'Courier Status', 'ST Courier AWB'];
    const rows = orders.map((o) => [
      `"${o.orderId}"`,
      `"${new Date(o.createdAt).toLocaleDateString('en-IN')}"`,
      `"${o.customerName.replace(/"/g, '""')}"`,
      `"${o.customerPhone}"`,
      `"${o.city}"`,
      `"${o.pincode}"`,
      o.totalAmount,
      `"${o.paymentMethod}"`,
      `"${o.paymentStatus}"`,
      `"${o.courierStatus}"`,
      `"${o.trackingNumber || ''}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Blessing_Power_Guide_GST_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('📥 GST Ledger CSV exported successfully');
  };

  // Pending count for sidebar badge
  const pendingCount = useMemo(() => {
    return orders.filter((o) => {
      const s = String(o.courierStatus || o.paymentStatus || '').toLowerCase();
      return !s.includes('pack') && !s.includes('transit') && !s.includes('deliver') && !s.includes('cancel');
    }).length;
  }, [orders]);

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl border border-slate-200 max-w-md w-full text-center space-y-4 shadow-xl">
          <BrandLogo size={56} className="mx-auto shadow-md" />
          <h1 className="font-bold text-xl text-slate-900">Blessing Power Guide — Staff Portal</h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            Administrator authentication required to manage bookstore orders, book inventory, and courier dispatches.
          </p>
          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            className="w-full py-3 bg-[#2874f0] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-md"
          >
            Sign In with Staff Account
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-xs text-slate-500 hover:text-slate-900 font-medium block mx-auto cursor-pointer"
          >
            ← Return to Bookstore
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex">
      {/* ─── Sidebar ─────────────────────────────────────────────────────────── */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingOrdersCount={pendingCount}
        lowStockCount={lowStockAlerts.length}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onLogout={() => {
          logoutUser();
          router.push('/');
        }}
      />

      {/* ─── Main Content Canvas ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Sticky Header */}
        <AdminHeader
          activeTab={activeTab}
          soundEnabled={soundEnabled}
          onToggleSound={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            soundUnlockedRef.current = next;
            if (next) playAdminNewOrderBeep();
            showToast(next ? '🔔 Order sound notifications ON' : '🔕 Sound muted');
          }}
          onRefresh={() => {
            void loadLiveOrders();
            void loadAnalytics();
            void loadLowStock();
            void loadContent();
            showToast('🔄 Store records refreshed');
          }}
          isRefreshing={ordersLoading || analyticsLoading}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          userEmail={user?.email}
        />

        {/* Dynamic Section Views */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
          {/* SECTION A: OVERVIEW */}
          {activeTab === 'overview' && (
            <OverviewSection
              analytics={analytics}
              orders={orders}
              lowStockItems={lowStockAlerts}
              activeStockHolds={activeStockHolds}
              onNavigate={(tab) => setActiveTab(tab)}
              onReleaseHold={handleReleaseHold}
            />
          )}

          {/* SECTION B: ORDERS */}
          {activeTab === 'orders' && (
            <OrdersSection
              orders={orders}
              ordersLoading={ordersLoading}
              onUpdateStatus={async (orderId, newStatus) => {
                const o = orders.find((x) => x.orderId === orderId || x.id === orderId);
                if (o) {
                  await handleUpdateOrderStatus(
                    o,
                    newStatus.toUpperCase().replace(/\s+/g, '_'),
                    newStatus
                  );
                }
              }}
              onAssignAwb={handleAssignAwb}
              onCancelOrder={handleCancelOrder}
              onShowToast={showToast}
            />
          )}

          {/* SECTION C: COURIER & LOGISTICS */}
          {activeTab === 'courier' && (
            <CourierSection
              orders={orders}
              onRefresh={loadLiveOrders}
              onShowToast={showToast}
              authHeaders={authHeaders(user)}
            />
          )}

          {/* SECTION D: CATALOG & STOCK */}
          {activeTab === 'catalog' && (
            <CatalogSection
              products={products}
              activeStockHolds={activeStockHolds}
              onReleaseHold={handleReleaseHold}
              onUpdateProduct={updateProductInDb}
              onAddNewProduct={addNewProductToDb}
              onDeleteProduct={deleteProductFromDb}
              onShowToast={showToast}
              authHeaders={authHeaders(user)}
            />
          )}

          {/* SECTION E: CUSTOMERS */}
          {activeTab === 'users' && user && (
            <AdminUsersTab user={user} showToast={showToast} />
          )}

          {/* SECTION F: REVIEWS & FAQS */}
          {activeTab === 'reviews' && (
            <div className="space-y-6">
              {user && <AdminReviewsTab user={user} showToast={showToast} />}

              {/* FAQs & Store Notices */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
                <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-base text-slate-900">Student FAQs & Store Notices</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Edit help center questions and student guide announcements</p>
                  </div>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = await fetch('/api/content', {
                      method: 'POST',
                      headers: authHeaders(user),
                      body: JSON.stringify({ question: newFaqQ, answer: newFaqA, display_order: faqs.length + 1 }),
                    });
                    if (r.ok) {
                      showToast('✅ FAQ published to storefront');
                      setNewFaqQ('');
                      setNewFaqA('');
                      loadContent();
                    } else {
                      const d = await r.json();
                      showToast(`❌ ${d.error || 'Failed'}`);
                    }
                  }}
                  className="space-y-3 text-xs"
                >
                  <input
                    value={newFaqQ}
                    onChange={(e) => setNewFaqQ(e.target.value)}
                    placeholder="Question or Notice Title (e.g. When will Class 10 Tamil guide dispatch?)"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white transition-all text-slate-900"
                  />
                  <textarea
                    value={newFaqA}
                    onChange={(e) => setNewFaqA(e.target.value)}
                    placeholder="Clear answer or delivery explanation..."
                    required
                    rows={3}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white transition-all text-slate-900"
                  />
                  <button
                    type="submit"
                    className="px-5 py-2.5 text-xs font-bold text-white bg-[#2874f0] hover:bg-blue-700 rounded-xl transition-colors cursor-pointer shadow-xs"
                  >
                    Publish FAQ
                  </button>
                </form>

                <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pt-2">
                  {faqs.map((f) => (
                    <div key={f.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50/70 hover:bg-slate-50 transition-colors">
                      <div className="flex justify-between gap-3">
                        <p className="text-xs font-bold text-slate-900">{f.question}</p>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm('Delete this FAQ from website?')) return;
                            await fetch(`/api/content?id=${encodeURIComponent(f.id)}`, { method: 'DELETE', headers: authHeaders(user) });
                            loadContent();
                            showToast('🗑️ FAQ deleted');
                          }}
                          className="text-xs font-bold text-red-600 hover:underline cursor-pointer shrink-0"
                        >
                          Delete
                        </button>
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{f.answer}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SECTION G: REVENUE & GST REPORTS */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
                <div>
                  <h2 className="font-bold text-base text-slate-900">Revenue Analytics & GST Tax Ledger</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Sales breakdown, payment trends, and 1-click accountant tax export</p>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download GST Ledger CSV</span>
                  </button>
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    {[7, 14, 30, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setAnalyticsRange(d)}
                        className={`px-3 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          analyticsRange === d ? 'bg-[#2874f0] text-white shadow-xs' : 'text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {analytics && (
                <>
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                    <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider mb-4">
                      Daily Sales Volume ({analytics.range} Days)
                    </h3>
                    <SimpleBarChart data={analytics.daily} height={140} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                      <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider mb-4">
                        Top Selling Guide Books
                      </h3>
                      <div className="space-y-3">
                        {analytics.topProducts.slice(0, 5).map((tp, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 last:border-0 last:pb-0">
                            <span className="font-bold text-slate-900 truncate max-w-[220px]">{tp.title}</span>
                            <span className="font-medium text-slate-500">{tp.totalQty} sold ({fmt(tp.totalRevenue)})</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                      <h3 className="font-bold text-xs text-slate-500 uppercase tracking-wider mb-4">
                        Payment Methods
                      </h3>
                      <div className="space-y-3">
                        {analytics.paymentMethods.map((pm, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs pb-2 border-b border-slate-100 last:border-0 last:pb-0">
                            <span className="font-bold text-slate-900">{pm.method}</span>
                            <span className="font-medium text-slate-500">{pm.count} orders ({fmt(pm.revenue)})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
