import type { Metadata } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

export const metadata: Metadata = {
  title: 'Search Catalog & Exam Guides | Blessing Power Guide',
  description:
    'Browse and search Blessing Power Guide publications for Class 6th to 12th standard. Find Tamil Nadu State Board & CBSE question banks, guides, and study materials.',
  alternates: {
    canonical: `${siteUrl}/search`,
  },
  openGraph: {
    title: 'Search Catalog & Exam Guides | Blessing Power Guide',
    description:
      'Browse and search Blessing Power Guide publications for Class 6th to 12th standard. Tamil Nadu State Board & CBSE guides.',
    url: `${siteUrl}/search`,
    siteName: 'Blessing Power Guide',
    type: 'website',
  },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
