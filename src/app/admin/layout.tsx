import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Admin Portal | Blessing Power Guide',
  description: 'Store management, book inventory, orders fulfillment, and courier tracking.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
