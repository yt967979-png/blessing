import { ProductCardSkeletonGrid } from '@/components/ui/ProductCardSkeleton';

export default function SearchLoading() {
  return (
    <div className="min-h-screen bg-[#f8fafc] page-mobile-nav">
      <div className="h-14 bg-white border-b border-slate-200 animate-pulse" />
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-6">
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse mb-4" />
        <div className="h-10 w-full max-w-xl bg-slate-200 rounded-xl animate-pulse mb-6" />
        <ProductCardSkeletonGrid count={8} />
      </div>
    </div>
  );
}
