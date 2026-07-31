'use client';

import React, { useState, useEffect, useCallback, useMemo, startTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Package, ShoppingCart, Users, ArrowLeft, Edit2, Check,
  Plus, Trash2, MessageSquare, Truck, Send, ShieldCheck,
  Download, X, Search, RefreshCw, TrendingUp, IndianRupee,
  Box, Clock, CheckCircle2, LogOut, BarChart2,
  CreditCard, Banknote, Smartphone, Star, AlertCircle, Tag, Gift, Upload,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { openShippingLabelPrint } from '@/lib/shippingLabel';

const AdminWhatsAppTab = dynamic(() => import('@/components/admin/AdminWhatsAppTab'), {
  ssr: false,
  loading: () => <p className="text-center text-sm text-gray-500 py-12">Loading WhatsApp…</p>,
});

const AdminCouponsTab = dynamic(() => import('@/components/admin/AdminCouponsTab'), {
  ssr: false,
  loading: () => <p className="text-center text-sm text-gray-500 py-12">Loading coupons…</p>,
});

const AdminUsersTab = dynamic(() => import('@/components/admin/AdminUsersTab'), {
  ssr: false,
  loading: () => <p className="text-center text-sm text-gray-500 py-12">Loading customers…</p>,
});

const AdminReviewsTab = dynamic(() => import('@/components/admin/AdminReviewsTab'), {
  ssr: false,
  loading: () => <p className="text-center text-sm text-gray-500 py-12">Loading reviews…</p>,
});

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
  paidOrders: number; codOrders: number; todayOrders: number; todayRevenue: number;
}
interface DailyPoint { day: string; orders: number; revenue: number; onlineRevenue: number; codRevenue: number; }
interface MethodBreakdown { method: string; count: number; revenue: number; }
interface StatusBreakdown { status: string; count: number; revenue: number; }
interface TopProduct { title: string; totalQty: number; totalRevenue: number; orderCount: number; }
interface Analytics {
  summary: AnalyticsSummary; daily: DailyPoint[]; paymentMethods: MethodBreakdown[];
  orderStatuses: StatusBreakdown[]; paymentStatuses: StatusBreakdown[];
  topProducts: TopProduct[]; monthlyTrend: { month: string; orders: number; revenue: number }[];
  range: number;
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
  if (!data.length) return <div className="flex items-center justify-center h-28 text-xs text-gray-400">No data yet</div>;
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminPage() {
  const router = useRouter();
  const { user, setIsAuthOpen, products, updateProductInDb, addNewProductToDb, deleteProductFromDb, showToast, logoutUser } = useStore();

  type Tab = 'analytics' | 'orders' | 'catalog' | 'coupons' | 'users' | 'reviews' | 'content' | 'whatsapp';
  const [activeTab, setActiveTab] = useState<Tab>('analytics');

  // ── WhatsApp state
  const [waStatus, setWaStatus] = useState<{ status: string; connected?: boolean; qrImage?: string; pairingCode?: string; message?: string; linkedPhone?: string }>({ status: 'LOADING', connected: false });
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);

  // ── Orders state
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
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
  const [editStock, setEditStock] = useState(50);
  const [lowStockAlerts, setLowStockAlerts] = useState<{ id: string; title: string; stock: number }[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCls, setNewCls] = useState('10th');
  const [newCat, setNewCat] = useState<'guide' | 'combo'>('guide');
  const [newPrice, setNewPrice] = useState(190);
  const [newMrp, setNewMrp] = useState(240);
  const [newBadge, setNewBadge] = useState('BESTSELLER');
  const [newBadgeEnabled, setNewBadgeEnabled] = useState(true);
  const [newDiscountEnabled, setNewDiscountEnabled] = useState(true);
  const [newImg, setNewImg] = useState('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80');

  // ── Content (FAQs)
  const [faqs, setFaqs] = useState<any[]>([]);
  const [newFaqQ, setNewFaqQ] = useState('');
  const [newFaqA, setNewFaqA] = useState('');

  const isAdmin = !!user && user.role === 'admin';

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
  const loadLiveOrders = useCallback(async () => {
    if (!user?.id) return;
    setOrdersLoading(true);
    try {
      const res = await fetch(`/api/orders`, {
        headers: authHeaders(user),
      });
      if (res.ok) { const data = await res.json(); if (Array.isArray(data)) setOrders(data); }
    } catch {
      // network error — silently ignore
    } finally { setOrdersLoading(false); }
  }, [user]);

