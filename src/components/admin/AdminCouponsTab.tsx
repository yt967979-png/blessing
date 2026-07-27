'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Tag, Plus, Trash2, RefreshCw, Gift, Percent } from 'lucide-react';
import { authHeaders } from '@/lib/clientAuth';
import type { UserData } from '@/context/StoreContext';

export interface AdminCoupon {
  id: string;
  code: string;
  title: string;
  description: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minimumAmount: number;
  minimumQuantity: number;
  offerType: 'discount' | 'free_book';
  conditionMode: 'any' | 'all' | 'amount' | 'quantity';
  expiryDate: string | null;
  usageLimit: number;
  usedCount: number;
  perUserLimit: number;
  allowedClasses: string[];
  allowedCategories: string[];
  showInHero: boolean;
  status: string;
}

const CLASS_OPTIONS = ['6th', '7th', '8th', '9th', '10th', '11th', '12th'] as const;
const CATEGORY_OPTIONS = [
  { id: 'guide', label: 'Guides' },
  { id: 'combo', label: 'Combo packs' },
] as const;

const emptyForm = {
  code: '',
  title: '',
  description: '',
  offerType: 'discount' as 'discount' | 'free_book',
  discountType: 'percentage' as 'percentage' | 'fixed',
  discountValue: 10,
  minimumAmount: 0,
  minimumQuantity: 0,
  conditionMode: 'any' as 'any' | 'all' | 'amount' | 'quantity',
  expiryDate: '',
  usageLimit: 100,
  perUserLimit: 1,
  allowedClasses: [] as string[],
  allowedCategories: [] as string[],
  notifyWhatsApp: true,
  showInHero: true,
  status: 'active' as 'active' | 'inactive',
};

