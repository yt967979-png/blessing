import type { Metadata } from 'next';
import Link from 'next/link';
import { Wrench, MessageCircle, Phone, Truck, ShieldCheck, RefreshCw } from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';

export const metadata: Metadata = {
  title: 'Scheduled Maintenance | Blessing Power Guide',
  description: 'Our online book store is currently undergoing routine maintenance to serve you better.',
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100/60 to-slate-200/50 flex flex-col justify-between p-4 sm:p-8">
      {/* Top Header */}
      <header className="max-w-4xl mx-auto w-full flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLogo size={40} className="w-10 h-10" />
          <span className="font-heading font-black text-lg text-[#001B3A] tracking-tight">
            Blessing Power Guide
          </span>
        </Link>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          Routine Maintenance
        </span>
      </header>

      {/* Main Content Box */}
      <main className="max-w-lg mx-auto w-full bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-10 shadow-xl text-center my-8">
        <div className="w-20 h-20 bg-blue-50 border border-blue-200 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
          <Wrench className="w-10 h-10 animate-bounce text-[#0044AA]" />
        </div>

        <p className="text-xs font-extrabold text-blue-700 tracking-wider uppercase mb-1">
          System Upgrade in Progress
        </p>
        <h1 className="font-heading font-black text-2xl sm:text-3xl text-[#001B3A] mb-3">
          We&apos;ll Be Back Shortly
        </h1>

        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          We are upgrading our servers and catalog database to bring you an even smoother, faster experience. Thank you for your patience!
        </p>

        {/* Reassurance Banner */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 text-left mb-6 flex items-start gap-3">
          <Truck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-xs font-bold text-emerald-900">Existing Orders Unaffected</h2>
            <p className="text-[11px] text-emerald-700 mt-0.5 leading-normal">
              All placed orders, packing, and ST Courier doorstep dispatches continue moving on schedule without interruption.
            </p>
          </div>
        </div>

        {/* WhatsApp & Urgent Book Ordering */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left mb-6">
          <p className="text-xs font-bold text-slate-900 mb-1">Need to order a guide book urgently?</p>
          <p className="text-[11px] text-slate-500 mb-3">
            Our support desk is active and taking direct orders on WhatsApp:
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href="https://wa.me/919486017820?text=Hi%20Blessing%20Power%20Guide%2C%20I%20would%20like%20to%20order%20guides%20while%20maintenance%20is%20active"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              Chat on WhatsApp
            </a>
            <a
              href="tel:+919486017820"
              className="px-4 py-3 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Phone className="w-4 h-4" />
              Call Helpline
            </a>
          </div>
        </div>

        {/* Refresh / Return Link */}
        <Link
          href="/"
          className="w-full bg-[#001B3A] hover:bg-blue-900 active:scale-98 text-white font-bold text-xs py-3.5 px-6 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer min-h-12"
        >
          <RefreshCw className="w-4 h-4" />
          Check If Store Is Back Online
        </Link>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto w-full text-center text-xs text-slate-500 py-4">
        © {new Date().getFullYear()} Blessing Power Guide · Official Tamil Nadu Samacheer Kalvi Guide Publisher · Trust Square, Chennai - 600012
      </footer>
    </div>
  );
}
