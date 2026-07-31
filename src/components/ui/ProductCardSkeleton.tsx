export function ProductCardSkeleton() {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-2.5 sm:p-4 h-72 sm:h-80 animate-pulse"
      aria-hidden
    >
      <div className="h-36 sm:h-44 bg-slate-100 rounded-xl mb-3" />
      <div className="h-2.5 bg-slate-100 rounded w-2/3 mb-2" />
      <div className="h-3 bg-slate-100 rounded w-full mb-2" />
      <div className="h-3 bg-slate-100 rounded w-1/2 mb-4" />
      <div className="h-10 bg-slate-100 rounded-xl mt-auto" />
    </div>
  );
}

export function ProductCardSkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