export default function AdminCouponsTab({
  user,
  showToast,
}: {
  user: UserData;
  showToast: (msg: string) => void;
}) {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [showForm, setShowForm] = useState(false);
  const [redemptions, setRedemptions] = useState<any[]>([]);

  const toggleFormList = (key: 'allowedClasses' | 'allowedCategories', value: string) => {
    setForm((prev) => {
      const list = prev[key];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...prev, [key]: next };
    });
  };

  const loadRedemptions = useCallback(async () => {
    try {
      const res = await fetch('/api/coupons/redemptions?limit=50', { headers: authHeaders(user) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setRedemptions(data);
      }
    } catch {
      /* ignore */
    }
  }, [user]);

  const loadCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/coupons?admin=1', { headers: authHeaders(user) });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setCoupons(data);
      }
    } catch {
      showToast('Could not load coupons');
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    void loadCoupons();
    void loadRedemptions();
  }, [loadCoupons, loadRedemptions]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) {
      showToast('Coupon code is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({
          ...form,
          expiryDate: form.expiryDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(`❌ ${data.error || 'Failed to create coupon'}`);
        return;
      }
      showToast(
        data.whatsappBroadcast === 'scheduled'
          ? `✅ Coupon ${data.code} created — WhatsApp alerts sending to all users`
          : `✅ Coupon ${data.code} created`
      );
      setForm({ ...emptyForm });
      setShowForm(false);
      await loadCoupons();
      await loadRedemptions();
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (c: AdminCoupon) => {
    const next = c.status === 'active' ? 'inactive' : 'active';
    const res = await fetch('/api/coupons', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
      body: JSON.stringify({ id: c.id, status: next }),
    });
    if (res.ok) {
      showToast(next === 'active' ? 'Coupon activated' : 'Coupon deactivated');
      await loadCoupons();
      await loadRedemptions();
    }
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm('Delete this coupon?')) return;
    const res = await fetch(`/api/coupons?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(user),
    });
    if (res.ok) {
      showToast('Coupon deleted');
      await loadCoupons();
      await loadRedemptions();
    }
  };

  const fmtExpiry = (iso: string | null) => {
    if (!iso) return 'No expiry';
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <Tag className="w-5 h-5 text-[#2874f0]" />
            Coupons & Offers
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Create discounts or free-book offers. Active hero coupons appear on the homepage.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadCoupons()}
            className="px-3 py-2 text-xs font-bold border rounded-lg hover:bg-gray-50 flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 text-xs font-bold bg-[#2874f0] text-white rounded-lg flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> New Coupon
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Coupon Code *</label>
              <input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="e.g. POWER20"
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm font-bold"
                required
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Display Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Diwali Special"
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-gray-500">Description (shown on homepage)</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Valid on all 10th standard guides"
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Offer Type</label>
              <select
                value={form.offerType}
                onChange={(e) =>
                  setForm({ ...form, offerType: e.target.value as 'discount' | 'free_book' })
                }
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              >
                <option value="discount">Price discount (% or ₹)</option>
                <option value="free_book">Free book — user picks any book</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">
                {form.offerType === 'free_book' ? 'Max Free Book Value (₹, 0 = any)' : 'Discount Type'}
              </label>
              {form.offerType === 'free_book' ? (
                <input
                  type="number"
                  min={0}
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              ) : (
                <select
                  value={form.discountType}
                  onChange={(e) =>
                    setForm({ ...form, discountType: e.target.value as 'percentage' | 'fixed' })
                  }
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed amount (₹)</option>
                </select>
              )}
            </div>
            {form.offerType === 'discount' && (
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500">Discount Value</label>
                <input
                  type="number"
                  min={1}
                  value={form.discountValue}
                  onChange={(e) => setForm({ ...form, discountValue: Number(e.target.value) })}
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Min Cart Amount (₹)</label>
              <input
                type="number"
                min={0}
                value={form.minimumAmount}
                onChange={(e) => setForm({ ...form, minimumAmount: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Min Book Quantity</label>
              <input
                type="number"
                min={0}
                value={form.minimumQuantity}
                onChange={(e) => setForm({ ...form, minimumQuantity: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Condition</label>
              <select
                value={form.conditionMode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    conditionMode: e.target.value as 'any' | 'all' | 'amount' | 'quantity',
                  })
                }
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              >
                <option value="any">Amount OR quantity (either)</option>
                <option value="all">Amount AND quantity (both)</option>
                <option value="amount">Amount only</option>
                <option value="quantity">Quantity only</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Expiry Date</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Usage Limit (total)</label>
              <input
                type="number"
                min={1}
                value={form.usageLimit}
                onChange={(e) => setForm({ ...form, usageLimit: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase text-gray-500">Per Customer Limit</label>
              <input
                type="number"
                min={0}
                value={form.perUserLimit}
                onChange={(e) => setForm({ ...form, perUserLimit: Number(e.target.value) })}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
              <p className="text-[10px] text-gray-400 mt-1">1 = once per user (recommended). 0 = unlimited per user.</p>
            </div>
            <label className="flex items-center gap-2 mt-6 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.notifyWhatsApp}
                onChange={(e) => setForm({ ...form, notifyWhatsApp: e.target.checked })}
              />
              Notify all users on WhatsApp (with expiry)
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={form.showInHero}
                onChange={(e) => setForm({ ...form, showInHero: e.target.checked })}
              />
              Show in homepage hero
            </label>
          </div>

          <p className="text-[10px] text-gray-500">
            WhatsApp needs Admin → WhatsApp linked. Each registered user gets one message with code and expiry.
          </p>

          <div className="border rounded-xl p-4 space-y-3 bg-gray-50">
            <p className="text-[10px] font-black uppercase text-gray-500">Restrict to (optional — leave empty for all)</p>
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">Standard / Class</p>
              <div className="flex flex-wrap gap-2">
                {CLASS_OPTIONS.map((cls) => (
                  <label key={cls} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white border rounded-lg px-2.5 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allowedClasses.includes(cls)}
                      onChange={() => toggleFormList('allowedClasses', cls)}
                    />
                    {cls}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-700 mb-2">Product type</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map((cat) => (
                  <label key={cat.id} className="inline-flex items-center gap-1.5 text-xs font-semibold bg-white border rounded-lg px-2.5 py-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.allowedCategories.includes(cat.id)}
                      onChange={() => toggleFormList('allowedCategories', cat.id)}
                    />
                    {cat.label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full md:w-auto px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create Coupon'}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-12">Loading coupons…</p>
      ) : coupons.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-12 border rounded-xl bg-gray-50">
          No coupons yet. Create your first offer above.
        </p>
      ) : (
        <div className="grid gap-3">
          {coupons.map((c) => (
            <div
              key={c.id}
              className="bg-white border rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3 justify-between"
            >
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-black text-[#2874f0] tracking-wider">{c.code}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      c.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {c.status}
                  </span>
                  {c.showInHero && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      HERO
                    </span>
                  )}
                </div>
                <p className="font-bold text-gray-900 text-sm">{c.title || c.code}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {c.offerType === 'free_book' ? (
                    <span className="inline-flex items-center gap-1">
                      <Gift className="w-3 h-3" /> Free book pick
                      {c.discountValue > 0 ? ` (max ₹${c.discountValue})` : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Percent className="w-3 h-3" />
                      {c.discountType === 'percentage' ? `${c.discountValue}% off` : `₹${c.discountValue} off`}
                    </span>
                  )}
                  {' · '}
                  {c.minimumAmount > 0 && `₹${c.minimumAmount}+ `}
                  {c.minimumQuantity > 0 && `${c.minimumQuantity}+ books `}
                  {c.minimumAmount === 0 && c.minimumQuantity === 0 && 'No minimum'}
                  {' · Expires: '}
                  {fmtExpiry(c.expiryDate)}
                  {' · Used: '}
                  {c.usedCount}/{c.usageLimit}
                  {' · Per user: '}
                  {c.perUserLimit === 0 ? '∞' : c.perUserLimit}
                  {(c.allowedClasses?.length || c.allowedCategories?.length) ? (
                    <>
                      {' · '}
                      {c.allowedClasses?.length ? `${c.allowedClasses.join(', ')} std` : ''}
                      {c.allowedClasses?.length && c.allowedCategories?.length ? ' · ' : ''}
                      {c.allowedCategories?.length ? c.allowedCategories.join(', ') : ''}
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void toggleStatus(c)}
                  className="px-3 py-1.5 text-xs font-bold border rounded-lg hover:bg-gray-50"
                >
                  {c.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteCoupon(c.id)}
                  className="px-3 py-1.5 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Recent redemptions</h3>
          <button
            type="button"
            onClick={() => void loadRedemptions()}
            className="text-xs font-bold text-[#2874f0] hover:underline"
          >
            Refresh
          </button>
        </div>
        {redemptions.length === 0 ? (
          <p className="text-xs text-gray-500">No coupon uses yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">When</th>
                  <th className="py-2 pr-3">Coupon</th>
                  <th className="py-2 pr-3">Customer</th>
                  <th className="py-2 pr-3">Order</th>
                </tr>
              </thead>
              <tbody>
                {redemptions.map((r) => (
                  <tr key={r.id} className="border-b border-gray-100">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {r.usedAt
                        ? new Date(r.usedAt).toLocaleString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td className="py-2 pr-3 font-bold text-[#2874f0]">{r.couponCode}</td>
                    <td className="py-2 pr-3">
                      {r.userName || '—'}
                      {r.userPhone ? ` · ${r.userPhone}` : ''}
                    </td>
                    <td className="py-2 pr-3">
                      {r.orderId} · ₹{Number(r.orderTotal || 0).toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
