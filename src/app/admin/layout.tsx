import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'The Ledger | Blessing Power Guide Admin',
  description: 'Operations control and dispatch management.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
