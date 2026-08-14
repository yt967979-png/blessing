import type { Metadata } from 'next';
import { Suspense } from 'react';
import PaymentFailedPage from './PaymentFailedClient';

export const metadata: Metadata = {
  title: 'Payment Incomplete | Blessing Power Guide',
  robots: {
    index: false,
    follow: false,
  },
};

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm">Loading…</div>}>
      <PaymentFailedPage />
    </Suspense>
  );
}
