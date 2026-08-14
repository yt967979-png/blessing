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
import { openShippingLabelPrint } from '@/lib/shippingLabel';



import AdminUsersTab from '@/components/admin/AdminUsersTab';
import AdminReviewsTab from '@/components/admin/AdminReviewsTab';
import AdminSidebar, { AdminTab } from '@/components/admin/AdminSidebar';
import AdminHeader from '@/components/admin/AdminHeader';
import OverviewSection from '@/components/admin/OverviewSection';
import OrdersSection from '@/components/admin/OrdersSection';
import CourierSection from '@/components/admin/CourierSection';
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

function emptyAnalytics(days: number): Analytics {
  return {
    summary: {
      totalOrders: 0, totalRevenue: 0, avgOrderValue: 0,
      paidOrders: 0, todayOrders: 0, todayRevenue: 0,
      monthOrders: 0, monthRevenue: 0,
    },
    daily: [], paymentMethods: [], orderStatuses: [], paymentStatuses: [],
    topProducts: [], monthlyTrend: [], range: days,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const pct = (part: number, total: number) => total > 0 ? Math.round((part / total) * 100) : 0;

function MiniBar({ value, max, color = 'bg-blue-500' }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${w}%` }} />
    </div>
  );
}

// Simple SVG bar chart — no external dependency
function SimpleBarChart({ data, height = 120 }: { data: DailyPoint[]; height?: number }) {
  if (!data || !data.length) return <div className="flex items-center justify-center h-28 text-xs text-gray-400">No data yet</div>;
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
                rx={3} fill={isToday ? '#2874f0' : '#bfdbfe'} className="transition-all" />
              <title>{d.day}: {fmt(d.revenue)} ({d.orders} orders)</title>
              {i % Math.max(1, Math.floor(data.length / 7)) === 0 && (
                <text x={x + barW / 2} y={height + 16} textAnchor="middle"
                  fontSize={9} fill="#9ca3af">
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

/** Short two-tone beep for new paid orders (no external CDN / audio file). */
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
  } catch {
    /* autoplay / AudioContext blocked */
  }
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

  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // ── Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const soundUnlockedRef = useRef(false);
  const [soundHintVisible, setSoundHintVisible] = useState(false);
  const [shiprocketAwbInput, setShiprocketAwbInput] = useState<Record<string, string>>({});
  const [dispatchingOrderIds, setDispatchingOrderIds] = useState<Record<string, boolean>>({});
  const [dbStats, setDbStats] = useState({ users: 0, books: 0 });

  // ── Orders filter state
  const [orderSearch, setOrderSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // ── Analytics state
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState(30);

  // ── Catalog edit state
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editMrp, setEditMrp] = useState(0);
  const [editBadge, setEditBadge] = useState('');
  const [editBadgeEnabled, setEditBadgeEnabled] = useState(true);
  const [editDiscountEnabled, setEditDiscountEnabled] = useState(true);
  const [editStock, setEditStock] = useState(0);
  const [editStockTouched, setEditStockTouched] = useState(false);
  const [lowStockAlerts, setLowStockAlerts] = useState<{ id: string; title: string; stock: number }[]>([]);
  const [activeStockHolds, setActiveStockHolds] = useState<{ count: number; totalQty: number }>({ count: 0, totalQty: 0 });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCls, setNewCls] = useState('10th');
  const [newCat, setNewCat] = useState<'guide'>('guide');
  const [newPrice, setNewPrice] = useState(190);
  const [newMrp, setNewMrp] = useState(240);
  const [newBadge, setNewBadge] = useState('BESTSELLER');
  const [newBadgeEnabled, setNewBadgeEnabled] = useState(true);
  const [newDiscountEnabled, setNewDiscountEnabled] = useState(true);
  const [newStock, setNewStock] = useState(0);
  const [newImg, setNewImg] = useState('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80');

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
    } catch (_) { }
  }, [user]);

  // ── Data loaders
  // Do NOT call these inside startTransition: setOrdersLoading(true) would be deferred
  // while finally(false) is urgent — a fast empty DB response can leave loading stuck true.
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
          // Baseline — never beep on first admin load
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
      const timedOut = e?.name === 'TimeoutError' || /abort|timeout/i.test(String(e?.message || ''));
      setOrdersError(
        timedOut
          ? 'Orders request timed out — database pool may be stuck. On the server: sudo systemctl restart blessing'
          : (e?.message || 'Network error loading orders')
      );
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [user, showToast]);

  const loadLowStock = useCallback(async () => {
    if (!user?.id) return;
    try {
      const r = await fetch('/api/admin/users?view=low_stock', { headers: authHeaders(user), credentials: 'include' });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d.alerts)) setLowStockAlerts(d.alerts);
      }
    } catch {
      /* ignore */
    }
    try {
      const r2 = await fetch('/api/admin/users?view=stock_holds', { headers: authHeaders(user), credentials: 'include' });
      if (r2.ok) {
        const d2 = await r2.json();
        setActiveStockHolds({ count: Number(d2.count) || 0, totalQty: Number(d2.totalQty) || 0 });
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  const loadAnalytics = useCallback(async () => {
    if (!user?.id) return;
    // Urgent — do not wrap in startTransition (same race as orders: loading=true deferred, false applies first).
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      // Must exceed server ANALYTICS_TIMEOUT_MS (14s) so 503 JSON wins over AbortError.
      const res = await fetch(`/api/admin/analytics?range=${analyticsRange}`, {
        headers: authHeaders(user),
        credentials: 'include',
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json().catch(() => null);
      // Always clear skeleton: accept empty/503 payload so charts show zeros + error banner.
      if (data && typeof data === 'object' && data.summary) {
        const safeAnalyticsData: Analytics = {
          summary: {
            totalOrders: data.summary.totalOrders || 0,
            totalRevenue: data.summary.totalRevenue || 0,
            avgOrderValue: data.summary.avgOrderValue || 0,
            paidOrders: data.summary.paidOrders || 0,
            todayOrders: data.summary.todayOrders || 0,
            todayRevenue: data.summary.todayRevenue || 0,
          },
          daily: Array.isArray(data.daily) ? data.daily : [],
          paymentMethods: Array.isArray(data.paymentMethods) ? data.paymentMethods : [],
          orderStatuses: Array.isArray(data.orderStatuses) ? data.orderStatuses : [],
          paymentStatuses: Array.isArray(data.paymentStatuses) ? data.paymentStatuses : [],
          topProducts: Array.isArray(data.topProducts) ? data.topProducts : [],
          monthlyTrend: Array.isArray(data.monthlyTrend) ? data.monthlyTrend : [],
          range: data.range || analyticsRange,
          error: data.error,
          dbDisconnected: data.dbDisconnected,
        };
        setAnalytics(safeAnalyticsData);
        if (!res.ok || data.dbDisconnected || data.error) {
          setAnalyticsError(
            data.error || data.message || `Database not connected (Status ${res.status})`
          );
        }
      } else if (!res.ok) {
        setAnalytics(emptyAnalytics(analyticsRange));
        setAnalyticsError(
          (data && (data.error || data.message)) || `Database not connected (Status ${res.status})`
        );
      } else {
        setAnalytics(emptyAnalytics(analyticsRange));
      }
    } catch (e: any) {
      const timedOut = e?.name === 'TimeoutError' || /abort|timeout/i.test(String(e?.message || ''));
      setAnalytics(emptyAnalytics(analyticsRange));
      setAnalyticsError(
        timedOut
          ? 'Analytics request timed out — database pool may be stuck. On the server: sudo systemctl restart blessing'
          : (e?.message || 'Network error connecting to database')
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }, [user, analyticsRange]);

  // Unlock notification sound after admin gesture & save preference in localStorage (only prompt once)
  useEffect(() => {
    if (!user?.id || (user.role !== 'admin' && user.role !== 'super_admin')) return;
    
    // Check if admin previously enabled sound
    const storedPref = localStorage.getItem('bpg_admin_sound_enabled');
    if (storedPref === 'true') {
      soundUnlockedRef.current = true;
      setSoundHintVisible(false);
    } else {
      setSoundHintVisible(true);
    }

    const unlock = () => {
      soundUnlockedRef.current = true;
      setSoundHintVisible(false);
      try {
        localStorage.setItem('bpg_admin_sound_enabled', 'true');
      } catch {}
      try {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          void ctx.resume().then(() => ctx.close()).catch(() => {});
        }
      } catch { /* ignore */ }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('click', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('click', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('click', unlock);
    };
  }, [user?.id, user?.role]);

  // ── Initial load + SSE stream
  useEffect(() => {
    if (!user?.id || (user.role !== 'admin' && user.role !== 'super_admin')) return;
    void loadLiveOrders();
    void loadAnalytics();
    void loadLowStock();
    if (activeTab === 'content') void loadContent();
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/orders/stream');
      es.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data) as { type: string; orderId?: string };
          if (p.type === 'ORDER_CREATED' || p.type === 'ORDER_UPDATED' || p.type === 'ORDER_CANCELLED' || p.type === 'ORDER_CHANGED' || p.type === 'CANCEL') {
            void loadLiveOrders({ fromStream: p.type === 'ORDER_CREATED' });
            void loadAnalytics();
          }
        } catch { /* ignore parse errors */ }
      };
    } catch { /* SSE not supported */ }
    const interval = setInterval(() => { void loadLiveOrders(); }, 5000);
    // Auto-pull ST Courier live status for all open AWB orders (Out for Delivery → auto update)
    const runCourierSync = () => {
      if (!user?.token) return;
      fetch('/api/courier/sync', {
        method: 'POST',
        headers: authHeaders(user),
        credentials: 'include',
        body: JSON.stringify({}),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.updated > 0) {
            showToast(`🚚 ST Courier auto-updated ${d.updated} order(s)`);
            void loadLiveOrders();
          }
        })
        .catch(() => { });
    };
    runCourierSync();
    const courierSync = setInterval(runCourierSync, 10000);
    fetch('/api/db-status', { headers: authHeaders(user), credentials: 'include' }).then((r) => r.json()).then((d: { tableRowCounts?: { users?: number; books?: number } }) => {
      if (d.tableRowCounts) {
        const u = d.tableRowCounts.users || 0;
        const b = d.tableRowCounts.books || 0;
        setTimeout(() => setDbStats({ users: u, books: b }), 0);
      }
    }).catch(() => { });
    return () => { clearInterval(interval); clearInterval(courierSync); if (es) es.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-bind when admin session identity changes
  }, [loadLiveOrders, loadAnalytics, loadLowStock, user?.id, user?.token, user?.role]);

  // Reload analytics when range changes
  useEffect(() => { if (activeTab === 'analytics') void loadAnalytics(); }, [analyticsRange, activeTab, loadAnalytics]);

  useEffect(() => {
    if (activeTab === 'content') void loadContent();
  }, [activeTab, loadContent]);



  // ── Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filterStatus !== 'all' && (o.courierStatus || '').toLowerCase() !== filterStatus.toLowerCase()) return false;
      if (filterPayment === 'online') {
        const pm = (o.paymentMethod || '').toLowerCase();
        // Razorpay-only shop — exclude any legacy COD rows from "Online" filter
        if (pm.includes('cod')) return false;
      }
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase();
        const hit = (o.orderId || '').toLowerCase().includes(q)
          || (o.customerName || '').toLowerCase().includes(q)
          || (o.customerPhone || '').includes(q)
          || (o.city || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (filterDateFrom) {
        const from = new Date(filterDateFrom).getTime();
        const orderDate = new Date(o.createdAt || 0).getTime();
        if (orderDate < from) return false;
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo).getTime() + 86400000;
        const orderDate = new Date(o.createdAt || 0).getTime();
        if (orderDate > to) return false;
      }
      return true;
    });
  }, [orders, filterStatus, filterPayment, orderSearch, filterDateFrom, filterDateTo]);

  const totalRevenue = orders.reduce((s, o) => {
    if (isOrderCancelled(o.courierStatus)) return s;
    return s + Number(o.totalAmount || 0);
  }, 0);
  const activeOrderCount = orders.filter(
    (o) => !isOrderCancelled(o.courierStatus)
  ).length;
  const uniqueStatuses = useMemo(() => ['all', ...Array.from(new Set(orders.map((o) => o.courierStatus).filter(Boolean)))], [orders]);

  // ── Catalog handlers
  const startEditing = (p: { id: string | number; price: number; mrp: number; badge?: string; stock?: number }) => {
    setEditingId(p.id);
    setEditPrice(p.price);
    setEditMrp(p.mrp);
    setEditBadge(p.badge || '');
    setEditBadgeEnabled(!!p.badge);
    setEditDiscountEnabled(p.price < p.mrp);
    setEditStock(typeof p.stock === 'number' && Number.isFinite(p.stock) ? Math.max(0, Math.floor(p.stock)) : 0);
    setEditStockTouched(false);
  };
  const saveProductChanges = async (id: string | number) => {
    const mrp = Number(editMrp);
    const fp = editDiscountEnabled ? Number(editPrice) : mrp;
    const hasDiscount = editDiscountEnabled && fp > 0 && fp < mrp;
    const fb = editBadgeEnabled ? (editBadge.trim() || 'BESTSELLER') : '';
    const payload: {
      price: number;
      mrp: number;
      discount: number;
      badge: string;
      hasDiscount: boolean;
      stock?: number;
    } = {
      price: hasDiscount ? fp : mrp,
      mrp,
      discount: hasDiscount ? Math.round(((mrp - fp) / mrp) * 100) : 0,
      badge: fb,
      hasDiscount,
    };
    // Only rewrite inventory when admin actually edited the Stock field
    if (editStockTouched) {
      payload.stock = Math.max(0, Math.floor(Number(editStock) || 0));
    }
    await updateProductInDb(id, payload);
    void loadLowStock();
    setEditingId(null);
    setEditStockTouched(false);
  };
  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const mrp = Number(newMrp);
    const fp = newDiscountEnabled ? Number(newPrice) : mrp;
    const hasDiscount = newDiscountEnabled && fp > 0 && fp < mrp;
    const stockQty = Math.max(0, Math.floor(Number(newStock) || 0));
    addNewProductToDb({
      title: newTitle,
      cls: newCls,
      category: newCat,
      price: hasDiscount ? fp : mrp,
      mrp,
      discount: hasDiscount ? Math.round(((mrp - fp) / mrp) * 100) : 0,
      badge: newBadgeEnabled ? newBadge : '',
      image: newImg,
      stock: stockQty,
    });
    setShowAddForm(false);
    setNewTitle('');
    setNewStock(0);
  };
  const toggleStock = async (id: string | number, cur: boolean) => {
    const p = products.find((x) => String(x.id) === String(id));
    const nextInStock = !Boolean(cur);
    if (!nextInStock) {
      // Mark unavailable without wiping the saved qty — restores cleanly later
      await updateProductInDb(id, { inStock: false });
      showToast('Marked out of stock (quantity preserved)');
      return;
    }
    const qty = typeof p?.stock === 'number' ? p.stock : 0;
    if (qty <= 0) {
      showToast('Set stock quantity first (edit → Stock), then turn On');
      return;
    }
    await updateProductInDb(id, { inStock: true, stock: qty });
    showToast(`Back in stock (${qty} left)`);
  };
  const handleDeleteProduct = async (id: string | number) => {
    if (!confirm('Delete this book permanently?')) return;
    await deleteProductFromDb(id);
  };
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    showToast('⏳ Uploading image...');
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('folder', 'blessing_power_guides');
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      if (r.ok) { const d = await r.json(); if (d.url) { setNewImg(d.url); showToast('☁️ Uploaded!'); return; } }
    } catch (_) { }
    const reader = new FileReader(); reader.onloadend = () => { if (typeof reader.result === 'string') { setNewImg(reader.result); showToast('✅ Image ready'); } }; reader.readAsDataURL(file);
  };

  // ── Dispatch + auto ST Courier sync
  const handleDispatch = async (orderId: string) => {
    const order = orders.find((x) => x.orderId === orderId);
    const st = (order?.courierStatus || '').toLowerCase();
    if (isOrderCancelled(order?.courierStatus)) {
      showToast('❌ Cannot add AWB — order is cancelled');
      return;
    }
    if (st.includes('awaiting confirmation')) {
      showToast('❌ Order still pending confirmation — pack after it shows Confirmed');
      return;
    }
    const awb = (shiprocketAwbInput[orderId] ?? '').trim();
    if (!awb) { alert('Enter ST Courier docket number first.'); return; }
    setDispatchingOrderIds((p) => ({ ...p, [orderId]: true }));
    showToast('Verifying docket on ST Courier…');
    try {
      const vr = await fetch(
        `/api/courier/track?docket=${encodeURIComponent(awb)}&orderId=${encodeURIComponent(orderId)}`,
        { headers: authHeaders(user) }
      );
      const vd = await vr.json();
      if (!vr.ok || !vd.isValid || !vd.verified) {
        showToast(`❌ ${vd.error || 'Invalid docket'}`);
        alert(`Docket verification failed:\n${vd.error || 'Not found in ST Courier network.'}`);
        return;
      }
      await fetch('/api/orders/timeline', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ orderId, status: 'HANDED_TO_ST_COURIER', awbNumber: awb }),
      });
      // Pull live status immediately (may already be In Transit / OFD)
      await fetch('/api/courier/sync', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({ docket: awb }),
      });
      showToast(`✅ Dispatched #${orderId} — auto-sync ON for this AWB`);
      loadLiveOrders();
    } catch (_) {
      showToast('❌ Dispatch error');
    } finally {
      setDispatchingOrderIds((p) => ({ ...p, [orderId]: false }));
    }
  };

  const handleClearAwb = async (orderId: string) => {
    if (!user || !confirm(`Clear AWB number from order #${orderId}?`)) return;
    setDispatchingOrderIds((p) => ({ ...p, [orderId]: true }));
    try {
      const res = await fetch(`/api/courier/track?orderId=${encodeURIComponent(orderId)}&action=clear`, {
        headers: authHeaders(user),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast(`🗑️ AWB cleared for #${orderId}`);
        setShiprocketAwbInput((p) => ({ ...p, [orderId]: '' }));
        loadLiveOrders();
      } else {
        showToast(`❌ ${data.error || 'Failed to clear AWB'}`);
      }
    } catch {
      showToast('❌ Clear AWB network error');
    } finally {
      setDispatchingOrderIds((p) => ({ ...p, [orderId]: false }));
    }
  };

  // ── Export Comprehensive Excel / CSV Report (Date Filtered + Full Product Breakdown)
  const handleExportCsv = () => {
    if (!filteredOrders.length) {
      showToast('⚠️ No orders match the selected date / filter criteria');
      return;
    }

    const headers = [
      'Order ID',
      'Date & Time',
      'Customer Name',
      'Phone Number',
      'Alt Phone',
      'Full Shipping Address',
      'City',
      'Pincode',
      'State',
      'Total Amount (INR)',
      'Payment Status',
      'Courier Status',
      'ST Courier AWB Docket',
      'Total Books Qty',
      'Book Titles Sold',
      'Itemized Product Breakdown',
      'ST Courier Tracking Link',
    ];

    const formatCell = (val: any) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };

    const csvRows = filteredOrders.map((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      const totalQty = items.reduce((sum: number, it: any) => sum + (Number(it.qty) || 1), 0);
      const bookTitles = items.map((it: any) => it.title || 'Guide Book').join(' | ');
      const itemizedBreakdown = items
        .map((it: any) => `${it.title || 'Guide Book'} (Qty: ${it.qty || 1}${it.price ? `, ₹${it.price}` : ''})`)
        .join('; ');

      const trackingUrl = o.trackingNumber && !o.trackingNumber.startsWith('SHP-')
        ? `https://stcourier.com/track/shipment?docket=${o.trackingNumber}`
        : '';

      return [
        formatCell(o.orderId),
        formatCell(o.createdAt),
        formatCell(o.customerName),
        formatCell(o.customerPhone),
        formatCell(o.customerAltPhone || ''),
        formatCell(o.address),
        formatCell(o.city),
        formatCell(o.pincode),
        formatCell(o.state || 'Tamil Nadu'),
        o.totalAmount,
        formatCell('PAID ONLINE'),
        formatCell(o.courierStatus),
        formatCell(o.trackingNumber || ''),
        totalQty,
        formatCell(bookTitles),
        formatCell(itemizedBreakdown),
        formatCell(trackingUrl),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...csvRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const fromStr = filterDateFrom ? filterDateFrom : 'All';
    const toStr = filterDateTo ? filterDateTo : 'All';
    const filename = `Blessing_Power_Guide_Orders_${fromStr}_to_${toStr}_${Date.now()}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`📥 Excel report downloaded: ${filename}`);
  };

  const ORDER_STATUS_ACTIONS: { label: string; statusKey: string; orderStatus: string }[] = [
    { label: 'Packed', statusKey: 'PACKED', orderStatus: 'Packed' },
    { label: 'Hand to Courier', statusKey: 'HANDED_TO_ST_COURIER', orderStatus: 'Handed to ST Courier' },
    { label: 'In Transit', statusKey: 'IN_TRANSIT', orderStatus: 'In Transit' },
    { label: 'Out for Delivery', statusKey: 'OUT_FOR_DELIVERY', orderStatus: 'Out for Delivery' },
    { label: 'Delivered', statusKey: 'DELIVERED', orderStatus: 'Delivered' },
    { label: 'Cancel', statusKey: 'CANCELLED', orderStatus: 'Cancelled' },
  ];

  const handleUpdateOrderStatus = async (o: Order, statusKey: string, orderStatus: string) => {
    const awaiting = (o.courierStatus || '').toLowerCase().includes('awaiting confirmation');
    if (awaiting && statusKey !== 'CANCELLED') {
      showToast('❌ Order still pending confirmation — refresh; paid orders auto-confirm');
      return;
    }
    if (statusKey === 'CANCELLED') {
      if (
        !confirm(
          `Cancel order ${o.orderId}?\n\nA full Razorpay refund will be issued to the customer’s original payment method before cancel completes. If refund fails, cancel is aborted — retry after fixing Razorpay. Stock will be restored.`
        )
      )
        return;
      setUpdatingStatusId(`${o.orderId}-${statusKey}`);
      try {
        const r = await fetch('/api/orders/cancel', {
          method: 'POST',
          headers: authHeaders(user),
          body: JSON.stringify({ orderId: o.orderId, reason: 'Cancelled by admin' }),
        });
        const d = await r.json();
        if (!r.ok) {
          showToast(`❌ ${d.error || 'Cancel failed'}`);
          return;
        }
        showToast(
          d.refunded
            ? `✅ Order ${o.orderId} cancelled + Razorpay refund issued`
            : `✅ Order ${o.orderId} cancelled`
        );
        setOrders((prev) =>
          prev.map((item) =>
            item.orderId === o.orderId || item.id === o.id
              ? {
                  ...item,
                  orderStatus: 'Cancelled',
                  courierStatus: 'Cancelled',
                  isCancelled: true,
                  paymentStatus: d.refunded ? 'Refunded' : item.paymentStatus,
                }
              : item
          )
        );
        loadLiveOrders();
        void loadAnalytics();
      } catch {
        showToast('❌ Cancel failed');
      } finally {
        setUpdatingStatusId(null);
      }
      return;
    }
    setUpdatingStatusId(`${o.orderId}-${statusKey}`);
    showToast(`Updating → ${orderStatus}…`);
    try {
      const r = await fetch('/api/orders/timeline', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({
          orderId: o.orderId,
          status: statusKey,
          awbNumber: o.trackingNumber && !o.trackingNumber.startsWith('SHP-') ? o.trackingNumber : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        showToast(`❌ ${d.error || 'Failed to update'}`);
        return;
      }
      await fetch('/api/orders', {
        method: 'PATCH',
        headers: authHeaders(user),
        body: JSON.stringify({
          orderId: o.orderId,
          status: orderStatus,
          awbNumber: o.trackingNumber && !o.trackingNumber.startsWith('SHP-') ? o.trackingNumber : undefined,
        }),
      });
      showToast(`✅ Status updated to ${orderStatus}`);
      setOrders((prev) =>
        prev.map((item) =>
          item.orderId === o.orderId || item.id === o.id
            ? {
                ...item,
                orderStatus: orderStatus,
                courierStatus: orderStatus,
              }
            : item
        )
      );
      loadLiveOrders();
    } catch {
      showToast('❌ Failed to update status');
    } finally {
      setUpdatingStatusId(null);
    }
  };
  const handlePrintLabel = (o: Order) => {
    if (isOrderCancelled(o.courierStatus)) {
      if (!confirm(`Order ${o.orderId} is CANCELLED.\nPrint label with CANCELLED watermark anyway?`)) return;
    }
    // Default: 1 sticker on A4 (normal home printer paper).
    openShippingLabelPrint({
      orderId: o.orderId,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      customerAltPhone: o.customerAltPhone,
      address: o.address,
      city: o.city,
      pincode: o.pincode,
      state: o.state,
      totalAmount: o.totalAmount,
      paymentMethod: o.paymentMethod,
      courierStatus: o.courierStatus,
      trackingNumber: o.trackingNumber,
      courierName: o.courierName,
      createdAt: o.createdAt,
      items: o.items,
    }, 'a4');
  };

  const handleBatchPrintLabels = () => {
    const activeOrders = filteredOrders.filter((o) => !isOrderCancelled(o.courierStatus));
    if (activeOrders.length === 0) {
      showToast('No active orders to print');
      return;
    }
    showToast(`🖨️ Opening ${activeOrders.length} shipping labels…`);
    activeOrders.forEach((o, idx) => {
      setTimeout(() => {
        openShippingLabelPrint({
          orderId: o.orderId,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          customerAltPhone: o.customerAltPhone,
          address: o.address,
          city: o.city,
          pincode: o.pincode,
          state: o.state,
          totalAmount: o.totalAmount,
          paymentMethod: o.paymentMethod,
          courierStatus: o.courierStatus,
          trackingNumber: o.trackingNumber,
          courierName: o.courierName,
          createdAt: o.createdAt,
          items: o.items,
        }, 'a4');
      }, idx * 400);
    });
  };

  // ── Access gate
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#FAF7F0] flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md border border-[#55607A]/20 p-8 text-center space-y-5">
          <div className="w-14 h-14 bg-red-50 text-[#C43B3B] rounded-full flex items-center justify-center mx-auto border border-red-200">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-serif font-bold text-xl text-[#1E2A4A]">The Ledger — Admin Access Required</h2>
            <p className="text-xs text-[#55607A] mt-2 leading-relaxed">
              {user ? 'Your account does not hold administrator clearance.' : 'Sign in with an authorized administrator account to open operations.'}
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="w-full py-2.5 bg-[#1E2A4A] hover:bg-[#D98C2B] text-white font-mono font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Storefront</span>
            </button>
            <button
              type="button"
              onClick={() => {
                logoutUser();
                setIsAuthOpen(true);
                router.push('/');
              }}
              className="w-full py-2.5 bg-[#FAF7F0] hover:bg-slate-100 text-[#1E2A4A] font-mono font-bold text-xs rounded-xl border border-[#55607A]/20 transition-colors cursor-pointer"
            >
              Switch Administrator Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF7F0] text-[#1E2A4A] flex flex-col font-sans">
      {/* ── Fixed Ink Indigo Sidebar ── */}
      <AdminSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingOrdersCount={
          orders.filter((o) => {
            const s = String(o.courierStatus || o.paymentStatus || '').toLowerCase();
            return (
              (s.includes('confirm') || s.includes('placed') || s.includes('paid')) &&
              !s.includes('pack') &&
              !s.includes('handed') &&
              !s.includes('transit') &&
              !s.includes('deliver') &&
              !s.includes('cancel')
            );
          }).length
        }
        lowStockCount={lowStockAlerts.length}
        systemDegraded={!systemHealth.healthy || systemHealth.deadLetterCount > 0}
        isOpenMobile={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onLogout={() => {
          logoutUser();
          router.push('/');
        }}
      />

      {/* ── Main Operations Canvas ── */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Sticky Header with Live Observability & Audio Chime */}
        <AdminHeader
          activeTab={activeTab}
          systemHealthy={systemHealth.healthy}
          deadLetterCount={systemHealth.deadLetterCount}
          soundEnabled={soundEnabled}
          onToggleSound={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            soundUnlockedRef.current = next;
            try {
              localStorage.setItem('bpg_admin_sound_enabled', String(next));
            } catch {}
            if (next) playAdminNewOrderBeep();
            showToast(next ? '🔔 Order sound notifications enabled' : '🔕 Sound muted');
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
              onAssignAwb={async (orderId, awb) => {
                setShiprocketAwbInput((p) => ({ ...p, [orderId]: awb }));
                await handleDispatch(orderId);
              }}
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

          {/* SECTION C: CATALOG & INVENTORY */}
          {(activeTab === 'catalog' || activeTab === 'inventory') && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div>
                  <h2 className="font-serif font-bold text-base text-[#1E2A4A]">Book Catalog & Stock Ledger</h2>
                  <p className="text-xs text-[#55607A] mt-0.5">Manage editions, pricing, inventory thresholds, and CSV imports</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-bold text-[#1E2A4A] bg-[#FAF7F0] hover:bg-slate-100 border border-[#55607A]/20 rounded-lg transition-colors cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import CSV</span>
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        showToast('⏳ Importing CSV…');
                        try {
                          const csv = await file.text();
                          const r = await fetch('/api/products/bulk', {
                            method: 'POST',
                            headers: authHeaders(user),
                            body: JSON.stringify({ csv }),
                          });
                          const d = await r.json();
                          if (!r.ok) {
                            showToast(`❌ ${d.error || 'Import failed'}`);
                            return;
                          }
                          showToast(`✅ Imported ${d.imported || 0} book(s)`);
                          window.location.reload();
                        } catch {
                          showToast('❌ CSV import failed');
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-bold text-white bg-[#1E2A4A] hover:bg-[#D98C2B] rounded-lg transition-colors cursor-pointer shadow-xs"
                  >
                    {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    <span>{showAddForm ? 'Close' : 'Add New Book'}</span>
                  </button>
                </div>
              </div>

              {showAddForm && (
                <div className="bg-white rounded-xl border border-[#D98C2B] p-5 shadow-sm animate-fade-slide-up">
                  <h3 className="font-serif font-bold text-sm text-[#1E2A4A] mb-4 flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[#D98C2B]" />
                    <span>Add New Publication to Catalog</span>
                  </h3>
                  <form onSubmit={handleCreateProduct} className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                    <div className="col-span-2">
                      <label className="block font-mono font-bold text-[#55607A] mb-1">Book Title *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. 10th Standard Mathematics Guide (Tamil & English Medium)"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B]"
                      />
                    </div>
                    <div>
                      <label className="block font-mono font-bold text-[#55607A] mb-1">Class / Standard</label>
                      <select
                        value={newCls}
                        onChange={(e) => setNewCls(e.target.value)}
                        className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B] cursor-pointer"
                      >
                        {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => (
                          <option key={c} value={c}>
                            {c} Std
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-mono font-bold text-[#55607A] mb-1">Offer Price (₹)</label>
                      <input
                        type="number"
                        required
                        value={newPrice}
                        onChange={(e) => setNewPrice(Number(e.target.value))}
                        className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-mono font-bold text-[#55607A] mb-1">MRP Price (₹)</label>
                      <input
                        type="number"
                        required
                        value={newMrp}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setNewMrp(v);
                          if (!newDiscountEnabled) setNewPrice(v);
                        }}
                        className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-mono font-bold text-[#55607A] mb-1">Initial Stock (Copies) *</label>
                      <input
                        type="number"
                        required
                        min={0}
                        step={1}
                        value={newStock}
                        onChange={(e) => setNewStock(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                        className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-mono font-bold text-[#55607A] mb-1">Cover Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        className="w-full text-xs text-gray-500 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:font-mono file:font-bold file:bg-[#1E2A4A] file:text-white cursor-pointer"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-4 flex items-center justify-between pt-2">
                      {newImg && (
                        <img src={newImg} alt="" className="w-10 h-10 object-contain rounded border border-slate-200 bg-white p-0.5" />
                      )}
                      <button
                        type="submit"
                        className="px-5 py-2 text-xs font-mono font-bold text-white bg-[#D98C2B] hover:bg-[#c27c24] rounded-lg transition-colors cursor-pointer ml-auto shadow-xs"
                      >
                        Publish to Store
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Products Table */}
              <div className="bg-white rounded-xl border border-[#55607A]/20 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#FAF7F0] border-b border-[#55607A]/20 text-[11px] font-mono font-bold text-[#55607A] uppercase">
                        <th className="p-3">Book Title</th>
                        <th className="p-3">Class</th>
                        <th className="p-3">Price / MRP</th>
                        <th className="p-3">Stock Count</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {products.map((p) => {
                        const isEditing = editingId === p.id;
                        const disc = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
                        return (
                          <tr key={p.id} className="hover:bg-[#FAF7F0]/60 transition-colors">
                            <td className="p-3">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={p.image}
                                  alt={p.title}
                                  className="w-8 h-8 object-contain bg-white border border-slate-200 rounded p-0.5 shrink-0"
                                />
                                <span className="font-bold text-[#1E2A4A] truncate max-w-xs">{p.title}</span>
                              </div>
                            </td>
                            <td className="p-3 font-mono text-[#55607A]">{p.cls}</td>
                            <td className="p-3 font-mono">
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    value={editPrice}
                                    onChange={(e) => setEditPrice(Number(e.target.value))}
                                    className="w-16 px-1.5 py-1 border border-slate-300 rounded text-xs font-mono"
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-[#1E2A4A]">₹{p.price}</span>
                                  {disc > 0 && <span className="text-[10px] text-green-600 font-bold">({disc}% OFF)</span>}
                                </div>
                              )}
                            </td>
                            <td className="p-3 font-mono">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={editStock}
                                  onChange={(e) => {
                                    setEditStock(Math.max(0, Math.floor(Number(e.target.value) || 0)));
                                    setEditStockTouched(true);
                                  }}
                                  className="w-16 px-1.5 py-1 border border-[#D98C2B] rounded text-xs font-mono"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => toggleStock(p.id, !!p.inStock)}
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                    !p.inStock || (p.stock ?? 0) <= 0
                                      ? 'bg-red-50 text-red-600 border-red-200'
                                      : (p.stock ?? 99) <= 5
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  {p.inStock ? `${p.stock ?? '—'} IN STOCK` : 'OUT OF STOCK'}
                                </button>
                              )}
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isEditing ? (
                                  <button
                                    type="button"
                                    onClick={() => saveProductChanges(p.id)}
                                    className="px-2.5 py-1 bg-[#2F9E60] hover:bg-emerald-700 text-white rounded text-[11px] font-mono font-bold cursor-pointer"
                                  >
                                    Save
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startEditing(p)}
                                    className="px-2.5 py-1 bg-[#FAF7F0] hover:bg-slate-200 text-[#1E2A4A] border border-slate-300 rounded text-[11px] font-mono font-bold cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SECTION D: CUSTOMERS */}
          {activeTab === 'users' && user && (
            <AdminUsersTab user={user} showToast={showToast} />
          )}

          {/* SECTION E: REVIEWS */}
          {activeTab === 'reviews' && user && (
            <AdminReviewsTab user={user} showToast={showToast} />
          )}

          {/* SECTION E: CONTENT & FAQS */}
          {activeTab === 'content' && (
            <div className="max-w-xl mx-auto bg-white rounded-xl border border-[#55607A]/20 p-5 space-y-4 shadow-xs">
              <h3 className="font-serif font-bold text-sm text-[#1E2A4A]">Customer FAQs & Help Articles</h3>
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
                className="space-y-2"
              >
                <input
                  value={newFaqQ}
                  onChange={(e) => setNewFaqQ(e.target.value)}
                  placeholder="Question / Title"
                  required
                  className="w-full px-3 py-2 text-xs bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B]"
                />
                <textarea
                  value={newFaqA}
                  onChange={(e) => setNewFaqA(e.target.value)}
                  placeholder="Answer explanation"
                  required
                  rows={3}
                  className="w-full px-3 py-2 text-xs bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B]"
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
                  <p className="text-xs text-[#55607A] mt-0.5">Financial reports, daily trends, and GST compliance exports</p>
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
                        Payment Breakdown
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
