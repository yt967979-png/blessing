'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
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
import AdminSidebar, { AdminTab, ADMIN_TAB_KEYS } from '@/components/admin/AdminSidebar';
import { adminFulfillmentBucket } from '@/lib/orderStatus';
import AdminHeader from '@/components/admin/AdminHeader';
import OverviewSection from '@/components/admin/OverviewSection';
import OrdersSection from '@/components/admin/OrdersSection';
import CourierSection from '@/components/admin/CourierSection';
import CatalogSection from '@/components/admin/CatalogSection';
import CouponsSection from '@/components/admin/CouponsSection';
import AnalyticsSection from '@/components/admin/AnalyticsSection';
import SystemHealthSection from '@/components/admin/SystemHealthSection';
import { LiveSupportSection } from '@/components/admin/LiveSupportSection';
import AbandonedCartsSection from '@/components/admin/AbandonedCartsSection';

// ─── Types ───────────────────────────────────────────────────────────────────
interface OrderItem { title: string; qty: number; price?: number; subtotal?: number; }
interface Order {
  orderId: string; id: string; customerName: string; customerPhone: string;
  customerAltPhone?: string;
  address: string; city: string; pincode: string; state?: string; totalAmount: number;
  paymentMethod: string; paymentStatus: string; courierStatus: string;
  trackingNumber: string; shipmentId: string; isOfficialAwb: boolean;
  trackingUrl: string; courierName: string; items: OrderItem[]; createdAt: string;
  isCancelled?: boolean; orderStatus?: string;
}

function parseAdminTab(raw: string | null): AdminTab {
  if (raw && (ADMIN_TAB_KEYS as string[]).includes(raw)) return raw as AdminTab;
  return 'overview';
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

/**
 * Synthesizes a crisp, celebratory cash-register / payment chime via Web Audio API.
 * Zero external audio assets, zero network latency, 100% reliable across browsers.
 */
function playAdminNewOrderBeep() {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const t0 = ctx.currentTime;

    // Helper for pure bell tones with smooth exponential decay
    const playBellTone = (freq: number, startDelay: number, duration: number, gainPeak: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t0 + startDelay);

      gain.gain.setValueAtTime(0.0001, t0 + startDelay);
      gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + startDelay + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + startDelay + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t0 + startDelay);
      osc.stop(t0 + startDelay + duration);
    };

    // Tone 1: Initial metallic register strike (988 Hz - B5)
    playBellTone(988, 0.0, 0.25, 0.22);
    playBellTone(1976, 0.0, 0.15, 0.08); // Subtle overtone

    // Tone 2: Bright ascending register chime (1319 Hz - E6)
    playBellTone(1319, 0.08, 0.35, 0.25);
    playBellTone(2638, 0.08, 0.20, 0.09); // Subtle overtone

    // Tone 3: Sparkling coin ring climax (2093 Hz - C7)
    playBellTone(2093, 0.16, 0.55, 0.28);
    playBellTone(4186, 0.16, 0.25, 0.05); // High shimmer

    // Clean up AudioContext when sound finishes
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 850);
  } catch {}
}

