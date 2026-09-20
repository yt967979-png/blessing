import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { StoreProvider } from '@/context/StoreContext';
import { ClientChrome } from '@/components/layout/ClientChrome';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.in';

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
      { url: '/favicon-48x48.png?v=4', sizes: '48x48', type: 'image/png' },
      { url: '/favicon.ico?v=4', sizes: 'any' },
      { url: '/icon.png?v=4', sizes: '192x192', type: 'image/png' },
      { url: '/logo.png?v=4', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/favicon-48x48.png?v=4', '/favicon.ico?v=4'],
    apple: [{ url: '/apple-touch-icon.png?v=4', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Blessing Power Guide — Tamil Nadu State Board & CBSE Exam Guides (Class 6-12)',
    description:
      'High-scoring study guides and question banks for 6th to 12th standard students. Fast doorstep courier delivery across Tamil Nadu & South India.',
    url: siteUrl,
    siteName: 'Blessing Power Guide',
    images: [{ url: '/logo.png?v=4', width: 512, height: 512, alt: 'Blessing Power Guide Publications' }],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blessing Power Guide — Tamil Nadu State Board & CBSE Exam Guides',
    description:
      'Quality guides for better preparation and brighter results for 6th to 12th standard students.',
    images: ['/logo.png?v=4'],
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        <StoreProvider>
          <ClientChrome>{children}</ClientChrome>
        </StoreProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                window.addEventListener('error', function(e) {
                  try {
                    var msg = (e && e.message) || '';
                    var target = e && e.target;
                    var src = (target && target.src) || '';
                    
                    var isChunkErr = typeof msg === 'string' && (
                      msg.indexOf('Loading chunk') !== -1 ||
                      msg.indexOf('ChunkLoadError') !== -1 ||
                      msg.indexOf('Failed to fetch dynamically imported module') !== -1
                    );
                    var isStaleScript = target && target.tagName === 'SCRIPT' &&
                      typeof src === 'string' && src.indexOf('/_next/static/') !== -1;

                    if (isChunkErr || isStaleScript) {
                      var now = Date.now();
                      var lastReload = parseInt(sessionStorage.getItem('bpg_last_chunk_reload') || '0', 10);
                      // Strict throttle: reload at most once every 30 seconds to prevent infinite reload loops
                      if (now - lastReload > 30000) {
                        sessionStorage.setItem('bpg_last_chunk_reload', String(now));
                        console.warn('New deployment detected — reloading once for latest bundle...');
                        window.location.reload();
                      } else {
                        console.warn('Stale asset reload throttled to avoid infinite loop.');
                      }
                    }
                  } catch (err) {}
                }, true);
              })();
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
