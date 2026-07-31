export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="h-8 w-48 bg-gray-200 rounded-lg animate-pulse" />
        <div className="flex gap-2 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-24 bg-gray-200 rounded-lg animate-pulse shrink-0" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-3.5 animate-pulse"
            >
              <div className="w-8 h-8 bg-gray-100 rounded-lg mb-2" />
              <div className="h-3 w-20 bg-gray-100 rounded mb-2" />
              <div className="h-6 w-16 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse space-y-3"
            >
              <div className="flex justify-between">
                <div className="h-4 w-32 bg-gray-100 rounded" />
                <div className="h-4 w-20 bg-gray-100 rounded" />
              </div>
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-2/3 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
