export default function CartLoading() {
  return (
    <div className="min-h-screen bg-[#f8fafc] page-mobile-nav">
      <div className="h-14 bg-white border-b border-slate-200 animate-pulse" />
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 space-y-4">
        <div className="h-8 w-40 bg-slate-200 rounded-lg animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-4 animate-pulse"
          >
            <div className="w-20 h-20 bg-slate-100 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-3 w-3/4 bg-slate-100 rounded" />
              <div className="h-3 w-1/3 bg-slate-100 rounded" />
              <div className="h-8 w-24 bg-slate-100 rounded-lg mt-2" />
            </div>
          </div>
        ))}
        <div className="h-28 bg-white border border-slate-200 rounded-2xl animate-pulse" />
      </div>
    </div>
  );
}
