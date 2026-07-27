'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { HeroSection } from '@/components/home/HeroSection';
import { ClassPicker } from '@/components/home/ClassPicker';
import { ProductGrid } from '@/components/home/ProductGrid';
import { WhyChoose } from '@/components/home/WhyChoose';
import { FAQSection } from '@/components/home/FAQSection';
import { TrustBar } from '@/components/home/TrustBar';
import { Footer } from '@/components/layout/Footer';
import { ContactSection } from '@/components/home/ContactSection';

export default function Home() {
  const router = useRouter();
  const { user } = useStore();

  useEffect(() => {
    if (user && user.role === 'admin') {
      router.replace('/admin');
    }
  }, [user, router]);

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col pb-24 md:pb-0">
      <AnnouncementBar />
      <Header />
      <NavBar />
      <HeroSection />
      <ClassPicker />
      <ProductGrid />
      <WhyChoose />
      <ContactSection />
      <FAQSection />
      <TrustBar />
      <Footer />
    </main>
  );
}
