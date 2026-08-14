import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Track Order | Blessing Power Guide',
  description: 'Track your Blessing Power Guide book shipment live via ST Courier Express.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function TrackLayout({ children }: { children: React.ReactNode }) {
  return children;
}
