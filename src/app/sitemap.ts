import { MetadataRoute } from 'next';
import { queryDb } from '@/lib/db';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org'
  ).replace(/\/+$/, '');

  let productUrls: MetadataRoute.Sitemap = [];

  try {
    const res = await queryDb(
      `SELECT id, slug, updated_at, created_at, status FROM books WHERE status != 'archived' ORDER BY id ASC LIMIT 500`
    );
    if (res && Array.isArray(res.rows)) {
      productUrls = res.rows.map((book: any) => {
        const itemSlug = book.slug || book.id;
        const lastMod = book.updated_at
          ? new Date(book.updated_at)
          : book.created_at
          ? new Date(book.created_at)
          : new Date();
        return {
          url: `${baseUrl}/products/${encodeURIComponent(itemSlug)}`,
          lastModified: lastMod,
          changeFrequency: 'weekly' as const,
          priority: 0.8,
        };
      });
    }
  } catch {}

  const classCategoryUrls: MetadataRoute.Sitemap = [
    '6th',
    '7th',
    '8th',
    '9th',
    '10th',
    '11th',
    '12th',
  ].map((cls) => ({
    url: `${baseUrl}/search?class=${encodeURIComponent(cls)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1.0,
    },
    {
      url: `${baseUrl}/search`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/shipping-policy`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms-of-service`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    },
    ...classCategoryUrls,
    ...productUrls,
  ];
}
