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

export default function Home() {
  const router = useRouter();
  const { user } = useStore();

  useEffect(() => {
    if (user && user.role === 'admin') {
      router.replace('/admin');
    }
  }, [user, router]);

  // Prefetch critical shop routes on mount for Flipkart-like instant nav
  useEffect(() => {
    const routes = ['/search', '/cart', '/orders', '/profile', '/track'];
    for (const href of routes) {
      router.prefetch(href);
    }
  }, [router]);

  // Deep links like /#products or /#why
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const t = window.setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
    }, 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />
      <HeroSection />
      <ClassPicker />
      <ProductGrid />
      <PromoSection />
      <WhyChoose />
      <ContactSection />
      <FAQSection />
      <TrustBar />
      <Footer />
    </main>
  );
}
