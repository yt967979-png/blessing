import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';
import { queryDb } from '@/lib/db';
import { isBookInStock } from '@/lib/stock';
import { redisGetJson, redisSetJson } from '@/lib/redis';

// Next.js ISR: cache rendered HTML on server for 60 seconds (drastically lowers CPU usage)
export const revalidate = 60;

type Props = { params: Promise<{ slug: string }> };

// In-process cache to avoid DB roundtrips for repeated requests
const metaMemoryCache = new Map<string, { data: any; timestamp: number }>();
const META_TTL_MS = 60_000; // 1 minute local process cache

export function invalidateMetaMemoryCache(slug?: string) {
  if (slug) {
    metaMemoryCache.delete(String(slug).toLowerCase().trim());
  } else {
    metaMemoryCache.clear();
  }
}

function trimDescription(text: string | null | undefined, maxChars = 155): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 100 ? `${cut.slice(0, lastSpace)}...` : `${cut}...`;
}

async function getBookMeta(slug: string) {
  const cleanSlug = String(slug || '').trim().toLowerCase();
  const now = Date.now();

  // 1. Check local process memory cache
  const mem = metaMemoryCache.get(cleanSlug);
  if (mem && now - mem.timestamp < META_TTL_MS) {
    return mem.data;
  }

  // 2. Check Redis cache
  try {
    const redisVal = await redisGetJson<any>(`book_meta:${cleanSlug}`);
    if (redisVal) {
      metaMemoryCache.set(cleanSlug, { data: redisVal, timestamp: now });
      return redisVal;
    }
  } catch {}

  // 3. Fall back to PostgreSQL query
  try {
    const res = await queryDb(
      `SELECT b.id, b.slug, b.title, b.description,
              b.category_id,
              b.subject,
              CASE
                WHEN b.cover_image IS NULL OR b.cover_image = '' THEN NULL
                WHEN b.cover_image LIKE 'data:%' THEN NULL
                WHEN length(b.cover_image) > 2048 THEN NULL
                ELSE b.cover_image
              END AS cover_image,
              b.discount_price, b.price, b.status, b.stock,
              b.sample_pdf_url,
              b.updated_at,
              COALESCE(COUNT(r.id), 0)::int as review_count,
              COALESCE(AVG(r.rating), 0)::numeric(3,1) as avg_rating
       FROM books b
       LEFT JOIN reviews r ON b.id = r.book_id
       WHERE b.slug = $1 OR b.id = $1 OR b.slug ILIKE $1
       GROUP BY b.id LIMIT 1`,
      [slug]
    );
    if (!res.rows || res.rows.length === 0) return null;
    const row = res.rows[0];
    const safeTitle = String(row.title || '');
    const catMatch = String(row.category_id || '').match(/^cat-(6th|7th|8th|9th|10th|11th|12th)$/i);
    const classMatch = safeTitle.match(/(6th|7th|8th|9th|10th|11th|12th)/i);
    const extractedClass = catMatch
      ? catMatch[1].toLowerCase()
      : classMatch
        ? classMatch[0].toLowerCase()
        : '10th';
    const result = {
      ...row,
      class_standard: extractedClass,
    };

    metaMemoryCache.set(cleanSlug, { data: result, timestamp: now });
    void redisSetJson(`book_meta:${cleanSlug}`, result, 300);

    return result;
  } catch (err) {
    console.error('getBookMeta error for slug', slug, err);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBookMeta(slug);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.in';

  if (!book) {
    return {
      title: 'Book Not Found | Blessing Power Guide',
      description: 'This guide book was not found in our catalog.',
      robots: { index: false, follow: false },
    };
  }

  const cls = book.class_standard ? `Class ${book.class_standard}` : '';
  const subj = book.subject ? `${book.subject}` : 'Guide';
  const price = Number(book.discount_price || book.price || 0);

  // Example: 10th Standard Mathematics Guide | Class 10 Maths Guide | Blessing Power Guide
  const title = `${book.title}${cls ? ` | ${cls} ${subj}` : ''} | Blessing Power Guide`;

  const fallbackDesc = `Buy ${book.title}${cls ? ` for ${cls}` : ''} online at ₹${price}. Official Blessing Power Guide for Tamil Nadu State Board & CBSE with fast ST Courier delivery.`;
  const rawDesc = book.description ? trimDescription(book.description, 155) : '';
  const description = rawDesc.length >= 40 ? rawDesc : fallbackDesc;

  const coverUrl =
    book.cover_image &&
    !String(book.cover_image).startsWith('data:') &&
    String(book.cover_image).length <= 2048
      ? String(book.cover_image)
      : `${siteUrl}/logo.png`;

  const canonicalUrl = `${siteUrl}/products/${slug}`;

  return {
    title,
    description,
    keywords: [
      book.title,
      cls,
      subj,
      `${cls} ${subj} guide`,
      'Blessing Power Guide',
      'Tamil Nadu Samacheer Kalvi',
      'buy school guide online',
    ].filter(Boolean),
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: [
        {
          url: coverUrl,
          alt: `${book.title} cover — Blessing Power Guide`,
        },
      ],
      siteName: 'Blessing Power Guide',
      type: 'website',
      locale: 'en_IN',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [coverUrl],
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

function mapBookToClientProduct(book: any) {
  if (!book) return null;
  const mrp = Number(book.price) || 0;
  const rawSale = book.discount_price == null || book.discount_price === '' ? NaN : Number(book.discount_price);
  const hasSale = Number.isFinite(rawSale) && rawSale > 0 && rawSale < mrp;
  const price = hasSale ? rawSale : mrp;
  const discount = hasSale && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;
  const safeImg =
    book.cover_image &&
    !String(book.cover_image).startsWith('data:') &&
    String(book.cover_image).length <= 2048
      ? String(book.cover_image)
      : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80';

  return {
    id: book.id,
    slug: book.slug || book.id,
    title: book.title,
    subtitle: `${book.class_standard || '10th'} Standard Guide`,
    cls: book.class_standard || '10th',
    category: book.category_id === 'cat-combos' ? 'combo' : 'guide',
    subject: book.subject || 'General',
    price,
    mrp,
    discount,
    rating: Number(book.review_count) > 0 ? Number(book.avg_rating || 0) : 0,
    reviews: Number(book.review_count || 0),
    badge: book.badge || '',
    badgeColor: (book.badge && String(book.badge).trim())
      ? String(book.badge).toUpperCase().includes('COMBO')
        ? 'bg-purple-600'
        : 'bg-blue-600'
      : 'bg-blue-600',
    image: safeImg,
    hoverImage: safeImg,
    description: book.description || `Complete ${book.class_standard || '10th'} Standard guide book for exam success.`,
    samplePdfUrl: book.sample_pdf_url || null,
    inStock: isBookInStock(book),
    stock: Math.max(0, Math.floor(Number(book.stock) || 0)),
    features: ['Solved Papers', 'Chapter Notes'],
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const book = await getBookMeta(slug);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.in';

  const price = Number(book?.discount_price || book?.price || 0);
  const inStock = book ? isBookInStock(book) : true;
  const reviewCount = Number(book?.review_count || 0);
  const safeCover =
    book?.cover_image &&
    !String(book.cover_image).startsWith('data:') &&
    String(book.cover_image).length <= 2048
      ? String(book.cover_image)
      : `${siteUrl}/logo.png`;

  const productUrl = `${siteUrl}/products/${slug}`;
  const cls = book?.class_standard ? `Class ${book.class_standard}` : 'Guide Books';

  // Schema.org JSON-LD — Product Markup
  const productSchema = book
    ? {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: book.title,
        image: [safeCover],
        description:
          book.description ||
          `Official ${book.title} exam preparation guide book published by Blessing Power Guide.`,
        sku: book.id,
        brand: {
          '@type': 'Brand',
          name: 'Blessing Power Guide',
        },
        offers: {
          '@type': 'Offer',
          url: productUrl,
          priceCurrency: 'INR',
          price,
          priceValidUntil: new Date(Date.now() + 31536000000).toISOString().slice(0, 10),
          itemCondition: 'https://schema.org/NewCondition',
          availability: inStock
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          seller: {
            '@type': 'Organization',
            name: 'Blessing Power Guide',
          },
        },
        ...(reviewCount > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: Number(book.avg_rating || 0),
                reviewCount,
              },
            }
          : {}),
      }
    : null;

  // Schema.org JSON-LD — BreadcrumbList Markup
  const breadcrumbSchema = book
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: siteUrl,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: cls,
            item: `${siteUrl}/search?class=${encodeURIComponent(book.class_standard || 'all')}`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: book.title,
            item: productUrl,
          },
        ],
      }
    : null;

  return (
    <>
      {productSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />
      )}
      {breadcrumbSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        />
      )}
      <ProductDetailClient slug={slug} initialProduct={mapBookToClientProduct(book)} />
    </>
  );
}
