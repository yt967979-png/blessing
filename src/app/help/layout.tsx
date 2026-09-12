import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Center & Live Chat Support — Blessing Power Guide',
  description:
    'Get instant help with order tracking, shipping, returns, and book inquiries. Chat with our AI assistant or connect with live support staff from Chennai.',
  openGraph: {
    title: 'Help Center & Live Chat — Blessing Power Guide',
    description: 'Instant AI support and live chat for order tracking, shipping, and book inquiries.',
  },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
