import React from 'react';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { Truck, RotateCcw, CheckCircle, Clock } from 'lucide-react';

export const metadata = {
  title: 'Shipping & Return Policy | Blessing Power Guide',
  description: 'ST Courier shipping times, delivery policies, and return guidelines.',
};

export default function ShippingReturnPolicyPage() {
  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <AnnouncementBar />
      <Header />
      <NavBar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs space-y-8">
          <div className="border-b border-slate-100 pb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-[#2874f0] rounded-full text-xs font-bold uppercase tracking-wider mb-3">
              <Truck className="w-4 h-4" /> Logistics & Returns
            </div>
            <h1 className="font-black text-2xl sm:text-3xl text-slate-900">Shipping & Return Policy</h1>
            <p className="text-xs text-slate-500 mt-1">Official Shipping & Return terms • Blessing Pathway Education</p>
          </div>

          <section className="space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-[#2874f0]" /> 1. Shipping Partners & Delivery Timelines
            </h2>
            <p>
              We ship all physical guide books via <strong>ST Courier Express</strong> across Tamil Nadu, Puducherry, Karnataka, Kerala, and Andhra Pradesh.
            </p>
            <ul className="list-disc list-inside space-y-1 pl-2">
              <li><strong>Tamil Nadu & Puducherry:</strong> Delivered within 1 to 3 working days.</li>
              <li><strong>South India (Other States):</strong> Delivered within 3 to 5 working days.</li>
              <li><strong>Rest of India:</strong> Delivered within 4 to 7 working days.</li>
            </ul>
          </section>

          <section className="space-y-3 text-xs sm:text-sm leading-relaxed text-slate-600">
            <h2 className="font-bold text-base text-slate-900 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-[#2874f0]" /> 2. 7-Day Replacement & Return Policy
            </h2>
            <p>
              If you receive a damaged book, missing pages, or wrong edition parcel, you are eligible for a <strong>100% free replacement or refund</strong> within 7 days of delivery.
            </p>
            <p>
              To initiate a return or exchange, send your Order ID and photo/video proof to our WhatsApp helpdesk at <strong>+91 9840418228</strong> or email <strong>support@blessingpowerguide.in</strong>.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