  const loadLowStock = useCallback(async () => {
    if (!user?.id) return;
    try {
      const r = await fetch('/api/admin/users?view=low_stock', { headers: authHeaders(user) });
      if (r.ok) {
        const d = await r.json();
        if (Array.isArray(d.alerts)) setLowStockAlerts(d.alerts);
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  const loadAnalytics = useCallback(async () => {
    if (!user?.id) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    try {
      const res = await fetch(`/api/admin/analytics?range=${analyticsRange}`, {
        headers: authHeaders(user),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      } else {
        const errData = await res.json().catch(() => ({}));
        setAnalyticsError(errData.error || errData.message || `Database not connected (Status ${res.status})`);
      }
    } catch (e: any) {
      setAnalyticsError(e?.message || 'Network error connecting to database');
    } finally { setAnalyticsLoading(false); }
  }, [user, analyticsRange]);

  // ── Initial load + SSE stream
  useEffect(() => {
    startTransition(() => { void loadLiveOrders(); void loadAnalytics(); void loadLowStock(); });
    if (activeTab === 'content') startTransition(() => { void loadContent(); });
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/orders/stream');
      es.onmessage = (e) => {
        try {
          const p = JSON.parse(e.data) as { type: string };
          if (p.type === 'ORDER_UPDATED') { startTransition(() => { void loadLiveOrders(); void loadAnalytics(); }); }
        } catch { /* ignore parse errors */ }
      };
    } catch { /* SSE not supported */ }
    const interval = setInterval(() => { void loadLiveOrders(); }, 45000);
    // Auto-pull ST Courier live status for all open AWB orders (Out for Delivery → auto update)
    const runCourierSync = () => {
      if (!user?.token) return;
      fetch('/api/courier/sync', {
        method: 'POST',
        headers: authHeaders(user),
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
    const courierSync = setInterval(runCourierSync, 45000);
    fetch('/api/db-status').then((r) => r.json()).then((d: { tableRowCounts?: { users?: number; books?: number } }) => {
      if (d.tableRowCounts) {
        const u = d.tableRowCounts.users || 0;
        const b = d.tableRowCounts.books || 0;
        setTimeout(() => setDbStats({ users: u, books: b }), 0);
      }
    }).catch(() => { });
    return () => { clearInterval(interval); clearInterval(courierSync); if (es) es.close(); };
  }, [loadLiveOrders, loadAnalytics, user]);

  // Reload analytics when range changes
  useEffect(() => { if (activeTab === 'analytics') startTransition(() => { void loadAnalytics(); }); }, [analyticsRange, activeTab, loadAnalytics]);

  useEffect(() => {
    if (activeTab === 'content') startTransition(() => { void loadContent(); });
  }, [activeTab, loadContent]);

  // WhatsApp polling — only while WhatsApp tab is open
  useEffect(() => {
    if (activeTab !== 'whatsapp') return;
    const fetchWa = async () => {
      try {
        const r = await fetch('/api/whatsapp/qr', { headers: authHeaders(user) });
        if (r.ok) {
          const data = await r.json();
          setWaStatus(data);
          if (data.pairingCode && /[A-Za-z0-9]{4}-[A-Za-z0-9]{4}/.test(String(data.pairingCode))) {
            setWaPairingCode(data.pairingCode);
          }
        }
      } catch {
        setWaStatus({ status: 'INITIALIZING' });
      }
    };
    fetchWa();
    const iv = setInterval(fetchWa, 4000);
    return () => clearInterval(iv);
  }, [activeTab, user]);

  const handleUnlinkWhatsApp = async () => {
    if (!confirm('Unlink WhatsApp session? A new QR will be generated.')) return;
    try {
      const r = await fetch('/api/whatsapp/qr', { method: 'DELETE', headers: authHeaders(user) });
      if (r.ok) {
        showToast('✅ Unlinked — wait for new QR');
        setWaStatus({ status: 'INITIALIZING', message: 'Generating new QR…' });
        setWaPairingCode(null);
      }
    } catch (_) {
      showToast('❌ Unlink failed');
    }
  };

  const handleRefreshWhatsAppQr = async () => {
    showToast('⏳ Generating new QR…');
    setWaPairingCode(null);
    try {
      const r = await fetch('/api/whatsapp/qr?refresh=1', { headers: authHeaders(user) });
      const d = await r.json();
      if (r.ok) {
        setWaStatus(d);
        showToast(d.qrImage ? '✅ Scan the QR now' : '⏳ QR loading — keep tab open');
      } else {
        showToast(`⚠️ ${d.error || 'Could not refresh QR'}`);
      }
    } catch (_) {
      showToast('❌ QR refresh failed');
    }
  };

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waPhoneInput) return;
    showToast('⏳ Generating pairing code...');
    try {
      const r = await fetch(`/api/whatsapp/qr?phone=${encodeURIComponent(waPhoneInput)}`, {
        headers: authHeaders(user),
      });
      const d = await r.json();
      const code = String(d.pairingCode || '');
      const ok = d.success && code && !/^\d{10,15}$/.test(code.replace(/-/g, ''));
      if (ok) {
        setWaPairingCode(code);
        showToast(`✅ Enter code on phone: ${code}`);
      } else {
        setWaPairingCode(null);
        showToast(`⚠️ ${d.error || 'Use QR scan instead'}`);
      }
    } catch (_) {
      showToast('❌ Error');
    }
  };

  // ── Filtered orders
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filterStatus !== 'all' && (o.courierStatus || '').toLowerCase() !== filterStatus.toLowerCase()) return false;
      if (filterPayment !== 'all') {
        const pm = (o.paymentMethod || '').toLowerCase();
        if (filterPayment === 'cod' && !pm.includes('cod')) return false;
        if (filterPayment === 'online' && pm.includes('cod')) return false;
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
    if ((o.courierStatus || '').toLowerCase().includes('cancel')) return s;
    return s + Number(o.totalAmount || 0);
  }, 0);
  const activeOrderCount = orders.filter(
    (o) => !(o.courierStatus || '').toLowerCase().includes('cancel')
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
    setEditStock(Number(p.stock ?? 50));
  };
  const saveProductChanges = async (id: string | number) => {
    const mrp = Number(editMrp);
    const fp = editDiscountEnabled ? Number(editPrice) : mrp;
    const hasDiscount = editDiscountEnabled && fp > 0 && fp < mrp;
    const fb = editBadgeEnabled ? (editBadge.trim() || 'BESTSELLER') : '';
    await updateProductInDb(id, {
      price: hasDiscount ? fp : mrp,
      mrp,
      discount: hasDiscount ? Math.round(((mrp - fp) / mrp) * 100) : 0,
      badge: fb,
      hasDiscount,
      stock: Math.max(0, Math.floor(Number(editStock) || 0)),
    });
    void loadLowStock();
    setEditingId(null);
  };
  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const mrp = Number(newMrp);
    const fp = newDiscountEnabled ? Number(newPrice) : mrp;
    const hasDiscount = newDiscountEnabled && fp > 0 && fp < mrp;
    addNewProductToDb({
      title: newTitle,
      cls: newCls,
      category: newCat,
      price: hasDiscount ? fp : mrp,
      mrp,
      discount: hasDiscount ? Math.round(((mrp - fp) / mrp) * 100) : 0,
      badge: newBadgeEnabled ? newBadge : '',
      image: newImg,
    });
    setShowAddForm(false); setNewTitle('');
  };
  const toggleStock = async (id: string | number, cur: boolean) => {
    await updateProductInDb(id, { inStock: !Boolean(cur) });
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
    if ((order?.courierStatus || '').toLowerCase().includes('cancel')) {
      showToast('❌ Cannot add AWB — order is cancelled');
      return;
    }
    const awb = (shiprocketAwbInput[orderId] ?? '').trim();
    if (!awb) { alert('Enter ST Courier docket number first.'); return; }
    setDispatchingOrderIds((p) => ({ ...p, [orderId]: true }));
    showToast('Verifying docket on ST Courier…');
    try {
      const vr = await fetch(`/api/courier/track?docket=${encodeURIComponent(awb)}&orderId=${encodeURIComponent(orderId)}`);
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

  // ── Export CSV
  const handleExportCsv = () => {
    if (!filteredOrders.length) { showToast('⚠️ No orders to export'); return; }
    const rows = [
      ['Order ID', 'Date', 'Customer', 'Phone', 'City', 'Amount', 'Payment', 'Status', 'AWB'].join(','),
      ...filteredOrders.map((o) => [`"${o.orderId}"`, `"${o.createdAt}"`, `"${(o.customerName || '').replace(/"/g, '""')}"`, `"${o.customerPhone}"`, `"${o.city}"`, o.totalAmount, `"${o.paymentMethod}"`, `"${o.courierStatus}"`, `"${o.trackingNumber || ''}"`].join(',')),
    ].join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURI(rows); a.download = `orders_${Date.now()}.csv`; a.click();
    showToast('📥 CSV exported');
  };

  // ── WhatsApp
  const handleResendWhatsApp = async (o: Order) => {
    if (!o.customerPhone) { showToast('❌ No customer phone on this order'); return; }
    if ((o.courierStatus || '').toLowerCase().includes('cancel')) {
      // Only send cancel confirmation — never "order confirmed"
      showToast('📲 Sending cancel confirmation…');
    } else {
      showToast('📲 Sending WhatsApp from linked admin number...');
    }
    try {
      const r = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: authHeaders(user),
        body: JSON.stringify({
          step: (o.courierStatus || 'ORDER_PLACED').toUpperCase().replace(/\s+/g, '_'),
          orderId: o.orderId,
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          totalAmount: o.totalAmount,
          trackingNumber: o.trackingNumber,
          items: o.items,
        }),
      });
      const d = await r.json();
      if (r.ok && d.provider === 'BAILEYS_IN_PROCESS') {
        showToast(`✅ WhatsApp sent to +91 ${o.customerPhone}`);
      } else if (d.whatsappLink) {
        showToast('⚠️ WhatsApp not linked — open WhatsApp tab and scan QR first');
        window.open(d.whatsappLink, '_blank');
      } else {
        showToast(`❌ ${d.error || 'Failed to send WhatsApp'}`);
      }
    } catch {
      showToast('❌ WhatsApp send failed');
    }
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
    if (statusKey === 'CANCELLED') {
      if (!confirm(`Cancel order ${o.orderId}? Stock will be restored.`)) return;
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
        showToast(`✅ Order ${o.orderId} cancelled`);
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
    showToast(`Updating → ${orderStatus} & notifying customer...`);
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
          skipWhatsApp: true,
        }),
      });
      showToast(`✅ ${orderStatus} — WhatsApp sent to customer`);
      loadLiveOrders();
    } catch {
      showToast('❌ Failed to update status');
    } finally {
      setUpdatingStatusId(null);
    }
  };
  const handlePrintLabel = (o: Order) => {
    if ((o.courierStatus || '').toLowerCase().includes('cancel')) {
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

  // ── Access gate
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-[#f1f3f6] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center space-y-5">
          <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto"><ShieldCheck className="w-7 h-7" /></div>
          <div>
            <h2 className="font-semibold text-xl text-gray-900">Admin Access Required</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              {user ? <></> : 'You must be signed in with an administrator account.'}
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <button onClick={() => router.push('/')} className="w-full py-2.5 bg-[#2874f0] hover:bg-[#1a5dc8] text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Return to Store</button>
            <button onClick={() => { logoutUser(); setIsAuthOpen(true); router.push('/'); }} className="w-full py-2.5 bg-white hover:bg-gray-50 text-[#2874f0] font-semibold text-sm rounded-xl border border-gray-300 transition-colors cursor-pointer">Sign In as Administrator</button>
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'analytics' as Tab, label: 'Analytics', icon: BarChart2 },
    { id: 'orders' as Tab, label: 'Orders', icon: ShoppingCart, count: orders.length },
    { id: 'catalog' as Tab, label: 'Products', icon: Package, count: products.length },
    { id: 'coupons' as Tab, label: 'Coupons', icon: Gift },
    { id: 'users' as Tab, label: 'Customers', icon: Users },
    { id: 'reviews' as Tab, label: 'Reviews', icon: Star },
    { id: 'content' as Tab, label: 'Content', icon: Tag },
    { id: 'whatsapp' as Tab, label: 'WhatsApp', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-[#f1f3f6]" style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>

      {/* ── Top Navbar ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 transition-colors p-1 cursor-pointer"><ArrowLeft className="w-5 h-5" /></button>
              <div className="flex items-center gap-2">
                <BrandLogo size={32} className="w-8 h-8" />
                <div className="hidden sm:block">
                  <p className="text-sm font-bold text-gray-900 leading-tight">Blessing Store</p>
                  <p className="text-[10px] text-gray-400 font-medium">Admin Dashboard</p>
                </div>
              </div>
            </div>

            {/* Desktop tabs */}
            <nav className="hidden md:flex items-center h-full">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  className={`h-full px-4 flex items-center gap-1.5 text-[13px] font-semibold border-b-[3px] transition-colors cursor-pointer ${activeTab === t.id ? 'border-[#2874f0] text-[#2874f0]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  <t.icon className="w-4 h-4" />
                  <span>{t.label}</span>
                  {'count' in t && t.count !== undefined && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === t.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
                  )}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-green-700">Live</span>
              </div>
              <button onClick={() => { logoutUser(); router.push('/'); }} className="text-gray-400 hover:text-red-500 transition-colors p-1.5 cursor-pointer" title="Sign Out"><LogOut className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Mobile tab bar — horizontal scroll */}
        <div className="md:hidden border-t border-gray-100 bg-white overflow-x-auto scroll-chips">
          <div className="flex min-w-max px-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`min-w-[72px] px-3 py-2.5 flex flex-col items-center gap-0.5 text-[10px] font-semibold transition-colors border-b-2 cursor-pointer touch-target ${activeTab === t.id ? 'border-[#2874f0] text-[#2874f0] bg-blue-50/40' : 'border-transparent text-gray-400'}`}>
                <t.icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4">

        {/* ── KPI Summary Cards (always visible) ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Revenue', value: fmt(analytics?.summary.totalRevenue ?? totalRevenue), icon: IndianRupee, color: 'text-green-600', bg: 'bg-green-50', sub: analytics ? `₹${analytics.summary.todayRevenue.toLocaleString('en-IN')} today` : '' },
            { label: 'Total Orders', value: analytics?.summary.totalOrders ?? activeOrderCount, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50', sub: analytics ? `${analytics.summary.todayOrders} today` : '' },
            { label: 'Products', value: products.length, icon: Box, color: 'text-orange-600', bg: 'bg-orange-50', sub: `${dbStats.books} in DB` },
            { label: 'Customers', value: dbStats.users, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50', sub: analytics ? `Avg order ${fmt(analytics.summary.avgOrderValue)}` : '' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3.5 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className={`w-9 h-9 ${s.bg} rounded-lg flex items-center justify-center ${s.color} flex-shrink-0`}><s.icon className="w-4.5 h-4.5" /></div>
                <div className="min-w-0 text-right">
                  <p className="text-[11px] text-gray-400 font-medium truncate">{s.label}</p>
                  <p className="text-lg font-black text-gray-900 leading-tight">{s.value}</p>
                  {s.sub && <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {lowStockAlerts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="text-xs font-semibold">
                Low stock: {lowStockAlerts.map((b) => `${b.title} (${b.stock})`).join(' · ')}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('catalog')}
              className="text-[11px] font-semibold text-amber-900 underline cursor-pointer sm:ml-auto"
            >
              Update stock →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            ANALYTICS TAB
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'analytics' && (
          <div className="space-y-4">
            {/* Range picker */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Payment Analytics</h2>
                <p className="text-xs text-gray-400 mt-0.5">Revenue, payment methods, and order trends</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[7, 14, 30, 90].map((d) => (
                  <button key={d} onClick={() => setAnalyticsRange(d)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${analyticsRange === d ? 'bg-[#2874f0] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    {d}d
                  </button>
                ))}
                <button onClick={loadAnalytics} className="p-1.5 text-gray-400 hover:text-[#2874f0] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer" title="Refresh"><RefreshCw className={`w-4 h-4 ${analyticsLoading ? 'animate-spin' : ''}`} /></button>
              </div>
            </div>

            {analyticsLoading && !analytics ? (
              <div className="bg-white rounded-xl border border-gray-200 p-16 text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-[#2874f0] mx-auto mb-3" />
                <p className="text-sm text-gray-400">Loading analytics...</p>
              </div>
            ) : analytics ? (
              <>
                {/* Today spotlight */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Today's Revenue", value: fmt(analytics.summary.todayRevenue), icon: IndianRupee, color: 'text-green-600', bg: 'bg-green-50' },
                    { label: "Today's Orders", value: analytics.summary.todayOrders, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
                    { label: 'Online Payments', value: analytics.summary.paidOrders, icon: CreditCard, color: 'text-violet-600', bg: 'bg-violet-50' },
                    { label: 'COD Orders', value: analytics.summary.codOrders, icon: Banknote, color: 'text-amber-600', bg: 'bg-amber-50' },
                  ].map((s) => (
                    <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-3.5">
                      <div className={`w-8 h-8 ${s.bg} rounded-lg flex items-center justify-center ${s.color} mb-2`}><s.icon className="w-4 h-4" /></div>
                      <p className="text-[11px] text-gray-400">{s.label}</p>
                      <p className="text-xl font-black text-gray-900">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Daily Revenue Chart */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">Daily Revenue — Last {analytics.range} Days</h3>
                      <p className="text-xs text-gray-400 mt-0.5">Blue bar = today</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">Total</p>
                      <p className="text-base font-black text-gray-900">{fmt(analytics.summary.totalRevenue)}</p>
                    </div>
                  </div>
                  <SimpleBarChart data={analytics.daily} height={110} />
                </div>

                {/* Payment Methods + Order Statuses side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Payment Methods */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Smartphone className="w-4 h-4 text-violet-500" />Payment Methods</h3>
                    {analytics.paymentMethods.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">No data</p> : (
                      <div className="space-y-3">
                        {analytics.paymentMethods.map((m) => {
                          const total = analytics.paymentMethods.reduce((s, x) => s + x.revenue, 0);
                          const isCod = m.method.toLowerCase().includes('cod');
                          return (
                            <div key={m.method}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isCod ? 'bg-amber-400' : 'bg-blue-500'}`} />
                                  <span className="font-medium text-gray-700 truncate max-w-[120px]">{m.method}</span>
                                  <span className="text-gray-400">× {m.count}</span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-bold text-gray-900">{fmt(m.revenue)}</span>
                                  <span className="text-gray-400 ml-1">({pct(m.revenue, total)}%)</span>
                                </div>
                              </div>
                              <MiniBar value={m.revenue} max={total} color={isCod ? 'bg-amber-400' : 'bg-blue-500'} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Order Status Breakdown */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Truck className="w-4 h-4 text-blue-500" />Order Statuses</h3>
                    {analytics.orderStatuses.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">No data</p> : (
                      <div className="space-y-3">
                        {analytics.orderStatuses.map((s) => {
                          const total = analytics.orderStatuses.reduce((sum, x) => sum + x.count, 0);
                          const isDelivered = s.status.toLowerCase().includes('deliver');
                          const isCancelledStatus = s.status.toLowerCase().includes('cancel');
                          const isInTransit = s.status.toLowerCase().includes('transit') || s.status.toLowerCase().includes('courier');
                          const col = isCancelledStatus ? 'bg-red-500' : isDelivered ? 'bg-green-500' : isInTransit ? 'bg-blue-500' : 'bg-amber-400';
                          return (
                            <div key={s.status}>
                              <div className="flex items-center justify-between text-xs mb-1">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${col}`} />
                                  <span className="font-medium text-gray-700 truncate max-w-[140px]">{s.status}</span>
                                </div>
                                <span className="font-bold text-gray-900 shrink-0">{s.count} <span className="text-gray-400 font-normal">({pct(s.count, total)}%)</span></span>
                              </div>
                              <MiniBar value={s.count} max={total} color={col} />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Monthly Trend + Top Products */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Monthly trend */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" />Monthly Trend</h3>
                    {analytics.monthlyTrend.length === 0 ? <p className="text-xs text-gray-400 text-center py-6">No data yet</p> : (
                      <div className="space-y-2.5">
                        {analytics.monthlyTrend.map((m, i) => {
                          const maxRev = Math.max(...analytics.monthlyTrend.map((x) => x.revenue), 1);
                          const prev = i > 0 ? analytics.monthlyTrend[i - 1].revenue : null;
                          const growth = prev && prev > 0 ? ((m.revenue - prev) / prev * 100).toFixed(0) : null;
                          return (
                            <div key={m.month} className="flex items-center gap-3">
                              <div className="w-16 text-[11px] text-gray-500 font-medium shrink-0">{m.month}</div>
                              <div className="flex-1">
                                <MiniBar value={m.revenue} max={maxRev} color="bg-green-500" />
                              </div>
                              <div className="w-24 text-right shrink-0">
                                <span className="text-xs font-bold text-gray-900">{fmt(m.revenue)}</span>
                                {growth !== null && (
                                  <span className={`ml-1.5 text-[10px] font-bold ${Number(growth) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                    {Number(growth) >= 0 ? '▲' : '▼'}{Math.abs(Number(growth))}%
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Top Products */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Star className="w-4 h-4 text-amber-500" />Top Selling Products</h3>
                    {analytics.topProducts.length === 0 ? <p className="text-xs text-gray-400 text-center py-6">No sales data yet</p> : (
                      <div className="space-y-3">
                        {analytics.topProducts.slice(0, 7).map((p, i) => {
                          const maxQty = analytics.topProducts[0]?.totalQty || 1;
                          return (
                            <div key={p.title}>
                              <div className="flex items-center justify-between text-xs mb-1 gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[9px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                                  <span className="font-medium text-gray-700 truncate">{p.title}</span>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="font-bold text-gray-900">{p.totalQty} sold</span>
                                  <span className="text-gray-400 ml-1">• {fmt(p.totalRevenue)}</span>
                                </div>
                              </div>
                              <MiniBar value={p.totalQty} max={maxQty} color="bg-amber-400" />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white rounded-xl border border-amber-200 bg-amber-50/40 p-8 sm:p-12 text-center space-y-4">
                <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Database Connection Required</h3>
                  <p className="text-xs text-gray-600 max-w-lg mx-auto mt-1 leading-relaxed">
                    {analyticsError || 'PostgreSQL database is currently disconnected or unreachable.'}
                  </p>
                </div>
                <div className="bg-white border border-amber-200 rounded-lg p-3 max-w-md mx-auto text-left text-[11px] text-gray-600 space-y-1">
                  <p className="font-bold text-gray-800">💡 How to fix on Railway:</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-gray-600">
                    <li>Open <strong>Railway Dashboard → Web Service → Variables</strong></li>
                    <li>Set <code>DATABASE_URL</code> = <code>{'${{Postgres.DATABASE_PUBLIC_URL}}'}</code></li>
                    <li>Ensure PostgreSQL service in Railway has <strong>Public Networking</strong> enabled.</li>
                  </ol>
                </div>
                <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                  <button onClick={loadAnalytics} className="px-4 py-2 bg-[#2874f0] text-white text-xs font-semibold rounded-lg hover:bg-blue-600 transition-colors cursor-pointer flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" /> Retry Connection
                  </button>
                  <a href="/api/db-status" target="_blank" rel="noreferrer" className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors">
                    🔍 Test DB API Status
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            ORDERS TAB
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <div className="space-y-3">
            {/* Header */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Order Management</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{filteredOrders.length} of {orders.length} orders shown</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={loadLiveOrders} className="p-1.5 text-gray-400 hover:text-[#2874f0] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer" title="Refresh"><RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} /></button>
                  <button onClick={handleExportCsv} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] rounded-lg transition-colors cursor-pointer"><Download className="w-3.5 h-3.5" /><span className="hidden sm:inline">Export CSV</span></button>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input type="text" placeholder="Search order / name / phone" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0] focus:ring-1 focus:ring-[#2874f0]/20 col-span-2 sm:col-span-1" />
                </div>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0] bg-white cursor-pointer">
                  {uniqueStatuses.map((s) => <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>)}
                </select>
                <select value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}
                  className="px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0] bg-white cursor-pointer">
                  <option value="all">All Payments</option>
                  <option value="online">Online (Paid)</option>
                  <option value="cod">Cash on Delivery</option>
                </select>
                <div className="flex gap-1.5 col-span-2 sm:col-span-1">
                  <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="flex-1 px-2 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0] cursor-pointer min-w-0" title="From date" />
                  <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
                    className="flex-1 px-2 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0] cursor-pointer min-w-0" title="To date" />
                </div>
              </div>
              {(orderSearch || filterStatus !== 'all' || filterPayment !== 'all' || filterDateFrom || filterDateTo) && (
                <button onClick={() => { setOrderSearch(''); setFilterStatus('all'); setFilterPayment('all'); setFilterDateFrom(''); setFilterDateTo(''); }}
                  className="mt-2 text-[11px] font-semibold text-[#2874f0] hover:underline cursor-pointer flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear all filters
                </button>
              )}
            </div>

            {/* Order list */}
            {ordersLoading && orders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <RefreshCw className="w-8 h-8 animate-spin text-[#2874f0] mx-auto mb-3" /><p className="text-sm text-gray-400">Loading orders...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-600">{orders.length === 0 ? 'No orders yet' : 'No orders match filters'}</p>
                <p className="text-xs text-gray-400 mt-1">{orders.length === 0 ? 'New orders will appear here in real-time' : 'Try adjusting your search or filter criteria'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((o) => {
                  const allSteps = ['Order Placed', 'Payment Confirmed', 'Preparing Order', 'Packed', 'Handed to ST Courier', 'In Transit', 'Out for Delivery', 'Delivered'];
                  const isCancelled = (o.courierStatus || '').toLowerCase().includes('cancel');
                  const stepIdx = isCancelled ? -1 : Math.max(0, allSteps.findIndex((s) => s.toLowerCase() === (o.courierStatus || '').toLowerCase()));
                  const isCod = (o.paymentMethod || '').toLowerCase().includes('cod');
                  const isDelivered = !isCancelled && stepIdx >= 7;
                  return (
                    <div key={o.orderId} className={`bg-white rounded-xl border overflow-hidden hover:shadow-sm transition-shadow ${isCancelled ? 'border-red-200' : 'border-gray-200'}`}>
                      {/* Order header */}
                      <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-sm font-black text-gray-900">#{o.orderId}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${isCod ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
                            {isCod ? 'COD' : 'PAID'} • {fmt(o.totalAmount)}
                          </span>
                          {isCancelled && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200">CANCELLED</span>}
                          {!isCancelled && o.isOfficialAwb && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200">AUTO-TRACKED</span>}
                          {isDelivered && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-green-50 text-green-700 border border-green-200 flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" />DELIVERED</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-gray-400"><Clock className="w-3 h-3" /><span>{o.createdAt}</span></div>
                      </div>

                      <div className="p-4 space-y-3">
                        {/* Customer + actions row */}
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 text-sm font-black shrink-0">
                              {(o.customerName || 'C').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900">{o.customerName}</p>
                              <p className="text-xs text-gray-400">
                                {o.customerPhone && `+91 ${o.customerPhone}`}
                                {o.customerAltPhone ? ` · alt +91 ${o.customerAltPhone}` : ''}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{o.address}{o.city ? `, ${o.city}` : ''}{o.pincode ? ` - ${o.pincode}` : ''}</p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {(o.items || []).map((item: { title: string; qty: number }, i: number) => (
                                  <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">{item.title} × {item.qty}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                            <button onClick={() => handlePrintLabel(o)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer" title="Print shipping sticker for packet"><Download className="w-3 h-3" />Label</button>
                            <button onClick={() => handleResendWhatsApp(o)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#25d366] hover:bg-[#1fb855] rounded-lg transition-colors cursor-pointer"><MessageSquare className="w-3 h-3" />WhatsApp</button>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className={`rounded-lg p-3 ${isCancelled ? 'bg-red-50' : 'bg-[#f8f9fa]'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[11px] font-semibold text-gray-500">{isCancelled ? 'Order status' : 'Delivery Progress'}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isCancelled ? 'bg-red-100 text-red-700' : isDelivered ? 'bg-green-50 text-green-700' : stepIdx >= 4 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>{isCancelled ? 'Cancelled' : (o.courierStatus || 'Order Placed')}</span>
                          </div>
                          {isCancelled ? (
                            <p className="text-[11px] text-red-700 font-medium">Cancelled — AWB / dispatch locked. Revenue not counted.</p>
                          ) : (
                          <>
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${isDelivered ? 'bg-green-500' : 'bg-[#2874f0]'}`} style={{ width: `${((stepIdx + 1) / allSteps.length) * 100}%` }} />
                          </div>
                          <div className="flex justify-between mt-2">
                            {allSteps.map((s, idx) => (
                              <div key={s} className="flex flex-col items-center" style={{ width: `${100 / allSteps.length}%` }}>
                                <div className={`w-2 h-2 rounded-full border-2 bg-white transition-colors ${idx <= stepIdx ? (isDelivered ? 'border-green-500 bg-green-500' : 'border-[#2874f0] bg-[#2874f0]') : 'border-gray-300'}`} />
                                <span className={`text-[7px] mt-1 text-center leading-tight hidden xl:block ${idx <= stepIdx ? 'text-gray-600 font-semibold' : 'text-gray-400'}`}>{s}</span>
                              </div>
                            ))}
                          </div>
                          </>
                          )}
                        </div>

                        {/* Status steps — each sends WhatsApp from linked admin number */}
                        <div className="bg-[#f8f9fa] rounded-lg p-3 space-y-2">
                          <p className="text-[11px] font-semibold text-gray-500">Update status (auto WhatsApp to customer)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {ORDER_STATUS_ACTIONS.map((a) => {
                              const busy = updatingStatusId === `${o.orderId}-${a.statusKey}`;
                              const isCurrent = (o.courierStatus || '').toLowerCase() === a.orderStatus.toLowerCase();
                              const isCancelled = (o.courierStatus || '').toLowerCase().includes('cancel');
                              const isCancelBtn = a.statusKey === 'CANCELLED';
                              return (
                                <button
                                  key={a.statusKey}
                                  disabled={busy || isCurrent || (isCancelBtn && isCancelled) || (!isCancelBtn && isCancelled)}
                                  onClick={() => handleUpdateOrderStatus(o, a.statusKey, a.orderStatus)}
                                  className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isCancelBtn
                                      ? isCurrent || isCancelled
                                        ? 'bg-red-100 text-red-700 border border-red-200'
                                        : 'bg-white text-red-700 border border-red-200 hover:bg-red-50'
                                      : isCurrent
                                        ? 'bg-green-100 text-green-700 border border-green-200'
                                        : 'bg-white text-gray-700 border border-gray-200 hover:border-[#2874f0] hover:text-[#2874f0]'
                                  }`}
                                >
                                  {busy ? '...' : a.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Dispatch — disabled after cancel */}
                        {(o.courierStatus || '').toLowerCase().includes('cancel') ? (
                          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5 text-xs text-red-700">
                            <Truck className="w-4 h-4 shrink-0 opacity-60" />
                            <span className="font-medium">AWB / Dispatch locked — order cancelled</span>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-[#f8f9fa] rounded-lg p-3">
                            <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0"><Truck className="w-4 h-4 text-gray-400" /><span className="font-medium">AWB:</span></div>
                            <input type="text" placeholder="ST Courier Docket e.g. STC241568974"
                              value={shiprocketAwbInput[o.orderId] !== undefined ? shiprocketAwbInput[o.orderId] : (o.trackingNumber && !o.trackingNumber.startsWith('SHP-') ? o.trackingNumber : '')}
                              onChange={(e) => setShiprocketAwbInput((p) => ({ ...p, [o.orderId]: e.target.value }))}
                              className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-mono uppercase placeholder:normal-case placeholder:text-gray-300 outline-none focus:border-[#2874f0] focus:ring-1 focus:ring-[#2874f0]/20 transition-all" />
                            <button disabled={!!dispatchingOrderIds[o.orderId]} onClick={() => handleDispatch(o.orderId)}
                              className="px-4 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0">
                              {dispatchingOrderIds[o.orderId] ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Verifying...</> : <><Send className="w-3 h-3" />Dispatch</>}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            CATALOG TAB
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'catalog' && (
          <div className="space-y-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Product Catalog</h2>
                <p className="text-xs text-gray-400 mt-0.5">Manage guide books, pricing, and stock</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  Import CSV
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
                <button onClick={() => setShowAddForm(!showAddForm)} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] rounded-lg transition-colors cursor-pointer">
                  {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {showAddForm ? 'Close' : 'Add Product'}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 px-1">
              CSV columns: <code className="bg-gray-100 px-1 rounded">title,cls,category,price,mrp,stock,badge</code>
            </p>

            {showAddForm && (
              <div className="bg-white rounded-xl border-2 border-[#2874f0]/30 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2"><Plus className="w-4 h-4 text-[#2874f0]" />New Guide Book</h3>
                <form onSubmit={handleCreateProduct} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Title *</label>
                    <input type="text" required placeholder="e.g. 10th Standard Mathematics Guide" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#2874f0] focus:ring-1 focus:ring-[#2874f0]/20" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Class</label>
                    <select value={newCls} onChange={(e) => setNewCls(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#2874f0] cursor-pointer bg-white">
                      {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => <option key={c} value={c}>{c} Std</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                    <select value={newCat} onChange={(e) => setNewCat(e.target.value as 'guide' | 'combo')} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#2874f0] cursor-pointer bg-white">
                      <option value="guide">Single Guide</option>
                      <option value="combo">5-Subject Combo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
                      <input type="checkbox" checked={newDiscountEnabled} onChange={(e) => { setNewDiscountEnabled(e.target.checked); if (!e.target.checked) setNewPrice(newMrp); }} className="w-3.5 h-3.5 accent-[#2874f0] cursor-pointer rounded" />
                      Sale Price (₹)
                    </label>
                    <input type="number" required disabled={!newDiscountEnabled} value={newDiscountEnabled ? newPrice : newMrp} onChange={(e) => setNewPrice(Number(e.target.value))} className={`w-full px-3 py-2 border rounded-lg text-sm outline-none ${newDiscountEnabled ? 'border-[#2874f0]' : 'border-gray-200 text-gray-400 bg-gray-50'}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">MRP (₹)</label>
                    <input type="number" required value={newMrp} onChange={(e) => { const v = Number(e.target.value); setNewMrp(v); if (!newDiscountEnabled) setNewPrice(v); }} className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-[#2874f0]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
                      <input type="checkbox" checked={newBadgeEnabled} onChange={(e) => setNewBadgeEnabled(e.target.checked)} className="w-3.5 h-3.5 accent-[#2874f0] cursor-pointer rounded" />
                      Badge
                    </label>
                    <input type="text" disabled={!newBadgeEnabled} placeholder="e.g. BESTSELLER" value={newBadge} onChange={(e) => setNewBadge(e.target.value)} className={`w-full px-3 py-2 border rounded-lg text-sm uppercase outline-none ${newBadgeEnabled ? 'border-[#2874f0]' : 'border-gray-200 text-gray-400 bg-gray-50'}`} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cover Image</label>
                    <input type="file" accept="image/*" onChange={handleImageFileUpload} className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-[#2874f0] cursor-pointer" />
                  </div>
                  <div className="col-span-2 sm:col-span-4 flex items-center justify-between pt-1">
                    {newImg && <img src={newImg} alt="" className="w-10 h-10 object-contain rounded-lg border border-gray-200 bg-gray-50 p-0.5" />}
                    <button type="submit" className="px-5 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] rounded-lg transition-colors cursor-pointer ml-auto">Save Product</button>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {products.length === 0 ? (
                <div className="p-12 text-center"><Package className="w-12 h-12 mx-auto mb-3 text-gray-300" /><p className="text-sm font-semibold text-gray-600">No products yet</p><p className="text-xs text-gray-400 mt-1">Click &ldquo;Add Product&rdquo; to create your first listing</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-[#f8f9fa] border-b border-gray-200">{['Product', 'Class', 'Price', 'MRP', 'Badge', 'Stock', 'Actions'].map((h) => <th key={h} className={`py-3 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide ${h === 'Actions' ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-100">
                      {products.map((p) => {
                        const isEditing = editingId === p.id;
                        const disc = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
                        return (
                          <tr key={p.id} className="hover:bg-[#f8f9fa] transition-colors">
                            <td className="py-3 px-3"><div className="flex items-center gap-2.5"><img src={p.image} alt={p.title} className="w-8 h-8 object-contain bg-gray-50 border border-gray-100 rounded-lg p-0.5 flex-shrink-0" /><span className="font-medium text-gray-900 truncate max-w-[160px] sm:max-w-xs">{p.title}</span></div></td>
                            <td className="py-3 px-3 text-gray-500 whitespace-nowrap">{p.cls}</td>
                            <td className="py-3 px-3">
                              {isEditing ? (
                                <div className="flex items-center gap-1"><input type="checkbox" checked={editDiscountEnabled} onChange={(e) => { setEditDiscountEnabled(e.target.checked); if (!e.target.checked) setEditPrice(editMrp); }} className="w-3 h-3 accent-[#2874f0] cursor-pointer" /><input type="number" disabled={!editDiscountEnabled} value={editDiscountEnabled ? editPrice : editMrp} onChange={(e) => setEditPrice(Number(e.target.value))} className={`w-16 px-2 py-1 border rounded text-xs font-semibold outline-none ${editDiscountEnabled ? 'border-[#2874f0] text-[#2874f0]' : 'border-gray-200 text-gray-400'}`} /></div>
                              ) : (<div className="flex items-center gap-1.5"><span className="font-bold text-gray-900">₹{p.price}</span>{disc > 0 && <span className="text-[10px] font-bold text-green-600">{disc}%</span>}</div>)}
                            </td>
                            <td className="py-3 px-3 text-gray-400">
                              {isEditing ? <input type="number" value={editMrp} onChange={(e) => { const v = Number(e.target.value); setEditMrp(v); if (!editDiscountEnabled) setEditPrice(v); }} className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs font-semibold text-gray-700 outline-none" />
                                : <span className={disc > 0 ? 'line-through' : ''}>₹{p.mrp}</span>}
                            </td>
                            <td className="py-3 px-3">
                              {isEditing ? (
                                <div className="flex items-center gap-1"><input type="checkbox" checked={editBadgeEnabled} onChange={(e) => setEditBadgeEnabled(e.target.checked)} className="w-3 h-3 accent-[#2874f0] cursor-pointer" /><input type="text" disabled={!editBadgeEnabled} value={editBadge} placeholder="Badge" onChange={(e) => setEditBadge(e.target.value)} className={`w-20 px-2 py-1 border rounded text-[10px] font-bold uppercase outline-none ${editBadgeEnabled ? 'border-[#2874f0]' : 'border-gray-200 text-gray-300'}`} /></div>
                              ) : p.badge ? <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-md uppercase">{p.badge}</span> : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="py-3 px-3">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={editStock}
                                  onChange={(e) => setEditStock(Number(e.target.value))}
                                  className="w-14 px-2 py-1 border border-[#2874f0] rounded text-xs font-semibold outline-none"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => toggleStock(p.id, !!p.inStock)}
                                  className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors cursor-pointer ${!p.inStock || (p.stock ?? 0) <= 0
                                      ? 'bg-red-50 text-red-600 border border-red-200'
                                      : (p.stock ?? 99) <= 5
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : 'bg-green-50 text-green-700 border border-green-200'
                                    }`}
                                >
                                  {p.inStock ? `${p.stock ?? '—'} left` : 'Off'}
                                </button>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isEditing ? (
                                  <button onClick={() => saveProductChanges(p.id)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg cursor-pointer transition-colors"><Check className="w-3 h-3" />Save</button>
                                ) : (
                                  <button onClick={() => startEditing(p)} className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#2874f0] bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer transition-colors"><Edit2 className="w-3 h-3" />Edit</button>
                                )}
                                <button onClick={() => handleDeleteProduct(p.id)} className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
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
        )}

        {/* ══════════════════════════════════════════════════════════
            COUPONS TAB
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'coupons' && user && (
          <AdminCouponsTab user={user} showToast={showToast} />
        )}

        {activeTab === 'users' && user && (
          <AdminUsersTab user={user} showToast={showToast} />
        )}

        {activeTab === 'reviews' && user && (
          <AdminReviewsTab user={user} showToast={showToast} />
        )}

        {/* ══════════════════════════════════════════════════════════
            CONTENT TAB — FAQs
        ══════════════════════════════════════════════════════════ */}
        {activeTab === 'content' && (
          <div className="max-w-xl mx-auto">
            <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
              <h3 className="text-sm font-bold text-gray-900">FAQs</h3>
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
                <input value={newFaqQ} onChange={(e) => setNewFaqQ(e.target.value)} placeholder="Question" required className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0]" />
                <textarea value={newFaqA} onChange={(e) => setNewFaqA(e.target.value)} placeholder="Answer" required rows={3} className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0]" />
                <button type="submit" className="px-3 py-2 text-xs font-semibold text-white bg-[#2874f0] rounded-lg hover:bg-[#1a5dc8] cursor-pointer">Add FAQ</button>
              </form>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {faqs.length === 0 ? <p className="text-xs text-gray-400">No FAQs yet</p> : faqs.map((f) => (
                  <div key={f.id} className="border border-gray-100 rounded-lg px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <p className="text-xs font-bold text-gray-800">{f.question}</p>
                      <button
                        onClick={async () => {
                          if (!confirm('Delete FAQ?')) return;
                          await fetch(`/api/content?id=${encodeURIComponent(f.id)}`, { method: 'DELETE', headers: authHeaders(user) });
                          loadContent();
                        }}
                        className="text-[10px] font-semibold text-red-600 shrink-0 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">{f.answer}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{f.status}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'whatsapp' && (
          <AdminWhatsAppTab
            waStatus={waStatus}
            waPhoneInput={waPhoneInput}
            setWaPhoneInput={setWaPhoneInput}
            waPairingCode={waPairingCode}
            onUnlink={handleUnlinkWhatsApp}
            onRequestPairing={handleRequestPairingCode}
            onRefreshQr={handleRefreshWhatsAppQr}
          />
        )}

      </main>
    </div>
  );
}
