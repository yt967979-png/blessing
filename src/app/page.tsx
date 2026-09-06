'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Header } from '@/components/layout/Header';
import { HeroSection } from '@/components/home/HeroSection';
import { ClassPicker } from '@/components/home/ClassPicker';
import { ProductGrid } from '@/components/home/ProductGrid';
import { WhyChoose } from '@/components/home/WhyChoose';
import { FAQSection } from '@/components/home/FAQSection';
import { TrustBar } from '@/components/home/TrustBar';
import { Footer } from '@/components/layout/Footer';
import { ContactSection } from '@/components/home/ContactSection';
import { PromoSection } from '@/components/home/PromoSection';
import { HomeCouponsSection } from '@/components/home/HomeCouponsSection';

export default function Home() {
  const router = useRouter();
  const { user } = useStore();

  useEffect(() => {
    if (user && (user.role === 'admin' || user.role === 'super_admin')) {
      router.replace('/admin');
    }
  }, [user, router]);



  // Deep links like /#products or /#why
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const t = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(t);
  }, []);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: 'Blessing Power Guide',
    legalName: 'BLESSING PATHWAY EDUCATION (OPC) PRIVATE LIMITED',
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    description:
      'Tamil Nadu State Board & CBSE 6th to 12th standard exam preparation guides and educational books.',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'No.12, Ganesh Apartment, Trust Square St, Nammalwarpet, Ayanavaram',
      addressLocality: 'Chennai',
      addressRegion: 'Tamil Nadu',
      postalCode: '600012',
      addressCountry: 'IN',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+91-8148814326',
      contactType: 'customer service',
      areaServed: 'IN',
      availableLanguage: ['English', 'Tamil'],
    },
    sameAs: ['https://maps.google.com/?q=Blessing+Tuition+And+Tutorials+Chennai'],
  };

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Blessing Power Guide',
    url: siteUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${siteUrl}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
      />
      <AnnouncementBar />
      <Header />
      <HeroSection />
      <ClassPicker />
      <ProductGrid />
      <PromoSection />
      <HomeCouponsSection />
      <WhyChoose />
      <ContactSection />
      <FAQSection />
      <TrustBar />
      <Footer />
    </main>
  );
}
