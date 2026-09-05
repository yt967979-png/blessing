'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, Check, Gift, TicketPercent, ShoppingBag } from 'lucide-react';
import { authHeaders } from '@/lib/clientAuth';
import type { UserData } from '@/context/StoreContext';
import type { CustomerCouponOffer } from '@/lib/coupons';

function discountLabel(c: CustomerCouponOffer) {
  if (c.discountType === 'flat') return `₹${c.discountValue} off`;
  return `${c.discountValue}% off`;
}

export function ProfileCouponsSection({
  user,
  showToast,
}: {
  user: UserData;
  showToast: (msg: string) => void;
}) {
  const [coupons, setCoupons] = useState<CustomerCouponOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/coupons/available', {
          credentials: 'include',
          headers: authHeaders(user),
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled && Array.isArray(data.coupons)) setCoupons(data.coupons);
      } catch {
        if (!cancelled) setCoupons([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      showToast(`Copied ${code}`);
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      showToast('Could not copy code');
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 md:p-8 shadow-xs space-y-5">
      <div className="pb-4 border-b border-slate-100">
        <h2 className="font-heading font-black text-xl text-[#001B3A] flex items-center gap-2">
          <TicketPercent className="w-5 h-5 text-amber-500" />
          Available coupons
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Copy a code and apply it at checkout. Each coupon can be used once per account.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 py-10 text-center">Loading offers…</p>
      ) : coupons.length === 0 ? (
        <div className="text-center py-10 space-y-2">
          <Gift className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="font-bold text-slate-700">No coupons available right now</p>
          <p className="text-xs text-slate-500">When the shop adds an offer, it will show here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {coupons.map((c) => (
            <li
              key={c.id}
              className={`rounded-2xl border p-4 ${
                c.alreadyUsed
                  ? 'border-slate-200 bg-slate-50 opacity-80'
                  : 'border-amber-200/80 bg-gradient-to-br from-amber-50/80 to-white'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start gap-3 justify-between">
                <div className="min-w-0">
                  <p className="font-heading font-black text-[#001B3A] leading-snug">{c.title}</p>
                  <p className="mt-1 text-sm font-black text-amber-700">{discountLabel(c)}</p>
                  <ul className="mt-2 text-[11px] text-slate-600 space-y-0.5 font-semibold">
                    <li>Min {c.minCartQty} books in cart</li>
                    {c.minOrderAmount > 0 ? <li>Min order ₹{c.minOrderAmount.toLocaleString('en-IN')}</li> : null}
                    {c.maxDiscountAmount != null && c.discountType === 'percentage' ? (
                      <li>Max discount ₹{c.maxDiscountAmount.toLocaleString('en-IN')}</li>
                    ) : null}
                    <li>
                      {c.expiresAt
                        ? `Valid till ${new Date(c.expiresAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}`
                        : 'No expiry date'}
                    </li>
                    <li>One use per account</li>
                  </ul>
                  {c.alreadyUsed ? (
                    <p className="mt-2 text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">
                      Already used on your account
                    </p>
                  ) : null}
                </div>
                <div className="flex sm:flex-col gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void copyCode(c.code)}
                    disabled={c.alreadyUsed}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black font-mono tracking-wider text-[#001B3A] disabled:opacity-50"
                  >
                    {copied === c.code ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {c.code}
                  </button>
                  {!c.alreadyUsed ? (
                    <Link
                      href="/checkout"
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#001B3A] text-white text-[11px] font-extrabold uppercase tracking-wide"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      Checkout
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
