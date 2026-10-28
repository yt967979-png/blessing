import type { Metadata } from 'next';
import { Suspense } from 'react';
import PaymentPendingClient from './PaymentPendingClient';

export const metadata: Metadata = {
  title: 'Verifying Payment | Blessing Power Guide',
  description: 'Your payment verification is in progress. Please do not make another payment while we verify your transaction.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm font-semibold text-slate-500">
          Loading verification status…
        </div>
      }
    >
      <PaymentPendingClient />
    </Suspense>
  );
}
