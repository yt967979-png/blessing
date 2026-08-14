'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  CheckSquare,
  Square,
  Package,
  Truck,
  Printer,
  X,
  ExternalLink,
  ChevronRight,
  User,
  Phone,
  MapPin,
  Calendar,
  IndianRupee,
  FileText,
  AlertTriangle,
  RotateCcw,
  Clock,
} from 'lucide-react';
import OrderStatusStamp from './OrderStatusStamp';
import { openShippingLabelPrint } from '@/lib/shippingLabel';

interface OrderItem {
  title: string;
  qty: number;
  price?: number;
  subtotal?: number;
}

interface Order {
  orderId: string;
  id: string;
  customerName: string;
  customerPhone: string;
  customerAltPhone?: string;
  address: string;
  city: string;
  pincode: string;
  state?: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  courierStatus: string;
  trackingNumber: string;
  shipmentId: string;
  isOfficialAwb: boolean;
  trackingUrl: string;
  courierName: string;
  items: OrderItem[];
  createdAt: string;
}

interface OrdersSectionProps {
  orders: Order[];
  ordersLoading: boolean;
  onUpdateStatus: (orderId: string, newStatus: string) => Promise<void>;
  onAssignAwb: (orderId: string, awb: string) => Promise<void>;
  onCancelOrder?: (orderId: string) => Promise<void>;
  onShowToast: (msg: string) => void;
}

