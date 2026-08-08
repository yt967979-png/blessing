import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';
import { queryDb } from '@/lib/db';
import { isBookInStock } from '@/lib/stock';

type Props = { params: Promise<{ slug: string }> };

async function getBookMeta(slug: string) {
  try {
    const res = await queryDb(
      `SELECT b.title, b.description, b.cover_image, b.discount_price, b.price, b.subject, b.status, b.stock,
              COALESCE(COUNT(r.id), 0)::int as review_count,
              COALESCE(AVG(r.rating), 5.0)::numeric(3,1) as avg_rating
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
    };
  }

  const price = Number(book.discount_price || book.price || 0);
  const title = `${book.title} | Buy Online ₹${price} | Blessing Power Guide`;
  const description =
    book.description ||
    `Buy ${book.title}${book.subject ? ` (${book.subject})` : ''} online from Blessing Power Guide. Tamil Nadu State Board & CBSE exam guides with fast delivery.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${siteUrl}/products/${slug}`,
      images: book.cover_image ? [{ url: book.cover_image }] : undefined,
      type: 'website',
    },
    alternates: {
      canonical: `${siteUrl}/products/${slug}`,
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const book = await getBookMeta(slug);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

  const price = Number(book?.discount_price || book?.price || 0);
  const mrp = Number(book?.price || price);
  const inStock = book ? isBookInStock(book) : true;

  // Schema.org JSON-LD for Google Search Console, Merchant Center & Rich Results
  const jsonLd = book ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': book.title,
    'image': [book.cover_image || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600'],
    'description': book.description || `Official ${book.title} guide book by Blessing Power Guide.`,
    'brand': {
      '@type': 'Brand',
      'name': 'Blessing Power Guide',
    },
    'offers': {
      '@type': 'Offer',
      'url': `${siteUrl}/products/${slug}`,
      'priceCurrency': 'INR',
      'price': price,
      'priceValidUntil': new Date(Date.now() + 31536000000).toISOString().slice(0, 10),
      'itemCondition': 'https://schema.org/NewCondition',
      'availability': inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      'seller': {
        '@type': 'Organization',
        'name': 'Blessing Power Guide',
      },
    },
    'aggregateRating': {
      '@type': 'AggregateRating',
      'ratingValue': Number(book.avg_rating || 5.0),
      'reviewCount': Math.max(1, Number(book.review_count || 1)),
    },
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ProductDetailClient slug={slug} />
    </>
  );
}
