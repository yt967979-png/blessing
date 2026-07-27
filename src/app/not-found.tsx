import Link from 'next/link';
import { BrandLogo } from '@/components/ui/BrandLogo';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandLogo size={64} className="w-16 h-16 mb-1" />
      <p className="text-xs font-bold text-amber-700 uppercase tracking-wider">404</p>
      <h1 className="font-heading font-black text-2xl text-[#001B3A]">Page not found</h1>
      <p className="text-sm text-slate-600">This guide or page is not in our catalog.</p>
      <Link
        href="/"
        className="bg-[#001B3A] text-white font-bold text-xs px-6 py-3 rounded-xl uppercase tracking-wider min-h-12 inline-flex items-center"
      >
        Back to home
      </Link>
    </div>
  );
}