const fmt = (n: number) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export const OrdersSection: React.FC<OrdersSectionProps> = ({
  orders,
  ordersLoading,
  onUpdateStatus,
  onAssignAwb,
  onCancelOrder,
  onShowToast,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeDrawerOrder, setActiveDrawerOrder] = useState<Order | null>(null);
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [awbInputs, setAwbInputs] = useState<Record<string, string>>({});
  const [awbSaving, setAwbSaving] = useState<Record<string, boolean>>({});

  // ── Status counts for filter pills ──────────────────────────────────────────
  const counts = useMemo(() => {
    const res = { all: orders.length, pending: 0, packed: 0, dispatched: 0, delivered: 0, cancelled: 0 };
    orders.forEach((o) => {
      const s = String(o.courierStatus || o.paymentStatus || '').toLowerCase();
      if (s.includes('cancel') || s.includes('refund')) res.cancelled++;
      else if (s.includes('deliver') && !s.includes('attempt')) res.delivered++;
      else if (s.includes('transit') || s.includes('handed') || s.includes('out')) res.dispatched++;
      else if (s.includes('pack')) res.packed++;
      else res.pending++;
    });
    return res;
  }, [orders]);

  // ── Filtered orders ─────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const q = search.trim().toLowerCase();
      const s = String(o.courierStatus || o.paymentStatus || '').toLowerCase();

      // Search match
      const matchSearch =
        !q ||
        o.orderId.toLowerCase().includes(q) ||
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.includes(q) ||
        o.city.toLowerCase().includes(q) ||
        o.trackingNumber?.toLowerCase().includes(q);

      // Status match
      let matchStatus = true;
      if (statusFilter === 'pending') {
        matchStatus = !s.includes('pack') && !s.includes('handed') && !s.includes('transit') && !s.includes('deliver') && !s.includes('cancel');
      } else if (statusFilter === 'packed') {
        matchStatus = s.includes('pack') && !s.includes('handed') && !s.includes('transit') && !s.includes('deliver');
      } else if (statusFilter === 'dispatched') {
        matchStatus = s.includes('handed') || s.includes('transit') || s.includes('out');
      } else if (statusFilter === 'delivered') {
        matchStatus = s.includes('deliver') && !s.includes('attempt');
      } else if (statusFilter === 'cancelled') {
        matchStatus = s.includes('cancel') || s.includes('refund');
      }

      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  // ── Multi-select helpers ───────────────────────────────────────────────────
  const allFilteredSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds.has(o.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      filteredOrders.forEach((o) => next.add(o.id));
      setSelectedIds(next);
    }
  };

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // ── Batch Actions ───────────────────────────────────────────────────────────
  const handleBatchMarkPacked = async () => {
    if (selectedIds.size === 0) return;
    setBatchActionLoading(true);
    let successCount = 0;
    try {
      for (const id of Array.from(selectedIds)) {
        await onUpdateStatus(id, 'Packed');
        successCount++;
      }
      onShowToast(`✅ Marked ${successCount} order(s) as Packed`);
      setSelectedIds(new Set());
    } catch {
      onShowToast('❌ Batch pack encountered an issue');
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleBatchPrintSlips = () => {
    const selectedOrders = orders.filter((o) => selectedIds.has(o.id));
    if (selectedOrders.length === 0) return;
    selectedOrders.forEach((o, idx) => {
      setTimeout(() => {
        openShippingLabelPrint(o, 'a4');
      }, idx * 300);
    });
  };

  const handleInlineSaveAwb = async (orderId: string) => {
    const docket = (awbInputs[orderId] || '').trim().toUpperCase();
    if (!docket) {
      onShowToast('Please enter an ST Courier docket number');
      return;
    }
    setAwbSaving((prev) => ({ ...prev, [orderId]: true }));
    try {
      await onAssignAwb(orderId, docket);
      setAwbInputs((prev) => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
    } finally {
      setAwbSaving((prev) => ({ ...prev, [orderId]: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── Filter Tabs & Search Controls ───────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 pb-3 text-xs font-semibold">
          {[
            { key: 'all', label: 'ALL ORDERS', count: counts.all },
            { key: 'pending', label: 'UNPACKED', count: counts.pending, color: 'text-blue-600' },
            { key: 'packed', label: 'PACKED', count: counts.packed, color: 'text-amber-600' },
            { key: 'dispatched', label: 'IN TRANSIT', count: counts.dispatched, color: 'text-purple-600' },
            { key: 'delivered', label: 'DELIVERED', count: counts.delivered, color: 'text-emerald-600' },
            { key: 'cancelled', label: 'CANCELLED', count: counts.cancelled, color: 'text-red-600' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-2 cursor-pointer ${
                statusFilter === tab.key
                  ? 'bg-[#2874f0] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  statusFilter === tab.key
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Bar & Multi-Select Action Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Order #, Name, Phone, City, or AWB..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#2874f0] focus:bg-white text-slate-900 shadow-inner"
            />
          </div>

          {/* Batch Action Buttons (When items selected) */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 p-1.5 rounded-xl border border-blue-200 animate-fade-slide-up">
              <span className="text-xs font-bold text-[#2874f0] px-2">
                {selectedIds.size} Selected
              </span>
              <button
                type="button"
                disabled={batchActionLoading}
                onClick={handleBatchMarkPacked}
                className="px-3.5 py-1.5 bg-[#2874f0] hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Package className="w-3.5 h-3.5" />
                <span>Mark Packed</span>
              </button>
              <button
                type="button"
                onClick={handleBatchPrintSlips}
                className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Slips</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── Orders Presentation (Desktop Table + Mobile Cards) ──────────────── */}
      {ordersLoading ? (
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-12 text-center text-[#55607A] font-mono text-xs">
          Loading orders ledger...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-12 text-center text-[#55607A] font-mono text-xs">
          No orders found matching the filter criteria.
        </div>
      ) : (
        <>
          {/* Desktop Data-Dense Table (Hidden on small screens) */}
          <div className="hidden lg:block bg-white rounded-xl border border-[#55607A]/20 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAF7F0] border-b border-[#55607A]/20 text-[11px] font-mono font-bold text-[#55607A] uppercase tracking-wider">
                    <th className="p-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="text-[#1E2A4A] cursor-pointer"
                      >
                        {allFilteredSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#D98C2B]" />
                        ) : (
                          <Square className="w-4 h-4 text-[#55607A]" />
                        )}
                      </button>
                    </th>
                    <th className="p-3">Order ID & Date</th>
                    <th className="p-3">Customer & Location</th>
                    <th className="p-3">Items & Total</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">ST Courier AWB</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {filteredOrders.map((order) => {
                    const isSelected = selectedIds.has(order.id);
                    const isCancelled = String(order.courierStatus).toLowerCase().includes('cancel');
                    const hasAwb = Boolean(order.trackingNumber);

                    return (
                      <tr
                        key={order.id}
                        className={`hover:bg-[#FAF7F0]/60 transition-colors ${
                          isSelected ? 'bg-[#D98C2B]/5' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelectOne(order.id)}
                            className="text-[#1E2A4A] cursor-pointer"
                          >
                            {isSelected ? (
                              <CheckSquare className="w-4 h-4 text-[#D98C2B]" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                          </button>
                        </td>

                        {/* Order ID & Date */}
                        <td className="p-3">
                          <button
                            type="button"
                            onClick={() => setActiveDrawerOrder(order)}
                            className="font-mono font-bold text-[#1E2A4A] hover:text-[#D98C2B] text-xs hover:underline block text-left cursor-pointer"
                          >
                            {order.orderId || order.id}
                          </button>
                          <span className="text-[10px] font-mono text-[#55607A] block mt-0.5">
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Recent'}
                          </span>
                        </td>

                        {/* Customer & Location */}
                        <td className="p-3">
                          <span className="font-bold text-[#1E2A4A] block truncate max-w-[180px]">
                            {order.customerName || 'Student'}
                          </span>
                          <span className="text-[11px] font-mono text-[#55607A] block truncate max-w-[180px]">
                            {order.customerPhone} • {order.city || 'Tamil Nadu'}
                          </span>
                        </td>

                        {/* Items & Total */}
                        <td className="p-3">
                          <span className="font-mono font-bold text-[#1E2A4A] block">
                            {fmt(order.totalAmount)}
                          </span>
                          <span className="text-[10px] text-[#55607A] block truncate max-w-[160px]">
                            {order.items?.map((i) => `${i.qty}x ${i.title}`).join(', ') || 'Guide Books'}
                          </span>
                        </td>

                        {/* Status Stamp */}
                        <td className="p-3">
                          <OrderStatusStamp status={order.courierStatus || order.paymentStatus} size="sm" />
                        </td>

                        {/* ST Courier AWB */}
                        <td className="p-3 font-mono">
                          {hasAwb ? (
                            <a
                              href={order.trackingUrl || `https://stcourier.com/track/shipment?docket=${order.trackingNumber}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1"
                            >
                              <span>{order.trackingNumber}</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : isCancelled ? (
                            <span className="text-slate-400 text-[11px]">—</span>
                          ) : (
                            <div className="flex items-center gap-1 max-w-[170px]">
                              <input
                                type="text"
                                placeholder="Enter STC AWB"
                                value={awbInputs[order.id] || ''}
                                onChange={(e) =>
                                  setAwbInputs((prev) => ({ ...prev, [order.id]: e.target.value }))
                                }
                                className="w-24 px-1.5 py-1 text-[11px] font-mono bg-white border border-slate-300 rounded outline-none focus:border-[#D98C2B]"
                              />
                              <button
                                type="button"
                                disabled={awbSaving[order.id]}
                                onClick={() => handleInlineSaveAwb(order.id)}
                                className="px-2 py-1 bg-[#1E2A4A] hover:bg-[#D98C2B] text-white text-[10px] font-bold rounded transition-colors cursor-pointer"
                              >
                                {awbSaving[order.id] ? '...' : 'Save'}
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => setActiveDrawerOrder(order)}
                            className="p-1.5 rounded text-[#55607A] hover:text-[#1E2A4A] hover:bg-slate-100 transition-colors inline-block cursor-pointer"
                            title="View Order Details"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Packing Cards (Designed for shelf packing on phones) */}
          <div className="lg:hidden space-y-3">
            {filteredOrders.map((order) => {
              const isSelected = selectedIds.has(order.id);
              const hasAwb = Boolean(order.trackingNumber);
              const isPacked = String(order.courierStatus).toLowerCase().includes('pack');

              return (
                <div
                  key={order.id}
                  className={`bg-white rounded-xl border p-4 shadow-xs space-y-3 transition-colors ${
                    isSelected ? 'border-[#D98C2B] bg-[#D98C2B]/5' : 'border-[#55607A]/20'
                  }`}
                >
                  {/* Top Bar: Order ID + Status Stamp + Checkbox */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSelectOne(order.id)}
                        className="text-[#1E2A4A]"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#D98C2B]" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      <div>
                        <button
                          type="button"
                          onClick={() => setActiveDrawerOrder(order)}
                          className="font-mono font-bold text-xs text-[#1E2A4A] hover:underline"
                        >
                          {order.orderId || order.id}
                        </button>
                        <span className="text-[10px] font-mono text-[#55607A] block">
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : 'Recent'}
                        </span>
                      </div>
                    </div>
                    <OrderStatusStamp status={order.courierStatus || order.paymentStatus} size="sm" />
                  </div>

                  {/* Customer & Location */}
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold text-[#1E2A4A]">{order.customerName}</p>
                    <p className="text-[#55607A] font-mono text-[11px]">{order.customerPhone}</p>
                    <p className="text-[#55607A] text-[11px] truncate">{order.address}, {order.city} - {order.pincode}</p>
                  </div>

                  {/* Items List (Packing Checklist) */}
                  <div className="bg-[#FAF7F0] p-2.5 rounded-lg border border-slate-200/60 text-xs">
                    <p className="text-[10px] font-mono font-bold text-[#55607A] uppercase mb-1">
                      PACKING CHECKLIST ({order.items?.length || 0} ITEMS):
                    </p>
                    <div className="space-y-1">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="flex justify-between text-[#1E2A4A] font-semibold">
                          <span className="truncate pr-2">✓ {item.title}</span>
                          <span className="font-mono font-black shrink-0">x{item.qty}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Mobile Actions: 1-Tap Pack + ST Courier AWB */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <span className="font-mono font-black text-sm text-[#1E2A4A]">
                      {fmt(order.totalAmount)}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {!isPacked && (
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(order.id, 'Packed')}
                          className="px-3 py-1.5 bg-[#D98C2B] text-white font-mono font-bold text-xs rounded-lg shadow-xs active:scale-95 transition-transform"
                        >
                          Mark Packed
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveDrawerOrder(order)}
                        className="px-2.5 py-1.5 bg-[#FAF7F0] border border-[#55607A]/20 text-[#1E2A4A] font-mono text-xs rounded-lg"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ─── Slide-Over Order Detail Drawer ──────────────────────────────────── */}
      {activeDrawerOrder && (
        <>
          <div
            onClick={() => setActiveDrawerOrder(null)}
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-xs"
          />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg bg-[#FAF7F0] shadow-2xl flex flex-col border-l border-[#55607A]/20 animate-fade-slide-up">
            {/* Drawer Header */}
            <div className="bg-[#1E2A4A] text-white p-4 flex items-center justify-between shadow-md">
              <div>
                <span className="text-[10px] font-mono text-amber-400 block uppercase tracking-wider">
                  ORDER DETAILS
                </span>
                <h3 className="font-mono font-black text-base">
                  {activeDrawerOrder.orderId || activeDrawerOrder.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveDrawerOrder(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar text-xs font-sans">
              {/* Status Banner */}
              <div className="bg-white p-3.5 rounded-xl border border-[#55607A]/20 flex items-center justify-between shadow-xs">
                <div>
                  <span className="text-[10px] text-[#55607A] font-mono block">CURRENT STATUS</span>
                  <span className="font-bold text-[#1E2A4A] text-sm">
                    {activeDrawerOrder.courierStatus || activeDrawerOrder.paymentStatus}
                  </span>
                </div>
                <OrderStatusStamp status={activeDrawerOrder.courierStatus || activeDrawerOrder.paymentStatus} size="md" />
              </div>

              {/* Customer & Shipping Info */}
              <div className="bg-white p-4 rounded-xl border border-[#55607A]/20 space-y-2 shadow-xs">
                <h4 className="font-serif font-bold text-xs text-[#1E2A4A] uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#D98C2B]" />
                  <span>Customer & Shipping Address</span>
                </h4>
                <p className="font-bold text-sm text-[#1E2A4A]">{activeDrawerOrder.customerName}</p>
                <p className="text-[#55607A] font-mono">{activeDrawerOrder.customerPhone}</p>
                <p className="text-[#55607A] leading-relaxed pt-1">
                  {activeDrawerOrder.address}
                  <br />
                  {activeDrawerOrder.city} - {activeDrawerOrder.pincode}, {activeDrawerOrder.state || 'Tamil Nadu'}
                </p>
              </div>

              {/* Items List */}
              <div className="bg-white p-4 rounded-xl border border-[#55607A]/20 space-y-3 shadow-xs">
                <h4 className="font-serif font-bold text-xs text-[#1E2A4A] uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[#D98C2B]" />
                  <span>Order Items ({activeDrawerOrder.items?.length || 0})</span>
                </h4>
                <div className="divide-y divide-slate-100">
                  {activeDrawerOrder.items?.map((item, idx) => (
                    <div key={idx} className="py-2 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-[#1E2A4A] block">{item.title}</span>
                        <span className="text-[10px] text-[#55607A] font-mono">
                          Qty: {item.qty} {item.price ? `• ₹${item.price} each` : ''}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-[#1E2A4A]">
                        {item.subtotal ? fmt(item.subtotal) : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between items-center font-mono font-black text-sm text-[#1E2A4A]">
                  <span>Total Amount Paid</span>
                  <span>{fmt(activeDrawerOrder.totalAmount)}</span>
                </div>
              </div>

              {/* Courier & AWB Assignment */}
              <div className="bg-white p-4 rounded-xl border border-[#55607A]/20 space-y-3 shadow-xs">
                <h4 className="font-serif font-bold text-xs text-[#1E2A4A] uppercase tracking-wider border-b border-slate-100 pb-1.5 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-[#D98C2B]" />
                  <span>ST Courier Logistics</span>
                </h4>
                {activeDrawerOrder.trackingNumber ? (
                  <div className="space-y-2">
                    <p className="font-mono text-xs">
                      Docket: <strong className="text-blue-700">{activeDrawerOrder.trackingNumber}</strong>
                    </p>
                    <a
                      href={activeDrawerOrder.trackingUrl || `https://stcourier.com/track/shipment?docket=${activeDrawerOrder.trackingNumber}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-mono font-bold text-blue-600 hover:underline"
                    >
                      <span>Track on ST Courier Portal</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-[11px] text-[#55607A] font-mono">
                      Assign ST Courier Docket:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. STC241568974"
                        value={awbInputs[activeDrawerOrder.id] || ''}
                        onChange={(e) =>
                          setAwbInputs((prev) => ({ ...prev, [activeDrawerOrder.id]: e.target.value }))
                        }
                        className="flex-1 px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg text-xs font-mono uppercase outline-none focus:border-[#D98C2B]"
                      />
                      <button
                        type="button"
                        disabled={awbSaving[activeDrawerOrder.id]}
                        onClick={() => handleInlineSaveAwb(activeDrawerOrder.id)}
                        className="px-4 py-2 bg-[#1E2A4A] hover:bg-[#D98C2B] text-white font-mono font-bold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        {awbSaving[activeDrawerOrder.id] ? 'Saving...' : 'Assign'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 bg-white border-t border-[#55607A]/20 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => openShippingLabelPrint(activeDrawerOrder, 'a4')}
                className="flex-1 py-2.5 bg-[#FAF7F0] hover:bg-slate-100 border border-[#55607A]/20 text-[#1E2A4A] font-mono font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Packing Slip</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  window.open(`/api/orders/${activeDrawerOrder.id}/invoice`, '_blank');
                }}
                className="flex-1 py-2.5 bg-[#1E2A4A] hover:bg-[#D98C2B] text-white font-mono font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>GST Tax Invoice</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OrdersSection;
