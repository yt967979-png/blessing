'use client';

import React from 'react';
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

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <Toast />
      <AnnouncementBar />
      <Header />
      <NavBar />
      <HeroSection />
      <ClassPicker />
      <ProductGrid />
      <WhyChoose />
      <FAQSection />
      <TrustBar />
      <Footer />
      <FloatingActions />
      <CartDrawer />
      <Modals />
    </main>
  );
}
