import type { Metadata } from 'next';
import ProductDetailClient from './ProductDetailClient';
import { getDbClient } from '@/lib/db';

type Props = { params: Promise<{ slug: string }> };

async function getBookMeta(slug: string) {
  try {
    const client = await getDbClient();
    const res = await client.query(
      `SELECT title, description, cover_image, discount_price, price, subject, status, stock
       FROM books WHERE slug = $1 OR id = $1 LIMIT 1`,
      [slug]
    );
    await client.end();
    return res.rows[0] || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBookMeta(slug);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessing-production.up.railway.app';

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
  return <ProductDetailClient slug={slug} />;
}
