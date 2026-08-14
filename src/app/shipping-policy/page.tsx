import type { Metadata } from 'next';
import React from 'react';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { Truck, CheckCircle, Clock } from 'lucide-react';
import { getShopPhoneDisplay } from '@/lib/shopContact';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://blessingpowerguide.duckdns.org';

export const metadata: Metadata = {
  title: 'Shipping & Delivery Policy | Blessing Power Guide',
  description:
    'ST Courier Express shipping timelines and delivery policies for Blessing Power Guide books across Tamil Nadu, Puducherry, and South India.',
  alternates: {
    canonical: `${siteUrl}/shipping-policy`,
  },
  openGraph: {
    title: 'Shipping & Delivery Policy | Blessing Power Guide',
    description:
      'ST Courier Express shipping timelines and delivery policies for Blessing Power Guide books across Tamil Nadu and South India.',
    url: `${siteUrl}/shipping-policy`,
    siteName: 'Blessing Power Guide',
    type: 'website',
  },
};

export default function ShippingPolicyPage() {
  const shopPhone = getShopPhoneDisplay();

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      <AnnouncementBar />
      <Header />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-8">
          <div className="border-b border-slate-100 pb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-[#2874f0] rounded-full text-xs font-bold uppercase tracking-wider mb-3">
              <Truck className="w-4 h-4" /> Shipping
            </div>
            <h1 className="font-black text-2xl sm:text-3xl text-slate-900">Shipping & Delivery Policy</h1>
            <p className="text-xs text-slate-500 mt-1">Blessing Pathway Education · Guide books</p>
          </div>

          <section className="space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#2874f0]" /> Shipping partners & timelines
            </h2>
            <p>
              We ship all physical guide books via <strong>ST Courier Express</strong> across Tamil Nadu, Puducherry, Karnataka, Kerala, and Andhra Pradesh.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong>Tamil Nadu & Puducherry:</strong> 1 to 3 working days.</li>
              <li><strong>South India (other states):</strong> 3 to 5 working days.</li>
              <li><strong>Rest of India:</strong> 4 to 7 working days.</li>
            </ul>
          </section>

          <section className="space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-[#2874f0]" /> No customer returns / refunds
            </h2>
            <p>
              Blessing Power Guide sells <strong>educational guide books</strong>. All sales are <strong>final</strong>.
              Customers <strong>cannot cancel</strong> orders from the website. We do <strong>not</strong> offer
              customer-initiated returns, exchanges, or refunds once an order is placed and paid.
            </p>
            <p>
              If the <strong>shop admin cancels</strong> an order (for example before dispatch), and you paid online
              via Razorpay, a <strong>Razorpay refund is issued</strong> to your original payment method. That is the
              only refund path — there is no general money-back or return-to-warehouse flow for customers.
            </p>
            <p>
              If your parcel arrives damaged in transit or you received a clearly wrong title, call or message{' '}
              <strong>{shopPhone}</strong> with your Order ID and photos — we will help case by case.
            </p>
          </section>

          <section className="space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#2874f0]" /> Support
            </h2>
            <p>
              Track your order anytime on My Orders or the Track page. For delivery questions, contact{' '}
              <strong>{shopPhone}</strong> or <strong>blessingpowerguide@gmail.com</strong>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
