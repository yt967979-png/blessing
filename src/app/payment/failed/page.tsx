import { Suspense } from 'react';
import PaymentFailedPage from './PaymentFailedClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm">Loading…</div>}>
      <PaymentFailedPage />
    </Suspense>
  );
}
