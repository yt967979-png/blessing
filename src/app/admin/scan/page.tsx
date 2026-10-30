'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { QuickDispatchScanner } from '@/components/admin/QuickDispatchScanner';

export default function AdminScanPage() {
  const router = useRouter();

  return (
    <div className="w-full min-h-screen bg-black">
      <QuickDispatchScanner
        isOpen={true}
        onClose={() => {
          router.push('/admin');
        }}
      />
    </div>
  );
}
