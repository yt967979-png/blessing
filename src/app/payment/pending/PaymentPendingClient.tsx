'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { ShieldCheck, RefreshCw, MessageCircle, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';

export default function PaymentPendingClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rzpOrderId = searchParams.get('razorpayOrderId') || searchParams.get('orderId') || '';
  const orderRef = searchParams.get('orderNumber') || rzpOrderId || 'BPG-PENDING';

  const [status, setStatus] = useState<'PENDING' | 'SUCCESS' | 'FAILED'>('PENDING');
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [checking, setChecking] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!rzpOrderId) return;
    setChecking(true);
    try {
      const res = await fetch(`/api/checkout/status?razorpayOrderId=${encodeURIComponent(rzpOrderId)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ORDER_CONFIRMED' || data.status === 'SUCCESS') {
          setStatus('SUCCESS');
          setConfirmedOrderId(data.orderId || orderRef);
          // Auto-forward to orders or success screen
          setTimeout(() => {
            router.push(`/orders?orderId=${encodeURIComponent(data.orderId || orderRef)}&success=true`);
          }, 1500);
          return;
        }
        if (data.status === 'PAYMENT_FAILED') {
          setStatus('FAILED');
          return;
        }
      }
    } catch (_) {
      // transient network hiccup, retry quietly
    } finally {
      setChecking(false);
    }
  }, [rzpOrderId, orderRef, router]);

  // Initial and periodic polling (every 3 seconds for up to 15 attempts / 45 seconds)
  useEffect(() => {
    if (status !== 'PENDING') return;

    checkStatus();
    const interval = setInterval(() => {
      setAttempts((prev) => {
        if (prev >= 15) {
          clearInterval(interval);
          return prev;
        }
        checkStatus();
        return prev + 1;
      });
    }, 3000);

    return () => clearInterval(interval);
  }, [status, checkStatus]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />

      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-12 flex flex-col items-center justify-center text-center">
        {status === 'SUCCESS' ? (
          <div className="bg-white border border-emerald-200 rounded-3xl p-8 sm:p-10 shadow-lg w-full animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h1 className="font-heading font-black text-2xl text-slate-900 mb-2">
              Payment Confirmed!
            </h1>
            <p className="text-xs text-slate-600 mb-6">
              Order #{confirmedOrderId || orderRef} verified successfully. Redirecting you to confirmation…
            </p>
            <div className="flex justify-center">
              <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" />
            </div>
          </div>
        ) : status === 'FAILED' ? (
          <div className="bg-white border border-red-200 rounded-3xl p-8 sm:p-10 shadow-lg w-full">
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-10 h-10" />
            </div>
            <h1 className="font-heading font-black text-2xl text-slate-900 mb-2">
              Payment Not Completed
            </h1>
            <p className="text-xs text-slate-600 mb-6">
              Your bank or payment provider declined the transaction. No money was charged.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href="/cart"
                className="w-full bg-[#001B3A] text-white font-bold text-xs py-3 rounded-xl uppercase tracking-wider"
              >
                Return to Cart
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-10 shadow-md w-full">
            <div className="w-20 h-20 rounded-3xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center mx-auto mb-6 shadow-inner relative">
              <ShieldCheck className="w-10 h-10 text-[#0044AA]" />
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-400 border-2 border-white flex items-center justify-center text-[#001B3A]">
                <Clock className="w-3.5 h-3.5 animate-spin" />
              </span>
            </div>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 mb-3">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
              Secure Bank Handshake
            </span>

            <h1 className="font-heading font-black text-2xl text-[#001B3A] mb-2 tracking-tight">
              Payment Verification in Progress
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
              We are verifying your transaction securely with your bank / UPI application. <strong className="text-slate-900">Please do not make another payment</strong> while confirmation completes.
            </p>

            {/* Order Reference Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left mb-6 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Reference:</span>
                <span className="font-mono font-bold text-slate-900">{orderRef}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-semibold">Verification:</span>
                <span className="text-amber-700 font-bold flex items-center gap-1">
                  <RefreshCw className={`w-3 h-3 ${checking ? 'animate-spin' : ''}`} />
                  {checking ? 'Checking live status…' : 'Syncing with Razorpay'}
                </span>
              </div>
            </div>

            {/* Reassurance Note */}
            <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-left text-[11px] text-emerald-800 mb-6">
              🔒 <strong>Your guide books are reserved:</strong> Even if your UPI app took a moment to reflect, our automated worker holds your inventory safely.
            </div>

            {/* Manual Check Button */}
            <button
              type="button"
              onClick={() => void checkStatus()}
              disabled={checking}
              className="w-full bg-[#001B3A] hover:bg-blue-900 active:scale-98 text-white font-bold text-xs py-3.5 px-6 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer mb-3 disabled:opacity-50 min-h-12"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking Status Now…' : 'Check Status Again'}
            </button>

            {/* WhatsApp Fallback */}
            <a
              href={`https://wa.me/919486017820?text=Hi%20Blessing%20Power%20Guide%2C%20my%20payment%20verification%20is%20pending%20for%20order%20${encodeURIComponent(orderRef)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors min-h-11"
            >
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              Chat with Support on WhatsApp
            </a>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
