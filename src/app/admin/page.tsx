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
import { isOrderCancelled } from '@/lib/orderStatus';
import { BrandLogo } from '@/components/ui/BrandLogo';

import AdminUsersTab from '@/components/admin/AdminUsersTab';
import AdminReviewsTab from '@/components/admin/AdminReviewsTab';
import AdminSidebar, { AdminTab } from '@/components/admin/AdminSidebar';
import AdminHeader from '@/components/admin/AdminHeader';
import OverviewSection from '@/components/admin/OverviewSection';
import OrdersSection from '@/components/admin/OrdersSection';
import CourierSection from '@/components/admin/CourierSection';
import CatalogSection from '@/components/admin/CatalogSection';
import SystemHealthSection from '@/components/admin/SystemHealthSection';

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
function SimpleBarChart({ data, height = 120 }: { data: DailyPoint[]; height?: number }) {
  if (!data || !data.length) return <div className="flex items-center justify-center h-28 text-xs text-[#55607A]">No sales records yet</div>;
  const maxRev = Math.max(...data.map((d) => d.revenue), 1);
  const barW = Math.max(4, Math.min(28, Math.floor(560 / data.length) - 3));
  const gap = Math.max(2, Math.floor(560 / data.length) - barW);
  return (
    <div className="w-full overflow-x-auto pb-1">
      <svg width={Math.max(data.length * (barW + gap), 300)} height={height + 28} className="block">
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.revenue / maxRev) * height));
          const x = i * (barW + gap);
          const y = height - barH;
          const isToday = i === data.length - 1;
          return (
            <g key={d.day}>
              <rect x={x} y={y} width={barW} height={barH}
                rx={3} fill={isToday ? '#D98C2B' : '#1E2A4A'} className="transition-all opacity-80 hover:opacity-100" />
              <title>{d.day}: {fmt(d.revenue)} ({d.orders} orders)</title>
              {i % Math.max(1, Math.floor(data.length / 7)) === 0 && (
                <text x={x + barW / 2} y={height + 16} textAnchor="middle"
                  fontSize={9} fill="#55607A">
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

/** Short two-tone chime for new paid orders (AudioContext). */
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
  const { user, setIsAuthOpen, products: storeProducts, updateProductInDb, addNewProductToDb, deleteProductFromDb, showToast, logoutUser } = useStore();
  const products = storeProducts || [];

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [systemHealth, setSystemHealth] = useState({
    healthy: true,
    deadLetterCount: 0,
    stalePendingRefunds: 0,
    dailyRefundPercent: 0,
    dailyOrdersCount: 0,
    dailyRefundsCount: 0,
  });

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

  // ── Low stock & holds state
  const [lowStockAlerts, setLowStockAlerts] = useState<{ id: string; title: string; stock: number }[]>([]);
  const [activeStockHolds, setActiveStockHolds] = useState<{ count: number; totalQty: number }>({ count: 0, totalQty: 0 });

  // ── Content (FAQs)
  const [faqs, setFaqs] = useState<any[]>([]);
  const [newFaqQ, setNewFaqQ] = useState('');
  const [newFaqA, setNewFaqA] = useState('');

  const isAdmin = !!user && (user.role === 'admin' || user.role === 'super_admin');

  const loadHealthData = useCallback(async () => {
    try {
      const res = await fetch('/api/health?details=1');
      if (res.ok) {
        const data = await res.json();
        setSystemHealth({
          healthy: data.status === 'ok' && data.workersHealthy !== false,
          deadLetterCount: data.pendingDeadLetterWebhooks || 0,
          stalePendingRefunds: data.stalePendingRefunds || 0,
          dailyRefundPercent: data.dailyRefundPercent || 0,
          dailyOrdersCount: data.dailyOrdersCount || 0,
          dailyRefundsCount: data.dailyRefundsCount || 0,
        });
      }
    } catch {}
  }, []);

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
      loadHealthData();
      loadContent();
    }
  }, [user, isAdmin, loadLiveOrders, loadAnalytics, loadLowStock, loadHealthData, loadContent]);

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
        showToast(`🚚 AWB ${cleanAwb} assigned via ST Courier`);
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
    link.setAttribute('download', `Blessing_Power_Guide_Ledger_${new Date().toISOString().slice(0, 10)}.csv`);
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
      <div className="min-h-screen bg-[#1E2A4A] flex flex-col items-center justify-center p-4 text-white">
        <div className="bg-[#FAF7F0] text-[#1E2A4A] p-8 rounded-2xl border border-[#D98C2B] max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-12 h-12 bg-[#1E2A4A] text-[#D98C2B] rounded-xl flex items-center justify-center mx-auto shadow-md">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h1 className="font-serif font-black text-xl">The Ledger — Admin Portal</h1>
          <p className="text-xs text-[#55607A]">
            Staff access required. Please sign in with an authorized Blessing Power Guide administrator account.
          </p>
          <button
            type="button"
            onClick={() => setIsAuthOpen(true)}
            className="w-full py-3 bg-[#1E2A4A] hover:bg-[#D98C2B] text-white rounded-xl text-xs font-mono font-bold transition-colors cursor-pointer shadow-md"
          >
            Staff Authentication
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="text-xs text-[#55607A] hover:text-[#1E2A4A] font-semibold block mx-auto cursor-pointer"
          >
            ← Return to Bookstore
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F0] text-slate-800 flex">
      {/* ─── Sidebar ─────────────────────────────────────────────────────────── */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingOrdersCount={pendingCount}
        lowStockCount={lowStockAlerts.length}
        systemDegraded={!systemHealth.healthy || systemHealth.deadLetterCount > 0}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onLogout={() => {
          logoutUser();
          router.push('/');
        }}
      />

      {/* ─── Main Content Canvas ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Sticky Admin Header */}
        <AdminHeader
          activeTab={activeTab}
          systemHealthy={systemHealth.healthy}
          deadLetterCount={systemHealth.deadLetterCount}
          soundEnabled={soundEnabled}
          onToggleSound={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            soundUnlockedRef.current = next;
            if (next) playAdminNewOrderBeep();
            showToast(next ? '🔔 Order chime enabled' : '🔕 Chime muted');
          }}
          onRefresh={() => {
            void loadLiveOrders();
            void loadAnalytics();
            void loadLowStock();
            void loadHealthData();
            showToast('🔄 Ledger refreshed');
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
              systemHealth={systemHealth}
              onNavigate={(tab) => setActiveTab(tab)}
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

          {/* SECTION C & H: COURIER & LOGISTICS */}
          {activeTab === 'courier' && (
            <CourierSection
              orders={orders}
              onRefresh={loadLiveOrders}
              onShowToast={showToast}
              authHeaders={authHeaders(user)}
            />
          )}

          {/* SECTION C & INVENTORY: CATALOG & STOCK */}
          {(activeTab === 'catalog' || activeTab === 'inventory') && (
            <CatalogSection
              products={products}
              onUpdateProduct={updateProductInDb}
              onAddNewProduct={addNewProductToDb}
              onDeleteProduct={deleteProductFromDb}
              onShowToast={showToast}
              authHeaders={authHeaders(user)}
            />
          )}

          {/* SECTION D: CUSTOMERS */}
          {activeTab === 'users' && user && (
            <AdminUsersTab user={user} showToast={showToast} />
          )}

          {/* SECTION E: REVIEWS */}
          {activeTab === 'reviews' && user && (
            <AdminReviewsTab user={user} showToast={showToast} />
          )}

          {/* SECTION F: CONTENT & FAQS */}
          {activeTab === 'content' && (
            <div className="max-w-xl mx-auto bg-white rounded-xl border border-[#55607A]/20 p-5 space-y-4 shadow-xs">
              <h3 className="font-serif font-bold text-sm text-[#1E2A4A]">Customer FAQs & Store Notices</h3>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await fetch('/api/content', {
                    method: 'POST',
                    headers: authHeaders(user),
                    body: JSON.stringify({ question: newFaqQ, answer: newFaqA, display_order: faqs.length + 1 }),
                  });
                  if (r.ok) {
                    showToast('✅ FAQ added');
                    setNewFaqQ('');
                    setNewFaqA('');
                    loadContent();
                  } else {
                    const d = await r.json();
                    showToast(`❌ ${d.error || 'Failed'}`);
                  }
                }}
                className="space-y-2.5 text-xs"
              >
                <input
                  value={newFaqQ}
                  onChange={(e) => setNewFaqQ(e.target.value)}
                  placeholder="Question / Notice Title"
                  required
                  className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B]"
                />
                <textarea
                  value={newFaqA}
                  onChange={(e) => setNewFaqA(e.target.value)}
                  placeholder="Detailed answer or policy explanation"
                  required
                  rows={3}
                  className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B]"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-mono font-bold text-white bg-[#1E2A4A] hover:bg-[#D98C2B] rounded-lg transition-colors cursor-pointer"
                >
                  Publish FAQ
                </button>
              </form>
              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                {faqs.map((f) => (
                  <div key={f.id} className="border border-slate-100 rounded-lg p-3 bg-[#FAF7F0]/60">
                    <div className="flex justify-between gap-2">
                      <p className="text-xs font-bold text-[#1E2A4A]">{f.question}</p>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm('Delete FAQ?')) return;
                          await fetch(`/api/content?id=${encodeURIComponent(f.id)}`, { method: 'DELETE', headers: authHeaders(user) });
                          loadContent();
                        }}
                        className="text-[10px] font-mono font-bold text-red-600 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="text-[11px] text-[#55607A] mt-1">{f.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION G: REVENUE & GST LEDGER */}
          {activeTab === 'analytics' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div>
                  <h2 className="font-serif font-bold text-base text-[#1E2A4A]">Revenue Analytics & GST Ledger</h2>
                  <p className="text-xs text-[#55607A] mt-0.5">Financial trends, sales breakdown, and tax compliance export</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="px-3.5 py-2 bg-[#2F9E60] hover:bg-emerald-700 text-white rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export GST Ledger CSV</span>
                  </button>
                  <div className="flex items-center gap-1 bg-[#FAF7F0] p-1 rounded-lg border border-[#55607A]/20">
                    {[7, 14, 30, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setAnalyticsRange(d)}
                        className={`px-2.5 py-1 text-xs font-mono font-bold rounded transition-colors cursor-pointer ${
                          analyticsRange === d ? 'bg-[#1E2A4A] text-white' : 'text-[#55607A] hover:bg-slate-200'
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
                  <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
                    <h3 className="font-serif font-bold text-xs text-[#1E2A4A] uppercase mb-3">
                      Daily Revenue ({analytics.range} Days)
                    </h3>
                    <SimpleBarChart data={analytics.daily} height={120} />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
                      <h3 className="font-serif font-bold text-xs text-[#1E2A4A] uppercase mb-3">
                        Top Selling Guide Books
                      </h3>
                      <div className="space-y-2">
                        {analytics.topProducts.slice(0, 5).map((tp, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="font-bold text-[#1E2A4A] truncate max-w-[200px]">{tp.title}</span>
                            <span className="font-mono text-[#55607A]">{tp.totalQty} sold ({fmt(tp.totalRevenue)})</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
                      <h3 className="font-serif font-bold text-xs text-[#1E2A4A] uppercase mb-3">
                        Payment Method Breakdown
                      </h3>
                      <div className="space-y-2">
                        {analytics.paymentMethods.map((pm, idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs">
                            <span className="font-bold text-[#1E2A4A]">{pm.method}</span>
                            <span className="font-mono text-[#55607A]">{pm.count} orders ({fmt(pm.revenue)})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* SECTION I: SYSTEM HEALTH & LOGS */}
          {activeTab === 'system' && (
            <SystemHealthSection
              systemHealth={systemHealth}
              onRefresh={loadHealthData}
              onShowToast={showToast}
              authHeaders={authHeaders(user)}
            />
          )}
        </main>
      </div>
    </div>
  );
}
