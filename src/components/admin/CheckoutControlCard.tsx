'use client';

import React, { useState } from 'react';
import {
  Power,
  ShieldCheck,
  PauseCircle,
  PlayCircle,
  Settings2,
  AlertCircle,
  MessageSquare,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { DEFAULT_CHECKOUT_PAUSE_MESSAGE } from '@/lib/checkoutConstants';
import CheckoutControlModal from './CheckoutControlModal';

export const CheckoutControlCard: React.FC = () => {
  const {
    isCheckoutPaused,
    checkoutPauseMessage,
    toggleCheckoutPause,
    isCheckoutControlLoading,
    showToast,
  } = useStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isQuickToggling, setIsQuickToggling] = useState(false);

  const handleQuickToggle = async () => {
    const nextState = !isCheckoutPaused;
    const confirmText = nextState
      ? 'Are you sure you want to PAUSE online checkout?\n\nStudents will not be able to place orders via Razorpay until you resume it.'
      : 'Resume online checkout now?\n\nStudents will immediately be able to place orders and pay via Razorpay.';

    if (!window.confirm(confirmText)) {
      return;
    }

    setIsQuickToggling(true);
    try {
      const res = await toggleCheckoutPause(nextState);
      if (res.success) {
        showToast(
          nextState
            ? '⏸️ Online checkout is now PAUSED'
            : '🟢 Online checkout is now ACTIVE'
        );
      } else {
        showToast(`❌ Failed: ${res.error || 'Server error'}`);
      }
    } catch (err: any) {
      showToast(`❌ Failed: ${err?.message || 'Server error'}`);
    } finally {
      setIsQuickToggling(false);
    }
  };

  return (
    <>
      <div
        className={`rounded-2xl border p-5 shadow-xs transition-all ${
          isCheckoutPaused
            ? 'bg-gradient-to-br from-amber-50/90 to-amber-100/40 border-amber-200'
            : 'bg-gradient-to-br from-emerald-50/90 to-emerald-100/40 border-emerald-200'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Status Left Column */}
          <div className="flex items-start sm:items-center gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-xs ${
                isCheckoutPaused
                  ? 'bg-amber-500 text-white shadow-amber-500/20'
                  : 'bg-emerald-600 text-white shadow-emerald-500/20'
              }`}
            >
              {isCheckoutPaused ? (
                <PauseCircle className="w-6 h-6" />
              ) : (
                <PlayCircle className="w-6 h-6" />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ring-4 ${
                    isCheckoutPaused
                      ? 'bg-amber-500 ring-amber-200 animate-pulse'
                      : 'bg-emerald-500 ring-emerald-200'
                  }`}
                />
                <h3 className="font-extrabold text-base text-slate-900 tracking-tight leading-tight">
                  {isCheckoutPaused
                    ? 'Store Checkout: PAUSED'
                    : 'Store Checkout: ACTIVE & OPEN'}
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {isCheckoutPaused
                  ? 'Online payments disabled. Students are directed to WhatsApp for inquiries.'
                  : 'Razorpay gateway is active. Customers can freely place guide book orders.'}
              </p>
            </div>
          </div>

          {/* Action Buttons Right Column */}
          <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
            {/* Quick 1-Click Toggle */}
            <button
              type="button"
              onClick={handleQuickToggle}
              disabled={isQuickToggling || isCheckoutControlLoading}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                isCheckoutPaused
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                  : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-600/20'
              }`}
              title={isCheckoutPaused ? 'Resume checkout now' : 'Pause checkout now'}
            >
              {isQuickToggling || isCheckoutControlLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : isCheckoutPaused ? (
                <PlayCircle className="w-3.5 h-3.5" />
              ) : (
                <PauseCircle className="w-3.5 h-3.5" />
              )}
              <span>
                {isQuickToggling
                  ? 'Updating…'
                  : isCheckoutPaused
                  ? 'Resume Checkout'
                  : 'Pause Checkout'}
              </span>
            </button>

            {/* Configure Notice Button */}
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
              title="Configure notice message and advanced options"
            >
              <Settings2 className="w-3.5 h-3.5 text-slate-500" />
              <span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>

        {/* Notice Preview if Paused */}
        {isCheckoutPaused && (
          <div className="mt-4 pt-3.5 border-t border-amber-200/80 flex items-start gap-2.5 text-xs text-amber-900 bg-amber-50/70 p-3 rounded-xl">
            <MessageSquare className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="font-bold block text-[11px] uppercase tracking-wider text-amber-800">
                Active Customer Notice:
              </span>
              <p className="mt-0.5 text-slate-700 line-clamp-2 italic">
                &ldquo;{checkoutPauseMessage || DEFAULT_CHECKOUT_PAUSE_MESSAGE}&rdquo;
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="text-[11px] font-bold text-blue-700 hover:underline shrink-0 cursor-pointer self-center"
            >
              Edit Notice
            </button>
          </div>
        )}
      </div>

      <CheckoutControlModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
};

export default CheckoutControlCard;