// ─── Main Component ───────────────────────────────────────────────────────────
function AdminPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
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

  const [activeTab, setActiveTabState] = useState<AdminTab>(() =>
    parseAdminTab(searchParams.get('tab'))
  );

  useEffect(() => {
    const fromUrl = parseAdminTab(searchParams.get('tab'));
    setActiveTabState((cur) => (cur === fromUrl ? cur : fromUrl));
  }, [searchParams]);

  const setActiveTab = useCallback(
    (tab: AdminTab) => {
      setActiveTabState(tab);
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'overview') params.delete('tab');
      else params.set('tab', tab);
      const q = params.toString();
      router.replace(q ? `/admin?${q}` : '/admin', { scroll: false });
    },
    [router, searchParams]
  );
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // ── Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const soundUnlockedRef = useRef(false);

  // Auto-unlock Web Audio on first user interaction (click, touch, keydown)
  useEffect(() => {
    const unlockAudio = () => {
      soundUnlockedRef.current = true;
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // ── Analytics state
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsRange, setAnalyticsRange] = useState(30);

  // ── Support Queue State
  const [waitingSupportCount, setWaitingSupportCount] = useState(0);

  const loadWaitingSupport = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/admin/support?view=overview', { headers: authHeaders(user) });
      if (res.ok) {
        const d = await res.json();
        setWaitingSupportCount(d.stats?.waitingCount || 0);
      }
    } catch (_) {}
  }, [user]);

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

  const loadLiveOrders = useCallback(async (opts?: { fromStream?: boolean; silent?: boolean }) => {
    if (!user?.id) return;
    if (!opts?.silent) setOrdersLoading(true);
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
            if (soundEnabled) {
              playAdminNewOrderBeep();
            }
            showToast(`🔔 New order #${newcomers[0]}${newcomers.length > 1 ? ` (+${newcomers.length - 1})` : ''}`);
            if (opts?.fromStream) setActiveTab('orders');

            // Flash tab title so admin notices immediately even if working in another tab or app
            try {
              const originalTitle = document.title;
              let flashCount = 0;
              const flashTimer = setInterval(() => {
                flashCount++;
                document.title = flashCount % 2 === 1
                  ? `🔔 (${newcomers.length}) NEW ORDER! | Blessing Admin`
                  : originalTitle;
                if (flashCount >= 10) {
                  clearInterval(flashTimer);
                  document.title = originalTitle;
                }
              }, 1000);
            } catch (_) {}
          }
          knownOrderIdsRef.current = nextIds;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (!opts?.silent) {
          setOrdersError(errData.error || errData.message || `Could not load orders (${res.status})`);
          setOrders([]);
        }
      }
    } catch (e: any) {
      if (!opts?.silent) {
        setOrdersError(e?.message || 'Network error loading orders');
        setOrders([]);
      }
    } finally {
      if (!opts?.silent) setOrdersLoading(false);
    }
  }, [user, showToast, soundEnabled, setActiveTab]);

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

  const loadAnalytics = useCallback(async (opts?: { fresh?: boolean }) => {
    if (!user?.id) return;
    setAnalyticsLoading(true);
    try {
      const q = new URLSearchParams({
        range: String(analyticsRange),
        ...(opts?.fresh ? { fresh: 'true' } : {}),
      });
      const res = await fetch(`/api/admin/analytics?${q.toString()}`, {
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

  // ── System Health / Observability
  const [systemHealth, setSystemHealth] = useState({
    healthy: true,
    deadLetterCount: 0,
    stalePendingRefunds: 0,
    dailyRefundPercent: 0,
    dailyOrdersCount: 0,
    dailyRefundsCount: 0,
    workers: [] as any[],
  });

  const loadSystemHealth = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/health?telemetry=1', {
        headers: authHeaders(user),
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setSystemHealth({
          healthy: data.status === 'ok' || data.workersHealthy === true,
          deadLetterCount: data.pendingDeadLetterWebhooks || 0,
          stalePendingRefunds: data.stalePendingRefunds || 0,
          dailyRefundPercent: data.dailyRefundPercent || 0,
          dailyOrdersCount: data.dailyOrdersCount || 0,
          dailyRefundsCount: data.dailyRefundsCount || 0,
          workers: data.workers || [],
        });
      }
    } catch (_) {}
  }, [user]);

  // Initial load
  useEffect(() => {
    if (user && isAdmin) {
      loadLiveOrders();
      loadAnalytics();
      loadLowStock();
      loadContent();
      loadSystemHealth();
      loadWaitingSupport();
    }
  }, [user, isAdmin, loadLiveOrders, loadAnalytics, loadLowStock, loadContent, loadSystemHealth, loadWaitingSupport]);

  // Real-time synchronization for stock, orders, and checkout holds
  useEffect(() => {
    if (!user || !isAdmin) return;

    let active = true;
    let esStock: EventSource | null = null;
    let esOrders: EventSource | null = null;

    try {
      esStock = new EventSource('/api/stock/stream');
      esStock.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'STOCK_CHANGED' || data.type === 'CATALOG_CHANGED') {
            loadLowStock();
            if (refreshProducts) refreshProducts(true);
          }
        } catch (_) {}
      };
    } catch (_) {}

    const connectOrdersStream = () => {
      if (!active) return;
      try {
        const streamUrl = user?.token
          ? `/api/orders/stream?token=${encodeURIComponent(user.token)}`
          : '/api/orders/stream';
        esOrders = new EventSource(streamUrl);
        esOrders.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ORDER_CREATED' || data.type === 'ORDER_UPDATED' || data.type === 'REFRESH') {
              loadLiveOrders({ fromStream: true, silent: true });
              loadLowStock();
              loadAnalytics();
              if (refreshProducts) refreshProducts(true);
            }
          } catch (_) {}
        };
        esOrders.onerror = () => {
          try {
            esOrders?.close();
          } catch (_) {}
          if (active) {
            setTimeout(connectOrdersStream, 4000);
          }
        };
      } catch (_) {}
    };
    connectOrdersStream();

    // Guaranteed safety-net dual sync:
    // Silent 4-second poll ensures admin never misses an order even if SSE stream was suspended or closed
    const pollInterval = setInterval(() => {
      loadLowStock();
      loadLiveOrders({ fromStream: true, silent: true });
    }, 4000);

    // Instant sync when administrator focuses or returns to the dashboard tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadLiveOrders({ fromStream: true, silent: true });
        loadWaitingSupport();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (esStock) esStock.close();
      if (esOrders) esOrders.close();
    };
  }, [user, isAdmin, loadLowStock, loadLiveOrders, loadAnalytics, loadWaitingSupport, refreshProducts]);

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
    return orders.filter((o) => adminFulfillmentBucket(o) === 'pending').length;
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
        waitingSupportCount={waitingSupportCount}
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
            showToast(next ? '🔔 Order chime ON (Played test chime)' : '🔕 Sound notifications muted');
          }}
          onRefresh={() => {
            void loadLiveOrders();
            void loadAnalytics();
            void loadLowStock();
            void loadContent();
            void loadWaitingSupport();
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

          {/* SECTION: LIVE CUSTOMER SUPPORT */}
          {activeTab === 'support' && (
            <LiveSupportSection
              user={user}
              onShowToast={showToast}
              playChime={playAdminNewOrderBeep}
            />
          )}

          {/* SECTION B: ORDERS */}
          {activeTab === 'orders' && (
            <OrdersSection
              orders={orders}
              ordersLoading={ordersLoading}
              products={products}
              onRefreshOrders={loadLiveOrders}
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

          {/* SECTION: ABANDONED CARTS */}
          {activeTab === 'abandoned' && (
            <AbandonedCartsSection
              authHeaders={authHeaders(user)}
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

          {/* SECTION: COUPONS & DISCOUNTS */}
          {activeTab === 'coupons' && (
            <CouponsSection />
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
            <AnalyticsSection
              analytics={analytics}
              analyticsLoading={analyticsLoading}
              analyticsRange={analyticsRange}
              onSetRange={setAnalyticsRange}
              onRefresh={() => void loadAnalytics({ fresh: true })}
              onExportCsv={handleExportCsv}
            />
          )}

          {/* SECTION H: SYSTEM HEALTH & TELEMETRY */}
          {activeTab === 'health' && (
            <SystemHealthSection
              systemHealth={systemHealth}
              onRefresh={loadSystemHealth}
              onShowToast={showToast}
              authHeaders={authHeaders(user)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminPageInner />
    </Suspense>
  );
}
