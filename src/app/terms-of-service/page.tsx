import type { Metadata } from 'next';
import React from 'react';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { FileText, CheckCircle2, Shield, AlertTriangle } from 'lucide-react';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

export const metadata: Metadata = {
  title: 'Terms of Service | Blessing Power Guide',
  description:
    'Terms and conditions for purchasing educational guide books from Blessing Power Guide publications and online store.',
  alternates: {
    canonical: `${siteUrl}/terms-of-service`,
  },
  openGraph: {
    title: 'Terms of Service | Blessing Power Guide',
    description:
      'Terms and conditions for purchasing educational guide books from Blessing Power Guide.',
    url: `${siteUrl}/terms-of-service`,
    siteName: 'Blessing Power Guide',
    type: 'website',
  },
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AnnouncementBar />
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-8">
          <div className="border-b border-slate-100 pb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-[#2874f0] rounded-full text-xs font-bold uppercase tracking-wider mb-3">
              <FileText className="w-4 h-4" /> User Agreement
            </div>
            <h1 className="font-black text-2xl sm:text-3xl text-slate-900">Terms of Service</h1>
            <p className="text-xs text-slate-500 mt-1">Effective Date: January 2026 • Blessing Pathway Education (OPC) Pvt Ltd</p>
          </div>

          <section className="space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#2874f0]" /> 1. Acceptance of Terms
            </h2>
            <p>
              By browsing, creating an account, or purchasing guide books from Blessing Power Guide (blessingpowerguide.in), you agree to be bound by these terms and conditions. All books listed are compiled according to official Tamil Nadu State Board & CBSE syllabi.
            </p>
          </section>

          <section className="space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#2874f0]" /> 2. Pricing & Orders
            </h2>
            <p>
              Prices listed are in Indian Rupees (INR) inclusive of applicable taxes. We reserve the right to revise prices or cancel orders in case of typographical pricing errors. Orders are paid online via Razorpay; Cash on Delivery is not available. Order confirmation receipts are generated automatically upon successful payment.
            </p>
          </section>

          <section className="space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> 3. Intellectual Property Rights
            </h2>
            <p>
              All content, book covers, solution keys, branding, and logo trademarks displayed on this site are the exclusive intellectual property of Blessing Pathway Education (OPC) Pvt Ltd. Unauthorized copying or redistribution is strictly prohibited.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
