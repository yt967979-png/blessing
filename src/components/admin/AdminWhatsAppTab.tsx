'use client';

/** Legacy Admin WhatsApp tab — product-disabled (pairing / order alerts removed). */
export default function AdminWhatsAppTab() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
      <p className="font-bold text-slate-800 mb-1">WhatsApp disabled</p>
      <p>
        Order alerts, Baileys pairing, and YES/NO confirmation are turned off for this shop.
        Customers confirm on checkout before Razorpay; track status in My Orders.
      </p>
    </div>
  );
}
