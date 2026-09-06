'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Copy, Check, TicketPercent, ShoppingBag } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import type { CustomerCouponOffer } from '@/lib/coupons';
import { useCouponCatalogSync } from '@/hooks/useCouponCatalogSync';

function discountLabel(c: CustomerCouponOffer) {
  if (c.discountType === 'flat') return `₹${c.discountValue} off`;
  return `${c.discountValue}% off`;
}

export function HomeCouponsSection() {
  const { user, showToast } = useStore();
  const [coupons, setCoupons] = useState<CustomerCouponOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/coupons/available', {
        credentials: 'include',
        headers: user ? authHeaders(user) : {},
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (Array.isArray(data.coupons)) setCoupons(data.coupons);
    } catch {
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useCouponCatalogSync(load);

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

  if (loading || coupons.length === 0) return null;

  return (
    <section id="offers" className="py-10 sm:py-14 bg-white border-t border-slate-200">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-7 sm:mb-9">
          <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-800 bg-amber-100 border border-amber-300/80 px-3.5 py-1 rounded-full inline-flex items-center gap-1.5 mb-2">
            <TicketPercent className="w-3.5 h-3.5" />
            CURRENT OFFERS
          </span>
          <h2 className="font-heading font-black text-xl sm:text-3xl md:text-4xl text-[#001226] tracking-tight uppercase">
            Available coupons
          </h2>
          <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1 px-2">
            Copy a code and apply it at checkout. One use per customer account.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {coupons.map((c) => (
            <article
              key={c.id}
              className={`rounded-2xl border p-4 sm:p-5 text-left ${
                c.alreadyUsed
                  ? 'border-slate-200 bg-slate-50'
                  : 'border-amber-200 bg-gradient-to-br from-amber-50 to-white shadow-sm'
              }`}
            >
              <p className="font-heading font-black text-[#001B3A] leading-snug">{c.title}</p>
              <p className="mt-1 text-lg font-black text-amber-700">{discountLabel(c)}</p>
              <ul className="mt-3 text-[11px] sm:text-xs text-slate-600 space-y-0.5 font-semibold">
                <li>Min {c.minCartQty} books in cart</li>
                {c.minOrderAmount > 0 ? (
                  <li>Min order ₹{c.minOrderAmount.toLocaleString('en-IN')}</li>
                ) : null}
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
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void copyCode(c.code)}
                  disabled={c.alreadyUsed}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-xl border border-slate-200 bg-white text-xs font-black font-mono tracking-wider text-[#001B3A] disabled:opacity-50"
                >
                  {copied === c.code ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  {c.code}
                </button>
                {!c.alreadyUsed ? (
                  <Link
                    href="/checkout"
                    className="inline-flex items-center gap-1.5 px-3 py-2 min-h-11 rounded-xl bg-[#001B3A] text-white text-[11px] font-extrabold uppercase tracking-wide"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Checkout
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
