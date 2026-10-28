import type { Metadata } from 'next';
import { Suspense } from 'react';
import OrderStatusClient from './OrderStatusClient';

export const metadata: Metadata = {
  title: 'Order Status & Recovery | Blessing Power Guide',
  description: 'Lookup and recover your Blessing Power Guide order status, ST Courier tracking, and Tax Invoice.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm font-semibold text-slate-500">
          Loading order status…
        </div>
      }
    >
      <OrderStatusClient />
    </Suspense>
  );
}
