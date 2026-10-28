'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, ShoppingBag, Home, MessageCircle, FileText } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { useStore } from '@/context/StoreContext';

export default function PaymentFailedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setIsCheckoutOpen, cart } = useStore();

  const reason = searchParams.get('reason') || 'failed';
  const orderId = searchParams.get('orderId') || '';
  const message =
    reason === 'dismissed'
      ? 'You closed the payment window before completing payment.'
      : reason === 'verify_failed'
        ? 'Payment may have been received by your bank, but verification took too long. Do not pay again — check your order status or contact support.'
        : reason === 'no_config'
          ? 'Online payment configuration is missing. Please contact support or try again later.'
          : 'Your online payment did not complete. No money was charged if you cancelled.';

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-12 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-3xl bg-red-100 flex items-center justify-center mb-4 text-red-600 shadow-inner">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="font-heading font-black text-2xl text-[#001B3A] mb-2">We Couldn&apos;t Complete Your Payment</h1>
        <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed max-w-md">{message}</p>

        {/* Retry & Cart Actions */}
        <div className="w-full space-y-2.5 mb-6">
          {cart.length > 0 && (
            <button
              onClick={() => {
                setIsCheckoutOpen(true);
                window.location.href = '/checkout';
                router.push('/cart');
              }}
              className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 active:scale-98 text-[#001B3A] font-extrabold text-xs py-3.5 px-6 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider min-h-12"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Checkout ({cart.length} item{cart.length !== 1 ? 's' : ''})
            </button>
          )}

          <Link
            href="/cart"
            className="w-full border border-slate-300 bg-white hover:bg-slate-50 text-[#001B3A] font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-2xs min-h-12 uppercase tracking-wider"
          >
            <ShoppingBag className="w-4 h-4" />
            View Cart & Change Items
          </Link>

          <Link
            href={`/order/status${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''}`}
            className="w-full border border-blue-200 bg-blue-50/60 hover:bg-blue-100 text-blue-800 font-bold text-xs py-3.5 rounded-xl flex items-center justify-center gap-2 shadow-2xs min-h-12"
          >
            <FileText className="w-4 h-4 text-blue-600" />
            Money Deducted? Check Order Status
          </Link>
        </div>

        {/* WhatsApp Immediate Ordering Alternative */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 w-full text-left mb-6 shadow-2xs flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-900">Having trouble with UPI / Card?</p>
            <p className="text-[11px] text-slate-500">Book directly with our Chennai team via WhatsApp</p>
          </div>
          <a
            href={`https://wa.me/919486017820?text=Hi%20Blessing%20Power%20Guide%2C%20my%20online%20payment%20failed${orderId ? `%20for%20order%20${encodeURIComponent(orderId)}` : ''}%2C%20can%20I%20book%20my%20guides%20directly%3F`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shrink-0 transition-colors shadow-xs"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp
          </a>
        </div>

        <Link href="/" className="text-xs font-semibold text-slate-600 flex items-center gap-1 hover:text-blue-600">
          <Home className="w-3.5 h-3.5" />
          Back to shop
        </Link>

        <p className="text-[10px] text-slate-400 mt-8">
          Need help? Call +91 94860 17820 / +91 63829 63350 or email blessingpowerguide@gmail.com
        </p>
      </div>

      <Footer />
    </main>
  );
}
