export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-4">
      <div className="w-10 h-10 border-2 border-[#001B3A] border-t-transparent rounded-full animate-spin" />
      <p className="text-sm font-semibold text-slate-600">Loading Blessing Power Guide…</p>
      <div className="w-full max-w-md grid grid-cols-2 gap-3 mt-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-slate-200/80 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
