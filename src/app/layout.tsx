import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { StoreProvider } from '@/context/StoreContext';
import { ClientChrome } from '@/components/layout/ClientChrome';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.in';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Blessing Power Guide — Premium Educational Books & Study Guides',
  description:
    'Quality guides for better preparation and brighter results for 6th to 12th standard students. Tamil Nadu State Board, CBSE & Matriculation.',
  icons: {
    icon: [{ url: '/logo.png', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png' }],
    shortcut: '/logo.png',
  },
  openGraph: {
    title: 'Blessing Power Guide',
    description:
      'Quality guides for better preparation and brighter results for 6th to 12th standard students.',
    url: '/',
    siteName: 'Blessing Power Guide',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Blessing Power Guide' }],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Blessing Power Guide',
    description:
      'Quality guides for better preparation and brighter results for 6th to 12th standard students.',
    images: ['/logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <StoreProvider>
          <ClientChrome>{children}</ClientChrome>
        </StoreProvider>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
