import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org'
  ).replace(/\/+$/, '');

  return {
    rules: {
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
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
