'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  TicketPercent,
  Check,
  Copy,
  Sparkles,
  Lock,
  Tag,
  Loader2,
  AlertCircle,
  ShoppingBag,
} from 'lucide-react';

export type CouponItem = {
  id: string;
  code: string;
  title?: string;
  discountType: 'percentage' | 'flat';
  discountValue: number;
  minCartQty: number;
  minOrderAmount: number;
  maxDiscountAmount?: number | null;
  expiresAt?: string | null;
  alreadyUsed?: boolean;
};

interface SwiggyCouponsModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableCoupons: CouponItem[];
  appliedCoupon: {
    code: string;
    discountAmount: number;
    message?: string;
  } | null;
  cartTotal: number;
  cartCount: number;
  effectiveCartCount?: number;
  hasCombo: boolean;
  onApplyCoupon: (code: string) => Promise<boolean | { ok: boolean; error?: string } | void>;
  onRemoveCoupon?: () => void;
  isApplying?: boolean;
}

export const SwiggyCouponsModal: React.FC<SwiggyCouponsModalProps> = ({
  isOpen,
  onClose,
  availableCoupons,
  appliedCoupon,
  cartTotal,
  cartCount,
  effectiveCartCount,
  hasCombo,
  onApplyCoupon,
  onRemoveCoupon,
  isApplying = false,
}) => {
  const [manualCode, setManualCode] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [submittingCode, setSubmittingCode] = useState<string | null>(null);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Reset internal errors on open
  useEffect(() => {
    if (isOpen) {
      setErrorMsg(null);
      setManualCode('');
    }
  }, [isOpen]);

  const totalBooks = effectiveCartCount !== undefined ? effectiveCartCount : cartCount;

  // Handle manual code submit
  const handleManualApply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = manualCode.trim().toUpperCase();
    if (!clean) {
      setErrorMsg('Please enter a coupon code');
      return;
    }
    setErrorMsg(null);
    setSubmittingCode(clean);
    try {
      const result = await onApplyCoupon(clean);
      if (result && typeof result === 'object' && 'ok' in result) {
        if (!result.ok) {
          setErrorMsg(result.error || 'Invalid or ineligible coupon code.');
        } else {
          onClose();
        }
      } else if (result === false) {
        setErrorMsg('Invalid or ineligible coupon code.');
      } else {
        // Successfully applied - auto close sheet
        onClose();
      }
    } catch {
      setErrorMsg('Could not apply coupon. Please try again.');
    } finally {
      setSubmittingCode(null);
    }
  };

  // Handle single card click
  const handleCardApply = async (code: string) => {
    setErrorMsg(null);
    setSubmittingCode(code);
    try {
      const result = await onApplyCoupon(code);
      if (result && typeof result === 'object' && 'ok' in result) {
        if (!result.ok) {
          setErrorMsg(result.error || `Coupon ${code} could not be applied.`);
        } else {
          onClose();
        }
      } else if (result === false) {
        setErrorMsg(`Coupon ${code} could not be applied.`);
      } else {
        onClose();
      }
    } catch {
      setErrorMsg('Could not apply coupon. Please try again.');
    } finally {
      setSubmittingCode(null);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Helper to format discount label
  const getDiscountBadge = (c: CouponItem) => {
    if (c.discountType === 'flat') {
      return `₹${c.discountValue} OFF`;
    }
    return `${c.discountValue}% OFF`;
  };

  const couponsToDisplay: CouponItem[] = availableCoupons || [];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
          {/* Dimmed backdrop with blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs cursor-pointer"
            aria-hidden="true"
          />

          {/* Modal / Bottom-Sheet Container */}
          <motion.div
            initial={{ y: '100%', opacity: 0.9 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.9 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="coupons-modal-title"
            className="relative w-full sm:max-w-xl max-h-[88vh] sm:max-h-[84vh] bg-slate-50 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden z-10 border border-slate-200/80"
          >
            {/* Mobile swipe-down pull indicator bar */}
            <div className="sm:hidden pt-2.5 pb-1 flex justify-center">
              <div className="w-12 h-1.5 bg-slate-300 rounded-full" />
            </div>

            {/* Modal Header */}
            <div className="px-5 sm:px-6 pt-3 pb-4 bg-white border-b border-slate-200/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center shadow-xs">
                  <TicketPercent className="w-5 h-5" />
                </div>
                <div>
                  <h2
                    id="coupons-modal-title"
                    className="font-heading font-black text-lg sm:text-xl text-[#001B3A] tracking-tight flex items-center gap-1.5"
                  >
                    <span>Available Coupons</span>
                    <Sparkles className="w-4 h-4 text-amber-500 inline" />
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    Apply coupons to claim instant discounts on this order
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close coupons"
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-600 flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Live Cart Status Banner */}
            <div className="px-5 sm:px-6 py-2.5 bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-purple-50/80 border-b border-blue-100 flex items-center justify-between text-xs text-slate-700 shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-blue-600" />
                <span className="font-semibold">
                  Cart Subtotal: <strong className="text-slate-900 font-black">₹{cartTotal.toLocaleString('en-IN')}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="font-semibold">
                  {totalBooks} {totalBooks === 1 ? 'Book' : 'Books'}
                  {hasCombo && <span className="text-emerald-700 font-bold ml-1">(Combo Pack)</span>}
                </span>
              </div>
              {appliedCoupon && (
                <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  <Check className="w-3 h-3" />
                  {appliedCoupon.code} Active (-₹{appliedCoupon.discountAmount})
                </span>
              )}
            </div>

            {/* Promo Code Manual Input Form */}
            <div className="px-5 sm:px-6 py-3.5 bg-white border-b border-slate-200/60 shrink-0">
              <form onSubmit={handleManualApply} className="flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                    <Tag className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => {
                      setManualCode(e.target.value.toUpperCase());
                      setErrorMsg(null);
                    }}
                    placeholder="ENTER COUPON CODE"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono font-black uppercase tracking-wider text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!manualCode.trim() || isApplying || submittingCode !== null}
                  className="px-5 py-2.5 bg-[#001B3A] hover:bg-blue-600 active:bg-blue-700 disabled:opacity-40 disabled:pointer-events-none text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center shrink-0 min-w-20 shadow-xs"
                >
                  {submittingCode === manualCode.trim().toUpperCase() || isApplying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'APPLY'
                  )}
                </button>
              </form>

              {errorMsg && (
                <div className="mt-2 text-xs font-semibold text-red-600 flex items-center gap-1.5 animate-in fade-in">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Scrollable Coupons List */}
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4 space-y-3.5 divide-y divide-transparent">
              <div className="flex items-center justify-between text-xs font-extrabold text-slate-500 uppercase tracking-wider px-1">
                <span>Available Offers ({couponsToDisplay.length})</span>
                {couponsToDisplay.length > 0 && (
                  <span className="text-[11px] font-normal normal-case text-slate-400">
                    Select any coupon to apply instantly
                  </span>
                )}
              </div>

              {couponsToDisplay.length === 0 ? (
                <div className="py-12 px-4 text-center space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 mx-auto flex items-center justify-center shadow-xs">
                    <TicketPercent className="w-7 h-7" />
                  </div>
                  <div>
                    <h3 className="font-heading font-black text-slate-800 text-base">No active coupons available</h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      All promotional coupons are currently inactive or redeemed. If you have an exclusive coupon code from an offer, type it in the box above!
                    </p>
                  </div>
                </div>
              ) : (
                couponsToDisplay.map((coupon) => {
                const isCurrentlyApplied = appliedCoupon?.code?.toUpperCase() === coupon.code.toUpperCase();
                const meetsQty = hasCombo || totalBooks >= coupon.minCartQty;
                const meetsSubtotal = cartTotal >= coupon.minOrderAmount;
                const isEligible = !coupon.alreadyUsed && meetsQty && meetsSubtotal;
                const isProcessing = submittingCode === coupon.code;

                // Missing conditions
                const neededBooks = Math.max(0, coupon.minCartQty - totalBooks);
                const neededAmount = Math.max(0, coupon.minOrderAmount - cartTotal);

                return (
                  <div
                    key={coupon.id || coupon.code}
                    className={`relative rounded-2xl border transition-all overflow-hidden ${
                      isCurrentlyApplied
                        ? 'border-emerald-400 bg-emerald-50/50 shadow-sm'
                        : isEligible
                        ? 'border-slate-200 hover:border-amber-400 bg-white hover:shadow-md'
                        : 'border-slate-200/70 bg-slate-100/60 opacity-80'
                    }`}
                  >
                    {/* Swiggy ticket style side cutout notches */}
                    <div className="hidden sm:block absolute -left-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-50 border-r border-slate-200/80 z-10 pointer-events-none" />
                    <div className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-50 border-l border-slate-200/80 z-10 pointer-events-none" />

                    <div className="p-4 sm:p-4.5">
                      {/* Top Row: Coupon Code + Discount Tag + Apply Button */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Code Pill with dashed border */}
                          <div className="flex items-center gap-1.5 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg px-2.5 py-1">
                            <span className="font-mono font-black text-sm text-[#001B3A] tracking-wider">
                              {coupon.code}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyCode(coupon.code)}
                              title="Copy code"
                              className="text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                            >
                              {copiedCode === coupon.code ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          {/* Savings Badge */}
                          <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            {getDiscountBadge(coupon)}
                          </span>
                        </div>

                        {/* Action CTA */}
                        <div>
                          {isCurrentlyApplied ? (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 bg-emerald-100 px-2.5 py-1.5 rounded-xl">
                                <Check className="w-3.5 h-3.5" />
                                Applied
                              </span>
                              {onRemoveCoupon && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onRemoveCoupon();
                                  }}
                                  className="text-xs font-bold text-red-600 hover:text-red-700 underline cursor-pointer"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ) : isEligible ? (
                            <button
                              type="button"
                              disabled={isProcessing || isApplying}
                              onClick={() => handleCardApply(coupon.code)}
                              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xs transition-transform active:scale-95 cursor-pointer flex items-center gap-1 shrink-0"
                            >
                              {isProcessing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <span>APPLY</span>
                                  <Sparkles className="w-3 h-3 text-amber-300" />
                                </>
                              )}
                            </button>
                          ) : coupon.alreadyUsed ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 bg-slate-200/80 px-2 py-1 rounded-lg">
                              Already Used
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-100/90 px-2 py-1 rounded-lg">
                              <Lock className="w-3 h-3" />
                              Locked
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Offer Description */}
                      <div className="mt-2.5">
                        <p className="text-xs font-bold text-slate-800 leading-snug">
                          {coupon.title || (coupon.discountType === 'flat' ? `Flat ₹${coupon.discountValue} OFF` : `${coupon.discountValue}% OFF on order`)}
                        </p>
                      </div>

                      {/* Terms & Criteria Checklist */}
                      <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1 text-[11px]">
                        {coupon.minCartQty > 0 && (
                          <div
                            className={`flex items-center gap-1.5 ${
                              meetsQty ? 'text-emerald-700 font-semibold' : 'text-slate-500 font-medium'
                            }`}
                          >
                            {meetsQty ? (
                              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0 ml-0.5 mr-1" />
                            )}
                            <span>
                              Valid on {coupon.minCartQty} or more books (or any 1 Combo Pack)
                            </span>
                          </div>
                        )}

                        {coupon.minOrderAmount > 0 && (
                          <div
                            className={`flex items-center gap-1.5 ${
                              meetsSubtotal ? 'text-emerald-700 font-semibold' : 'text-slate-500 font-medium'
                            }`}
                          >
                            {meetsSubtotal ? (
                              <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                            ) : (
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0 ml-0.5 mr-1" />
                            )}
                            <span>
                              Minimum order value: ₹{coupon.minOrderAmount.toLocaleString('en-IN')}
                            </span>
                          </div>
                        )}

                        {coupon.maxDiscountAmount && coupon.discountType === 'percentage' && (
                          <div className="text-slate-400 font-medium pl-3.5">
                            Maximum discount up to ₹{coupon.maxDiscountAmount.toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>

                      {/* Unlocking Banner if NOT eligible */}
                      {!isEligible && !coupon.alreadyUsed && (
                        <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200/80 rounded-xl flex items-center justify-between text-[11px] text-amber-900 font-bold">
                          <span>
                            {neededBooks > 0 && neededAmount > 0
                              ? `Add ${neededBooks} more book(s) & ₹${neededAmount} to unlock`
                              : neededBooks > 0
                              ? `Add ${neededBooks} more book(s) to unlock this offer`
                              : `Add ₹${neededAmount} more to unlock this offer`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }))}
            </div>

            {/* Modal Footer info note */}
            <div className="px-5 sm:px-6 py-3 bg-slate-100 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
              <span>Closing this window keeps your checkout details intact.</span>
              <button
                type="button"
                onClick={onClose}
                className="font-bold text-[#001B3A] hover:underline cursor-pointer"
              >
                Back to Checkout
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
