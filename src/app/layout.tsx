import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { StoreProvider } from '@/context/StoreContext';
import { ClientChrome } from '@/components/layout/ClientChrome';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Blessing Power Guide — Tamil Nadu State Board & CBSE Exam Guides (Class 6-12)',
    template: '%s | Blessing Power Guide',
  },
  description:
    'Official Blessing Power Guide publications for Class 6th to 12th standard students. Tamil Nadu State Board Samacheer Kalvi & CBSE exam preparation guides with fast doorstep delivery via ST Courier.',
  keywords: [
    'Blessing Power Guide',
    'Tamil Nadu State Board guides',
    'Samacheer Kalvi guides',
    'Class 10 Tamil guide',
    'Class 10 Maths guide',
    'Class 12 Physics guide Tamil Nadu',
    'Class 12 Chemistry guide',
    'CBSE study guides Tamil Nadu',
    'Blessing Tuition and Tutorials Chennai',
    'school guide books online buy',
  ],
  authors: [{ name: 'BLESSING PATHWAY EDUCATION (OPC) PRIVATE LIMITED' }],
  creator: 'Blessing Power Guide',
  publisher: 'BLESSING PATHWAY EDUCATION (OPC) PRIVATE LIMITED',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/logo.png', type: 'image/png' },
      { url: '/icon.png', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico', '/logo.png'],
    apple: [{ url: '/apple-icon.png' }],
  },
  openGraph: {
    title: 'Blessing Power Guide — Tamil Nadu State Board & CBSE Exam Guides (Class 6-12)',
    description:
      'High-scoring study guides and question banks for 6th to 12th standard students. Fast doorstep courier delivery across Tamil Nadu & South India.',
    url: siteUrl,
    siteName: 'Blessing Power Guide',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'Blessing Power Guide Publications' }],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blessing Power Guide — Tamil Nadu State Board & CBSE Exam Guides',
    description:
      'Quality guides for better preparation and brighter results for 6th to 12th standard students.',
    images: ['/logo.png'],
  },
  alternates: {
    canonical: siteUrl,
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
                  return;
                }
                // Failed <script>/<link> loads (e.g. stale /_next/static/* chunk from
                // a build that has since been redeployed) fire a resource error with
                // no useful message — detect via the target element instead.
                var target = e && e.target;
                var src = target && (target.src || target.href);
                if (target && src && typeof src === 'string' && src.indexOf('/_next/static/') !== -1
                    && (target.tagName === 'SCRIPT' || target.tagName === 'LINK')) {
                  console.warn('Stale build asset detected — refreshing page for latest bundle...');
                  window.location.reload();
                }
              }, true);
            `,
          }}
        />
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
        <Script
          id="unregister-sw"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(function(registrations) {
                  for (var registration of registrations) {
                    registration.unregister();
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
