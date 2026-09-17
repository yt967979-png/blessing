import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.in'
  ).replace(/\/+$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/admin',
          '/admin/',
          '/api',
          '/api/',
          '/checkout',
          '/checkout/',
          '/cart',
          '/cart/',
          '/track',
          '/track/',
          '/orders',
          '/orders/',
          '/profile',
          '/profile/',
          '/payment/',
        ],
      },
      {
        userAgent: 'Googlebot-Image',
        allow: [
          '/',
          '/favicon.ico',
          '/favicon-48x48.png',
          '/icon.png',
          '/logo.png',
          '/apple-touch-icon.png',
          '/uploads/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
