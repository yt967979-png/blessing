'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag,
  RefreshCw,
  Search,
  CheckCircle,
  Clock,
  Send,
  AlertCircle,
  ArrowUpRight,
  TrendingUp,
  CheckCheck,
  Trash2,
} from 'lucide-react';

interface AbandonedCartItem {
  id?: string;
  title: string;
  price: number;
  qty: number;
}

interface AbandonedCart {
  id: string;
  userId?: string;
  phone: string;
  name: string;
  items: AbandonedCartItem[];
  totalQty: number;
  subtotal?: number;
  shippingFee?: number;
  totalAmount: number;
  reminded: boolean;
  converted: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AbandonedCartsSectionProps {
  authHeaders: Record<string, string>;
  onShowToast: (msg: string) => void;
}

export const AbandonedCartsSection: React.FC<AbandonedCartsSectionProps> = ({
  authHeaders,
  onShowToast,
}) => {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'reminded' | 'converted'>('all');

  const cartsHashRef = useRef<string>('');

  const fetchCarts = async (isManual = false) => {
    if (isManual) setRefreshing(true);

    try {
      const res = await fetch('/api/admin/abandoned-carts', {
        headers: authHeaders,
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.carts)) {
        const hash = JSON.stringify(data.carts.map((c: any) => `${c.id}:${c.totalAmount}:${c.reminded}:${c.converted}:${c.updatedAt}`));
        if (hash !== cartsHashRef.current || isManual) {
          cartsHashRef.current = hash;
          setCarts(data.carts);
        }
        if (isManual) onShowToast('✅ Abandoned carts refreshed');
      } else if (isManual) {
        onShowToast(`⚠️ ${data.error || 'Failed to load abandoned carts'}`);
      }
    } catch {
      if (isManual) onShowToast('❌ Network error loading abandoned carts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchCarts();
    const onFocus = () => void fetchCarts(false);
    window.addEventListener('focus', onFocus);
    // Quiet background poll every 5s — silent diffing prevents UI stutter
    const timer = setInterval(() => {
      void fetchCarts(false);
    }, 5000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, []);

  const toggleReminded = async (cart: AbandonedCart) => {
    const nextState = !cart.reminded;
    setCarts((prev) =>
      prev.map((c) => (c.id === cart.id ? { ...c, reminded: nextState } : c))
    );

    try {
      const res = await fetch('/api/admin/abandoned-carts', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({ id: cart.id, reminded: nextState }),
      });
      if (!res.ok) {
        // revert on failure
        setCarts((prev) =>
          prev.map((c) => (c.id === cart.id ? { ...c, reminded: cart.reminded } : c))
        );
        onShowToast('❌ Failed to update reminder status');
      }
    } catch {
      setCarts((prev) =>
        prev.map((c) => (c.id === cart.id ? { ...c, reminded: cart.reminded } : c))
      );
      onShowToast('❌ Network error updating status');
    }
  };

  const deleteCart = async (cart: AbandonedCart) => {
    setCarts((prev) => prev.filter((c) => c.id !== cart.id));
    try {
      const res = await fetch(`/api/admin/abandoned-carts?id=${encodeURIComponent(cart.id)}`, {
        method: 'DELETE',
        headers: authHeaders,
      });
      if (res.ok) {
        onShowToast('🗑️ Cart dismissed');
      } else {
        fetchCarts();
        onShowToast('❌ Failed to dismiss cart');
      }
    } catch {
      fetchCarts();
      onShowToast('❌ Network error dismissing cart');
    }
  };

  const sendWhatsAppRecovery = (cart: AbandonedCart) => {
    const cleanPhone = cart.phone.replace(/\D/g, '');
    const phoneWithCountry = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const bookTitles = cart.items.map((it) => `• ${it.title} (Qty: ${it.qty || 1})`).join('\n');
    const shippingLine = cart.shippingFee && cart.shippingFee > 0
      ? `Books: ₹${cart.subtotal || (cart.totalAmount - cart.shippingFee)}\nDelivery Charge: ₹${cart.shippingFee}\nTotal: ₹${cart.totalAmount}`
      : `Total: ₹${cart.totalAmount} (Free Delivery 🎉)`;

    const msg = `Vanakkam ${cart.name}! 📚\n\nThis is Blessing Power Guide. We noticed you selected books in your cart:\n${bookTitles}\n\n${shippingLine}\n\nNeed any help with delivery pincode or payment? You can easily resume and complete your order directly here:\nhttps://blessingpowerguide.in/cart\n\nFast ST Courier Delivery across Tamil Nadu.`;

    const waUrl = `https://api.whatsapp.com/send?phone=${phoneWithCountry}&text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    // Automatically mark as reminded
    if (!cart.reminded) {
      void toggleReminded(cart);
    }
  };

  const stats = useMemo(() => {
    const totalCount = carts.length;
    const totalPotential = carts.reduce((sum, c) => sum + (c.totalAmount || 0), 0);
    // ONLY show in recovered / converted if we actually contacted them (reminded === true) AND order was placed (converted === true)
    const convertedCarts = carts.filter((c) => c.reminded && c.converted);
    const convertedCount = convertedCarts.length;
    const convertedRevenue = convertedCarts.reduce((sum, c) => sum + (c.totalAmount || 0), 0);
    const pendingCount = carts.filter((c) => !c.reminded && !c.converted).length;
    const recoveryRate = totalCount > 0 ? Math.round((convertedCount / totalCount) * 100) : 0;

    return { totalCount, totalPotential, convertedCount, convertedRevenue, pendingCount, recoveryRate };
  }, [carts]);

  const filteredCarts = useMemo(() => {
    return carts.filter((c) => {
      const matchSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.phone.includes(search) ||
        c.items.some((it) => it.title.toLowerCase().includes(search.toLowerCase()));

      if (!matchSearch) return false;

      if (filter === 'pending') return !c.reminded && !c.converted;
      if (filter === 'reminded') return c.reminded && !c.converted;
      if (filter === 'converted') return c.reminded && c.converted;
      return true;
    });
  }, [carts, search, filter]);

  const timeAgo = (dateStr: string) => {
    const diff = Math.max(0, Date.now() - new Date(dateStr).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading font-black text-2xl text-[#001B3A] flex items-center gap-2.5">
            <ShoppingBag className="w-6 h-6 text-amber-500" />
            <span>Abandoned Cart Recovery</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Capture interested students who added books but dropped off before paying. Recover sales with 1-click WhatsApp.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchCarts(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span>Refresh Carts</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold">Unrecovered Revenue</span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black text-[#001B3A]">
            ₹{stats.totalPotential.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {stats.pendingCount} pending customer nudges
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold">Recovered Orders</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black text-emerald-600">
            ₹{stats.convertedRevenue.toLocaleString('en-IN')}
          </div>
          <div className="text-[11px] text-emerald-700 font-bold mt-1">
            {stats.convertedCount} orders successfully converted!
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold">Total Abandoned</span>
            <ShoppingBag className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-black text-[#001B3A]">
            {stats.totalCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Captured during checkout flow
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold">Conversion Rate</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-xl font-black text-indigo-600">
            {stats.recoveryRate}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Industry average is ~8–12%
          </div>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white p-3 rounded-2xl border border-slate-200">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by student name, phone number, or book title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs outline-none focus:border-blue-600 font-medium"
          />
        </div>

        <div className="flex gap-1.5 p-1 bg-slate-100 rounded-xl">
          {(
            [
              { key: 'all', label: 'All Carts' },
              { key: 'pending', label: `Pending (${stats.pendingCount})` },
              { key: 'reminded', label: 'Contacted' },
              { key: 'converted', label: `Converted (${stats.convertedCount})` },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === t.key
                  ? 'bg-white text-[#001B3A] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-xs animate-pulse">
          Loading abandoned carts...
        </div>
      ) : filteredCarts.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <ShoppingBag className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="font-extrabold text-sm text-slate-700">No abandoned carts found</h3>
          <p className="text-xs text-slate-400 mt-1">
            {search ? 'Try adjusting your search query.' : 'All customer checkouts have been completed or recovered!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCarts.map((cart) => (
            <div
              key={cart.id}
              className={`bg-white border rounded-2xl p-4 sm:p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                cart.converted
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : cart.reminded
                    ? 'border-slate-200'
                    : 'border-amber-200 shadow-xs'
              }`}
            >
              {/* Customer & Item info */}
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-heading font-black text-sm text-[#001B3A]">
                    {cart.name}
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                    +91 {cart.phone}
                  </span>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {timeAgo(cart.updatedAt || cart.createdAt)}
                  </span>

                  {cart.converted ? (
                    <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCheck className="w-3.5 h-3.5" /> Order Placed
                    </span>
                  ) : cart.reminded ? (
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <Send className="w-3 h-3" /> Contacted
                    </span>
                  ) : (
                    <span className="text-[11px] font-extrabold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-600" /> Pending Nudge
                    </span>
                  )}
                </div>

                {/* Items */}
                <div className="flex flex-wrap gap-2 text-xs">
                  {cart.items.map((it, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg text-slate-700 font-medium text-[11px]"
                    >
                      <span className="font-bold text-[#001B3A]">{it.title}</span>
                      <span className="text-slate-400">×{it.qty || 1}</span>
                      <span className="font-extrabold text-slate-900">₹{(Number(it.price || 0) * Number(it.qty || 1))}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Price & Actions */}
              <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-extrabold">
                    Cart Total
                  </div>
                  <div className="text-lg font-black text-[#001B3A]">
                    ₹{cart.totalAmount.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-slate-500 font-semibold">
                    {cart.shippingFee && cart.shippingFee > 0 ? (
                      <span>Books: ₹{cart.subtotal || (cart.totalAmount - cart.shippingFee)} + Shipping: ₹{cart.shippingFee}</span>
                    ) : (
                      <span>{cart.totalQty} {cart.totalQty === 1 ? 'book' : 'books'} · Free Delivery</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => sendWhatsAppRecovery(cart)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-[#25D366] hover:bg-[#20bd5a] active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                    title="Send WhatsApp recovery message"
                  >
                    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                    </svg>
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void toggleReminded(cart)}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                      cart.reminded
                        ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                    title={cart.reminded ? 'Mark un-contacted' : 'Mark as contacted'}
                  >
                    {cart.reminded ? 'Contacted ✓' : 'Mark Done'}
                  </button>

                  <button
                    type="button"
                    onClick={() => void deleteCart(cart)}
                    className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Dismiss / Delete cart"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AbandonedCartsSection;
