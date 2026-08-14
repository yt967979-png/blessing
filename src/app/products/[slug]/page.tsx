import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';
import { queryDb } from '@/lib/db';
import { isBookInStock } from '@/lib/stock';

type Props = { params: Promise<{ slug: string }> };

function trimDescription(text: string | null | undefined, maxChars = 155): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > 100 ? `${cut.slice(0, lastSpace)}...` : `${cut}...`;
}

async function getBookMeta(slug: string) {
  try {
    const res = await queryDb(
      `SELECT b.id, b.slug, b.title, b.description,
              COALESCE(b.class, b.cls, '') as class_standard,
              b.subject,
              CASE
                WHEN b.cover_image IS NULL OR b.cover_image = '' THEN NULL
                WHEN b.cover_image LIKE 'data:%' THEN NULL
                WHEN length(b.cover_image) > 2048 THEN NULL
                ELSE b.cover_image
              END AS cover_image,
              b.discount_price, b.price, b.status, b.stock, b.in_stock,
              b.updated_at,
              COALESCE(COUNT(r.id), 0)::int as review_count,
              COALESCE(AVG(r.rating), 0)::numeric(3,1) as avg_rating
       FROM books b
       LEFT JOIN reviews r ON b.id = r.book_id
       WHERE b.slug = $1 OR b.id = $1
       GROUP BY b.id LIMIT 1`,
      [slug]
    );
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBookMeta(slug);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

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

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const book = await getBookMeta(slug);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

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
      <ProductDetailClient slug={slug} />
    </>
  );
}
