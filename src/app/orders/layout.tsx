import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Orders | Blessing Power Guide',
  description: 'View order history, receipts, and live courier tracking.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
