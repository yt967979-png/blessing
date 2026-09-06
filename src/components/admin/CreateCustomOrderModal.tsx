'use client';

import React, { useState } from 'react';
import {
  X,
  Phone,
  User,
  MapPin,
  Building,
  Plus,
  Trash2,
  Check,
  Send,
  Copy,
  ExternalLink,
  Printer,
  ShoppingBag,
  CreditCard,
  FileText,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import type { Product } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import { useStore } from '@/context/StoreContext';
import { MIN_BOOKS_PER_ORDER, FREE_DELIVERY_AT_QTY, deliveryFeeForQty } from '@/lib/deliveryRules';

interface CreateCustomOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onOrderCreated: () => void;
  onShowToast: (msg: string) => void;
}

export const CreateCustomOrderModal: React.FC<CreateCustomOrderModalProps> = ({
  isOpen,
  onClose,
  products,
  onOrderCreated,
  onShowToast,
}) => {
  const { user } = useStore();

  // Form states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAltPhone, setCustomerAltPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('Tamil Nadu');
  const [paymentMethod, setPaymentMethod] = useState('WhatsApp UPI (GPay / PhonePe / Paytm)');
  const [paymentStatus, setPaymentStatus] = useState('Paid / Confirmed');
  const [adminNotes, setAdminNotes] = useState('');

  // Selected items: array of { id, title, price, qty }
  const [selectedItems, setSelectedItems] = useState<
    Array<{ id: string | number; title: string; price: number; qty: number }>
  >([]);

  const [loading, setLoading] = useState(false);

  // Success result state
  const [createdOrderResult, setCreatedOrderResult] = useState<{
    orderNumber: string;
    trackingUrl: string;
    whatsappUrl: string;
    totalAmount: number;
  } | null>(null);

  if (!isOpen) return null;

  const handleAddItem = (productId: string | number) => {
    const prod = products.find((p) => String(p.id) === String(productId));
    if (!prod) return;

    setSelectedItems((prev) => {
      const exists = prev.find((item) => String(item.id) === String(productId));
      if (exists) {
        return prev.map((item) =>
          String(item.id) === String(productId) ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { id: prod.id, title: prod.title, price: prod.price, qty: 1 }];
    });
  };

  const handleUpdateQty = (productId: string | number, delta: number) => {
    setSelectedItems((prev) =>
      prev
        .map((item) => {
          if (String(item.id) === String(productId)) {
            const nextQty = item.qty + delta;
            return nextQty > 0 ? { ...item, qty: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as any[]
    );
  };

  const bookQty = selectedItems.reduce((sum, it) => sum + it.qty, 0);
  const booksSubtotal = selectedItems.reduce((sum, it) => sum + it.price * it.qty, 0);
  const shippingFee = deliveryFeeForQty(bookQty);
  const calculatedTotal = booksSubtotal + shippingFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10);
    if (!customerName.trim()) {
      onShowToast('Please enter customer name');
      return;
    }
    if (cleanPhone.length !== 10) {
      onShowToast('Please enter a valid 10-digit mobile number');
      return;
    }
    if (!address.trim() || !pincode.trim()) {
      onShowToast('Please provide delivery address and pincode');
      return;
    }
    if (bookQty < MIN_BOOKS_PER_ORDER) {
      onShowToast(`Minimum ${MIN_BOOKS_PER_ORDER} books required. Add ${MIN_BOOKS_PER_ORDER - bookQty} more.`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(user),
        },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerPhone: cleanPhone,
          customerAltPhone: customerAltPhone.trim(),
          address: address.trim(),
          landmark: landmark.trim(),
          city: city.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
          items: selectedItems,
          totalAmount: calculatedTotal,
          paymentMethod,
          paymentStatus,
          orderStatus: 'Confirmed',
          adminNotes: adminNotes.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create custom order');
      }

      setCreatedOrderResult({
        orderNumber: data.orderNumber,
        trackingUrl: data.trackingUrl,
        whatsappUrl: data.whatsappUrl,
        totalAmount: data.totalAmount,
      });

      onShowToast(`🎉 Order #${data.orderNumber} created!`);
      onOrderCreated();
    } catch (err: any) {
      onShowToast(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!createdOrderResult?.trackingUrl) return;
    navigator.clipboard.writeText(createdOrderResult.trackingUrl);
    onShowToast('📋 Tracking link copied to clipboard!');
  };

  const handleResetAndClose = () => {
    setCreatedOrderResult(null);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAltPhone('');
    setAddress('');
    setLandmark('');
    setCity('');
    setPincode('');
    setSelectedItems([]);
    setAdminNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-[#001B3A] to-[#002B5B] text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-[#001B3A] flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-black text-base sm:text-lg leading-tight">
                {createdOrderResult ? 'Order Created Successfully!' : 'Create Custom / WhatsApp Order'}
              </h2>
              <p className="text-[11px] text-amber-300 font-medium">
                {createdOrderResult
                  ? 'Send the order confirmation and tracking link to the customer'
                  : 'Record a phone or WhatsApp order and issue tracking'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {createdOrderResult ? (
          /* SUCCESS SCREEN */
          <div className="p-5 sm:p-6 space-y-5 text-center">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h3 className="font-heading font-black text-xl text-slate-900">
                Order #{createdOrderResult.orderNumber}
              </h3>
              <p className="text-xs text-slate-500">
                Total Amount: <strong className="text-slate-800 font-bold">₹{createdOrderResult.totalAmount}</strong> · Status: Confirmed
              </p>
            </div>

            {/* WhatsApp CTA */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-3 text-left">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
                <Send className="w-4 h-4 text-emerald-600" />
                <span>Customer Notification Dispatch</span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Opens WhatsApp with a professional order confirmation and tracking link for this customer.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <a
                  href={createdOrderResult.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.98]"
                >
                  <Send className="w-4 h-4" />
                  <span>Send Tracking via WhatsApp</span>
                </a>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-xs py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-600" />
                  <span>Copy Tracking Link</span>
                </button>
              </div>
            </div>

            {/* Tracking Link Preview */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Live Public Tracking URL:
              </span>
              <a
                href={createdOrderResult.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline font-mono break-all inline-flex items-center gap-1"
              >
                <span>{createdOrderResult.trackingUrl}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>

            <button
              type="button"
              onClick={handleResetAndClose}
              className="w-full bg-[#001B3A] hover:bg-blue-900 text-white font-black text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-md transition-colors"
            >
              Done / Close
            </button>
          </div>
        ) : (
          /* FORM SCREEN */
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
            {/* 1. Customer Details */}
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
              <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Customer Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Customer Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. S. Murugan / Priya"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">WhatsApp / Phone Number (10 Digits) *</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="e.g. 9876543210"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Alternate Phone (Optional)</label>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="e.g. 9123456780"
                    value={customerAltPhone}
                    onChange={(e) => setCustomerAltPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">City / Town *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chennai, Coimbatore, Madurai"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>
              </div>

              {/* Delivery Address */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">Street Address, Door No., Area *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="e.g. No 14/2, Gandhi Road, Near Market"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium resize-none"
                />
              </div>

              {/* Landmark & Pincode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1 text-blue-700">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Near Landmark (Important for Courier Delivery)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Opposite Bus Stop, Near SBI ATM"
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Postal Pincode (6 Digits) *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="e.g. 632301"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium font-mono"
                  />
                </div>
              </div>
            </div>

            {/* 2. Select Guidebooks */}
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
              <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                  <span>2. Select Books</span>
                </div>
                <span className="text-[10px] text-slate-500 font-normal">
                  {selectedItems.length} book(s) selected
                </span>
              </div>

              {/* Book Selector Dropdown */}
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddItem(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium cursor-pointer"
                defaultValue=""
              >
                <option value="" disabled>
                  + Click to pick a guidebook to add to this order...
                </option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.cls ? `[${p.cls}] ` : ''}{p.title} — ₹{p.price}
                  </option>
                ))}
              </select>

              {/* Selected Items List */}
              {selectedItems.length > 0 && (
                <div className="space-y-2 pt-1">
                  {selectedItems.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-bold text-slate-800 truncate">{it.title}</p>
                        <p className="text-[11px] text-slate-500">₹{it.price} each</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(it.id, -1)}
                            className="px-2 py-1 hover:bg-slate-100 font-bold"
                          >
                            -
                          </button>
                          <span className="px-2.5 font-bold font-mono">{it.qty}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(it.id, 1)}
                            className="px-2 py-1 hover:bg-slate-100 font-bold"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-bold text-slate-900 w-16 text-right">
                          ₹{it.price * it.qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQty(it.id, -it.qty)}
                          className="text-slate-400 hover:text-red-600 p-1"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <div className="space-y-1.5 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="flex justify-between text-blue-950">
                      <span>Books ({bookQty})</span>
                      <span className="font-bold">₹{booksSubtotal}</span>
                    </div>
                    <div className="flex justify-between text-blue-950">
                      <span>
                        Delivery
                        {shippingFee === 0
                          ? ` (FREE at ${FREE_DELIVERY_AT_QTY}+ books)`
                          : ` (FREE from ${FREE_DELIVERY_AT_QTY} books)`}
                      </span>
                      <span className={`font-bold ${shippingFee === 0 ? 'text-emerald-700' : ''}`}>
                        {shippingFee === 0 ? 'FREE' : `₹${shippingFee}`}
                      </span>
                    </div>
                    {bookQty < MIN_BOOKS_PER_ORDER ? (
                      <p className="text-[11px] font-semibold text-amber-800">
                        Minimum {MIN_BOOKS_PER_ORDER} books. Add {MIN_BOOKS_PER_ORDER - bookQty} more.
                      </p>
                    ) : null}
                    <div className="flex justify-between items-center pt-1 border-t border-blue-200">
                      <span className="font-bold text-blue-950">Amount payable</span>
                      <span className="font-black text-base text-[#001B3A]">₹{calculatedTotal}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Payment Details */}
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
              <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                <span>3. Payment &amp; Order Status</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method *</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  >
                    <option value="WhatsApp UPI (GPay / PhonePe / Paytm)">WhatsApp UPI (GPay / PhonePe / Paytm)</option>
                    <option value="Direct Bank Transfer (IMPS / NEFT)">Direct Bank Transfer (IMPS / NEFT)</option>
                    <option value="Store Direct Counter Pickup">Store Direct Counter Pickup</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Status *</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  >
                    <option value="Paid / Confirmed">Paid / Confirmed</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Admin Notes / Transaction Ref (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. UTR: 324156987412 or WhatsApp chat agreed pricing"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={handleResetAndClose}
                className="px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-bold hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || bookQty < MIN_BOOKS_PER_ORDER}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50 text-white font-extrabold rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating Order...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Create &amp; Get WhatsApp Link</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
