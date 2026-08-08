'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-[10px] font-black uppercase tracking-wider bg-amber-400 text-[#001B3A] px-3 py-1 rounded-full">
        Blessing Power Guide
      </span>
      <h1 className="font-heading font-black text-2xl text-[#001B3A]">Something went wrong</h1>
      <p className="text-sm text-slate-600 max-w-md">
        {error.message ||
          'A temporary issue occurred. Your cart and orders are safe — please try again.'}
      </p>
      <button
        type="button"
        onClick={reset}
        className="bg-[#001B3A] text-white font-bold text-xs px-6 py-3 rounded-xl uppercase tracking-wider min-h-12"
      >
        Try again
      </button>
    </div>
  );
}
