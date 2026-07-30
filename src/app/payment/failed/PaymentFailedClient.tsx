'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertCircle, RefreshCw, ShoppingBag, Home } from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { Footer } from '@/components/layout/Footer';
import { useStore } from '@/context/StoreContext';

export default function PaymentFailedPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setIsCheckoutOpen, cart } = useStore();

  const reason = searchParams.get('reason') || 'failed';
  const message =
    reason === 'dismissed'
      ? 'You closed the payment window before completing payment.'
      : reason === 'verify_failed'
        ? 'Payment was received but verification failed. Do not pay again — contact support with your UPI reference.'
        : reason === 'no_config'
          ? 'Online payment is not available yet. Please use Cash on Delivery or try again later.'
          : 'Your online payment did not complete. No money was charged if you cancelled.';

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <Header />
      <NavBar />

      <div className="flex-1 max-w-lg mx-auto w-full px-4 py-12 flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="font-heading font-black text-2xl text-[#001B3A] mb-2">Payment Not Completed</h1>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">{message}</p>

        {cart.length > 0 && (
          <button
            onClick={() => {
              setIsCheckoutOpen(true);
              window.location.href = '/checkout';
              router.push('/cart');
            }}
            className="w-full bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-sm py-3.5 px-6 rounded-xl shadow-md flex items-center justify-center gap-2 mb-3"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Checkout ({cart.length} item{cart.length !== 1 ? 's' : ''})
          </button>
        )}

        <Link
          href="/cart"
          className="w-full border border-slate-300 bg-white text-[#001B3A] font-bold text-sm py-3 rounded-xl flex items-center justify-center gap-2 mb-3"
        >
          <ShoppingBag className="w-4 h-4" />
          View Cart
        </Link>

        <Link href="/" className="text-xs font-semibold text-blue-600 flex items-center gap-1 hover:underline">
          <Home className="w-3.5 h-3.5" />
          Back to shop
        </Link>

        <p className="text-[10px] text-slate-400 mt-8">
          Need help? WhatsApp +91 98404 18228 or email blessingpowerguide@gmail.com
        </p>
      </div>

      <Footer />
    </main>
  );
}
