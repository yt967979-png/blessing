export default function ProductDetailLoading() {
  return (
    <div className="min-h-screen bg-slate-50 page-mobile-nav">
      <div className="h-12 bg-white border-b border-slate-200 animate-pulse" />
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="h-4 w-64 bg-slate-200 rounded animate-pulse mb-6" />
        <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-5 space-y-4">
            <div className="w-full h-80 bg-slate-100 rounded-xl animate-pulse" />
            <div className="flex gap-3">
              <div className="w-16 h-16 bg-slate-100 rounded-lg animate-pulse" />
              <div className="w-16 h-16 bg-slate-100 rounded-lg animate-pulse" />
            </div>
          </div>
          <div className="lg:col-span-7 space-y-4">
            <div className="h-3 w-32 bg-slate-100 rounded animate-pulse" />
            <div className="h-8 w-3/4 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-24 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 w-40 bg-slate-200 rounded animate-pulse mt-4" />
            <div className="h-20 w-full bg-slate-100 rounded-xl animate-pulse mt-6" />
            <div className="grid grid-cols-2 gap-3 mt-6">
              <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
              <div className="h-12 bg-slate-200 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
