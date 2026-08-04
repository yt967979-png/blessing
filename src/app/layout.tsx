import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { StoreProvider } from '@/context/StoreContext';
import { ClientChrome } from '@/components/layout/ClientChrome';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Blessing Power Guide — Premium Educational Books & Study Guides',
  description:
    'Quality guides for better preparation and brighter results for 6th to 12th standard students. Tamil Nadu State Board, CBSE & Matriculation.',
  manifest: '/manifest.json',
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

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover' as const,
  themeColor: '#0044AA',
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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('error', function(e) {
                if (e && e.message && (e.message.indexOf('Loading chunk') !== -1 || e.message.indexOf('ChunkLoadError') !== -1 || e.message.indexOf('Refused to execute script') !== -1)) {
                  console.warn('New deployment detected — refreshing page for latest bundle...');
                  window.location.reload();
                }
              }, true);
            `,
          }}
        />
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
        <Script
          id="register-sw"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function() {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
