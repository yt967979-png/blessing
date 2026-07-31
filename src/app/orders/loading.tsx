export default function OrdersLoading() {
  return (
    <div className="min-h-screen bg-[#f8fafc] page-mobile-nav">
      <div className="h-14 bg-white border-b border-slate-200 animate-pulse" />
      <div className="max-w-3xl mx-auto px-3 sm:px-4 py-6 space-y-4">
        <div className="h-8 w-36 bg-slate-200 rounded-lg animate-pulse" />
        <div className="flex gap-2 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-20 bg-slate-200 rounded-xl animate-pulse shrink-0" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 animate-pulse"
          >
            <div className="flex justify-between">
              <div className="h-4 w-28 bg-slate-100 rounded" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
            </div>
            <div className="h-3 w-full bg-slate-100 rounded" />
            <div className="h-3 w-2/3 bg-slate-100 rounded" />
            <div className="h-8 w-full bg-slate-100 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
