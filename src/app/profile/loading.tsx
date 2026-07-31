export default function ProfileLoading() {
  return (
    <div className="min-h-screen bg-[#f8fafc] page-mobile-nav">
      <div className="h-14 bg-white border-b border-slate-200 animate-pulse" />
      <div className="max-w-lg mx-auto px-3 sm:px-4 py-6 space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 animate-pulse">
          <div className="w-14 h-14 rounded-full bg-slate-200 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 bg-slate-200 rounded" />
            <div className="h-3 w-52 bg-slate-100 rounded" />
          </div>
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-14 bg-white border border-slate-200 rounded-xl animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
