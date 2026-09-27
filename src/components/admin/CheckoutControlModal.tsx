'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Power,
  ShieldCheck,
  AlertTriangle,
  MessageSquare,
  CheckCircle2,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { DEFAULT_CHECKOUT_PAUSE_MESSAGE } from '@/lib/checkoutConstants';

interface CheckoutControlModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CheckoutControlModal: React.FC<CheckoutControlModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    isCheckoutPaused,
    checkoutPauseMessage,
    toggleCheckoutPause,
    isCheckoutControlLoading,
    showToast,
  } = useStore();

  const [pausedDraft, setPausedDraft] = useState(isCheckoutPaused);
  const [messageDraft, setMessageDraft] = useState(checkoutPauseMessage || DEFAULT_CHECKOUT_PAUSE_MESSAGE);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPausedDraft(isCheckoutPaused);
      setMessageDraft(checkoutPauseMessage || DEFAULT_CHECKOUT_PAUSE_MESSAGE);
    }
  }, [isOpen, isCheckoutPaused, checkoutPauseMessage]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await toggleCheckoutPause(pausedDraft, messageDraft.trim());
      if (res.success) {
        showToast(
          pausedDraft
            ? '⏸️ Online checkout is now PAUSED'
            : '🟢 Online checkout is now ACTIVE'
        );
        onClose();
      } else {
        showToast(`❌ Error: ${res.error || 'Failed to update'}`);
      }
    } catch (err: any) {
      showToast(`❌ Error: ${err?.message || 'Failed to update'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickToggleNow = async () => {
    const nextState = !pausedDraft;
    setPausedDraft(nextState);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs transition-colors ${
                pausedDraft
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              <Power className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight leading-tight">
                Store Checkout Switch
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Live Kill-Switch &amp; Customer Order Control
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Main Status & Interactive Toggle Card */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              pausedDraft
                ? 'bg-amber-50/80 border-amber-200/90'
                : 'bg-emerald-50/80 border-emerald-200/90'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`w-3.5 h-3.5 rounded-full ring-4 ${
                    pausedDraft
                      ? 'bg-amber-500 ring-amber-200 animate-pulse'
                      : 'bg-emerald-500 ring-emerald-200'
                  }`}
                />
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Current Mode
                  </p>
                  <p
                    className={`text-lg font-black tracking-tight ${
                      pausedDraft ? 'text-amber-900' : 'text-emerald-900'
                    }`}
                  >
                    {pausedDraft ? 'Checkout is PAUSED' : 'Checkout is ACTIVE'}
                  </p>
                </div>
              </div>

              {/* Big Interactive Slide Toggle */}
              <button
                type="button"
                onClick={handleQuickToggleNow}
                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  pausedDraft
                    ? 'bg-amber-500 focus:ring-amber-400'
                    : 'bg-emerald-500 focus:ring-emerald-400'
                }`}
                title={pausedDraft ? 'Click to Activate Checkout' : 'Click to Pause Checkout'}
                aria-pressed={!pausedDraft}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                    pausedDraft ? 'translate-x-1.5' : 'translate-x-8.5'
                  }`}
                />
              </button>
            </div>

            <p className="text-xs text-slate-600 mt-3 pt-3 border-t border-slate-200/60 leading-relaxed">
              {pausedDraft ? (
                <>
                  <strong className="text-amber-900 font-bold">Action Active:</strong> Online Razorpay payments and order placement are disabled. Customers see your pause notice and are directed to WhatsApp.
                </>
              ) : (
                <>
                  <strong className="text-emerald-900 font-bold">Store Open:</strong> Students can smoothly add books to cart, complete payment via Razorpay, and trigger ST Courier dispatch.
                </>
              )}
            </p>
          </div>

          {/* Customer Notice Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="checkout-pause-message"
                className="text-xs font-bold text-slate-800 flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                <span>Customer Notice (Shown on Cart &amp; Checkout)</span>
              </label>
              <button
                type="button"
                onClick={() => setMessageDraft(DEFAULT_CHECKOUT_PAUSE_MESSAGE)}
                className="text-[11px] font-semibold text-[#2874f0] hover:underline cursor-pointer"
              >
                Reset to Default
              </button>
            </div>
            <textarea
              id="checkout-pause-message"
              rows={3}
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              placeholder="Enter the notice message shown to customers when checkout is paused..."
              className="w-full text-xs p-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-[#2874f0] focus:ring-2 focus:ring-blue-100 transition-all outline-none resize-none leading-relaxed"
            />
            <p className="text-[11px] text-slate-400">
              💡 Tip: Include WhatsApp contact number (+91-9486017820) so students can still order manually.
            </p>
          </div>

          {/* Quick Info Box */}
          <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed text-[11px]">
              Toggling checkout updates the PostgreSQL database and flushes Redis cache instantly. The change applies live across all customer browser tabs without requiring a server reboot.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isCheckoutControlLoading}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
              pausedDraft
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving to Server…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>
                  {pausedDraft ? 'Apply Checkout Pause' : 'Activate Online Checkout'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutControlModal;
