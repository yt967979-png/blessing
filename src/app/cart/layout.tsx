import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shopping Cart | Blessing Power Guide',
  description: 'View your selected guide books and proceed to secure checkout.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function CartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
