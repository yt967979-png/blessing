import { BrandLogo } from '@/components/ui/BrandLogo';

export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-4">
      <BrandLogo size={56} className="w-14 h-14 animate-pulse" />
      <p className="text-sm font-semibold text-slate-600">Loading Blessing Power Guide…</p>
      <div className="w-full max-w-md grid grid-cols-2 gap-3 mt-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-slate-200/80 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
