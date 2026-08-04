import React from 'react';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { Truck, CheckCircle, Clock } from 'lucide-react';

export const metadata = {
  title: 'Shipping Policy | Blessing Power Guide',
  description: 'ST Courier shipping times and delivery policy for Blessing Power Guide books.',
};

export default function ShippingPolicyPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800">
      <AnnouncementBar />
      <Header />
      <NavBar />

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
              <CheckCircle className="w-4 h-4 text-[#2874f0]" /> No returns / no refunds
            </h2>
            <p>
              Blessing Power Guide sells <strong>educational guide books</strong>. All sales are <strong>final</strong>.
              Customers cannot cancel orders from the website. We do <strong>not</strong> offer returns, exchanges, or
              a general money-back flow once an order is placed and paid.
            </p>
            <p>
              In rare cases the shop may cancel an order before dispatch; if you paid online via Razorpay, that
              payment is refunded to your original payment method. If your parcel arrives damaged in transit or you
              received a clearly wrong title, WhatsApp us at <strong>+91 9840418228</strong> with your Order ID and
              photos — we will help case by case.
            </p>
          </section>

          <section className="space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#2874f0]" /> Support
            </h2>
            <p>
              Order updates are sent on WhatsApp. For delivery questions, contact{' '}
              <strong>+91 9840418228</strong> or <strong>blessingpowerguide@gmail.com</strong>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
