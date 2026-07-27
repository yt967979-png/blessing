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
import { FloatingActions } from '@/components/layout/FloatingActions';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Modals } from '@/components/modals/Modals';
import { Toast } from '@/components/ui/Toast';

import { ContactSection } from '@/components/home/ContactSection';

export default function Home() {
  const router = useRouter();
  const { user } = useStore();

  useEffect(() => {
    // If the logged in user is Admin, auto-redirect directly to Admin Dashboard
    if (user && user.role === 'admin') {
      router.replace('/admin');
    }
  }, [user, router]);
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col pb-24 md:pb-0">
      <Toast />
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
      <FloatingActions />
      <CartDrawer />
      <Modals />
    </main>
  );
}
