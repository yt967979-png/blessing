'use client';

import React, { useState } from 'react';
import {
  X,
  User,
  Plus,
  Trash2,
  Send,
  Copy,
  ExternalLink,
  ShoppingBag,
  CreditCard,
  FileText,
  Loader2,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { useStore, type Product } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import { FREE_DELIVERY_AT_QTY, deliveryFeeForQty, cartHasCombo, effectiveBookCount } from '@/lib/deliveryRules';
import { normalizeRequiredAlternateMobile } from '@/lib/authValidation';
import {
  StudentShippingAddressForm,
  type ShippingFormData,
} from '@/components/checkout/StudentShippingAddressForm';

const EMPTY_SHIPPING: ShippingFormData = {
  studentName: '',
  parentName: '',
  phone: '',
  alternatePhone: '',
  email: '',
  whatsappNumber: '',
  alternateEmail: '',
  doorNo: '',
  buildingName: '',
  floorNo: 'Independent House (தனி வீடு / Ground Floor)',
  streetName: '',
  areaLocality: '',
  townCity: '',
  taluk: '',
  district: 'Chennai',
  state: 'Tamil Nadu',
  pincode: '',
  landmark: '',
  deliveryInstructions: '',
};

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

  // Full storefront address form (14 mandatory + 5 optional fields)
  const [shippingData, setShippingData] = useState<ShippingFormData>(EMPTY_SHIPPING);
  const [rawAddress, setRawAddress] = useState('');

  // Payment & Notes
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

  // Filter out any books that are "Coming Soon", draft, or archived
  const availableProducts = products.filter((p) => {
    const isSoon = Boolean(
      p.isComingSoon ||
      p.is_coming_soon ||
      p.status === 'coming_soon' ||
      p.status === 'draft' ||
      p.status === 'archived' ||
      String(p.badge || '').toLowerCase().includes('coming soon')
    );
    return !isSoon;
  });

  const hasTamilCombo = availableProducts.some(
    (p) => p.title.toLowerCase().includes('tamil') && p.title.toLowerCase().includes('5 in 1')
  );

  const handleAddItem = (productId: string | number) => {
    const prod = availableProducts.find((p) => String(p.id) === String(productId));
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

  const handleAddComboPreset = (medium: 'English' | 'Tamil') => {
    const targetTitle =
      medium === 'English'
        ? '10TH STD 5 IN 1 GUIDE COMBO (English Medium)'
        : '10TH STD 5 IN 1 GUIDE COMBO (Tamil Medium)';

    const prod =
      availableProducts.find(
        (p) =>
          p.title.toLowerCase().includes(medium.toLowerCase()) &&
          p.title.toLowerCase().includes('5 in 1')
      ) ||
      availableProducts.find((p) => p.title.toLowerCase().includes('5 in 1')) || {
        id: `combo-${medium.toLowerCase()}`,
        title: targetTitle,
        price: 1300,
      };

    setSelectedItems((prev) => {
      const exists = prev.find(
        (item) => String(item.id) === String(prod.id) || item.title === targetTitle
      );
      if (exists) {
        return prev.map((item) =>
          String(item.id) === String(prod.id) || item.title === targetTitle
            ? { ...item, qty: item.qty + 1 }
            : item
        );
      }
      return [...prev, { id: prod.id, title: targetTitle, price: prod.price || 1300, qty: 1 }];
    });
    onShowToast(`⚡ Added ${targetTitle} to order!`);
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
  const hasCombo = cartHasCombo(selectedItems);
  const effQty = effectiveBookCount(selectedItems);
  const booksSubtotal = selectedItems.reduce((sum, it) => sum + it.price * it.qty, 0);
  // Free delivery for 5-in-1 combo or 5+ books
  const shippingFee = (hasCombo || effQty >= FREE_DELIVERY_AT_QTY) ? 0 : deliveryFeeForQty(effQty, hasCombo);
  const calculatedTotal = booksSubtotal + shippingFee;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const f = shippingData;
    const cleanPhone = f.phone.replace(/\D/g, '').slice(-10);
    const cleanPincode = f.pincode.replace(/\D/g, '').slice(0, 6);
    const cleanWhatsApp = (f.whatsappNumber || '').replace(/\D/g, '').slice(-10);

    if (!f.studentName.trim()) return onShowToast('Please enter student full name');
    if (cleanPhone.length !== 10) return onShowToast('Please enter a valid 10-digit primary mobile number');
    const alt = normalizeRequiredAlternateMobile(f.alternatePhone, cleanPhone);
    if (!alt.ok) return onShowToast(alt.error);
    if (cleanWhatsApp && cleanWhatsApp.length !== 10) return onShowToast('WhatsApp number must be 10 digits');

    const requiredAddress: Array<[string, string]> = [
      [f.doorNo, 'Door / House / Flat Number'],
      [f.floorNo, 'Floor Details'],
      [f.streetName, 'Street / Road Name'],
      [f.areaLocality, 'Area / Locality'],
      [f.townCity, 'Village / Town / City'],
      [f.landmark, 'Nearby Landmark'],
      [f.district, 'District'],
    ];
    const missing = requiredAddress.find(([v]) => !String(v || '').trim());
    if (missing && !rawAddress.trim()) return onShowToast(`Please fill ${missing[1]}`);
    if (cleanPincode.length !== 6) return onShowToast('Please enter a valid 6-digit PIN code');
    if (selectedItems.length === 0) return onShowToast('Please select at least 1 book or combo pack');

    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(user),
        },
        body: JSON.stringify({
          studentName: f.studentName.trim(),
          customerName: f.studentName.trim(),
          parentName: f.parentName.trim(),
          customerPhone: cleanPhone,
          phone: cleanPhone,
          customerAltPhone: alt.value,
          alternatePhone: alt.value,
          email: f.email.trim(),
          whatsappNumber: cleanWhatsApp,
          alternateEmail: (f.alternateEmail || '').trim(),
          doorNo: f.doorNo.trim(),
          buildingName: (f.buildingName || '').trim(),
          floorNo: f.floorNo.trim(),
          streetName: f.streetName.trim(),
          areaLocality: f.areaLocality.trim(),
          // Empty → server builds the courier label line from the structured fields
          address: rawAddress.trim(),
          landmark: f.landmark.trim(),
          townCity: f.townCity.trim(),
          city: f.townCity.trim(),
          taluk: (f.taluk || '').trim(),
          district: f.district.trim(),
          state: f.state.trim() || 'Tamil Nadu',
          pincode: cleanPincode,
          deliveryInstructions: (f.deliveryInstructions || '').trim(),
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
        throw new Error(data.error || 'Failed to create WhatsApp custom order');
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
    setShippingData(EMPTY_SHIPPING);
    setRawAddress('');
    setSelectedItems([]);
    setAdminNotes('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-[#001B3A] to-[#002B5B] text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-[#001B3A] flex items-center justify-center font-bold">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-black text-base sm:text-lg leading-tight">
                {createdOrderResult ? 'Order Created Successfully!' : 'Create WhatsApp / Phone Order'}
              </h2>
              <p className="text-[11px] text-amber-300 font-medium">
                {createdOrderResult
                  ? 'Send order confirmation and tracking link to customer via WhatsApp'
                  : 'Record a phone order with full 14-field courier shipping details'}
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
                Total Amount: <strong className="text-slate-800 font-bold">₹{createdOrderResult.totalAmount.toLocaleString('en-IN')}</strong> · Status: Confirmed
              </p>
            </div>

            {/* WhatsApp CTA */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 sm:p-5 space-y-3 text-left">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
                <Send className="w-4 h-4 text-emerald-600" />
                <span>Customer Notification Dispatch</span>
              </div>
              <p className="text-xs text-emerald-800 leading-relaxed">
                Opens WhatsApp with a clean order confirmation, books breakdown, and live ST Courier tracking link (no minimum order mentions).
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
          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
            {/* 1. Customer & Full Storefront Shipping Address (14 mandatory + 5 optional) */}
            <div className="space-y-3">
              <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-600" />
                <span>1. Student Contact &amp; Full Delivery Address</span>
              </div>

              <StudentShippingAddressForm data={shippingData} onChange={setShippingData} />

              {/* Optional courier label override (e.g. pasted WhatsApp address) */}
              <div className="bg-white p-4 rounded-2xl border border-slate-200">
                <label htmlFor="wa-raw-address" className="block font-bold text-slate-700 mb-1">
                  Custom courier label address{' '}
                  <span className="font-normal text-slate-400 text-[10.5px]">
                    (optional — leave empty to auto-build from the fields above)
                  </span>
                </label>
                <textarea
                  id="wa-raw-address"
                  rows={2}
                  placeholder="Paste the customer's WhatsApp address only if the label must print exactly as typed"
                  value={rawAddress}
                  onChange={(e) => setRawAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 resize-none text-[11px]"
                />
              </div>
            </div>

            {/* 2. Select Guidebooks (5 in 1 Combo 1-Click Buttons) */}
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
              <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-blue-600" />
                  <span>2. Select Books (1-Click 5 in 1 Combo)</span>
                </div>
                <span className="text-[10px] text-slate-500 font-normal">
                  {selectedItems.length} book item(s) selected
                </span>
              </div>

              {/* ⚡ 1-Click Quick Add Combo Presets (Only Active Available Combos) */}
              <div className={hasTamilCombo ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : "flex flex-col gap-1.5"}>
                <button
                  type="button"
                  onClick={() => handleAddComboPreset('English')}
                  className="w-full px-3.5 py-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-xs font-bold text-blue-900 flex items-center justify-between transition-all cursor-pointer shadow-2xs group"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500 fill-amber-400 group-hover:scale-110 transition-transform" />
                    <span>⚡ 1-Click Add: 10th Std 5 in 1 Combo (English Medium)</span>
                  </div>
                  <span className="bg-blue-600 text-white text-[11px] px-2.5 py-0.5 rounded-full font-black">
                    + ₹1,300 (In Stock)
                  </span>
                </button>

                {hasTamilCombo && (
                  <button
                    type="button"
                    onClick={() => handleAddComboPreset('Tamil')}
                    className="w-full px-3.5 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-between transition-all cursor-pointer shadow-2xs group"
                  >
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500 fill-amber-400 group-hover:scale-110 transition-transform" />
                      <span>⚡ 1-Click Add: 10th Std 5 in 1 Combo (Tamil Medium)</span>
                    </div>
                    <span className="bg-emerald-600 text-white text-[11px] px-2.5 py-0.5 rounded-full font-black">
                      + ₹1,300 (In Stock)
                    </span>
                  </button>
                )}
              </div>

              {/* Or Pick Any Guidebook Dropdown (Filtered to exclude Coming Soon) */}
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
                  + Or pick individual published guidebooks from catalog...
                </option>
                {availableProducts.map((p) => (
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
                      <span>Books Subtotal ({bookQty})</span>
                      <span className="font-bold">₹{booksSubtotal.toLocaleString('en-IN')}</span>
                    </div>
                    <div className="flex justify-between text-blue-950">
                      <span>Delivery</span>
                      <span className={`font-bold ${shippingFee === 0 ? 'text-emerald-700' : ''}`}>
                        {shippingFee === 0 ? 'FREE Doorstep Delivery' : `₹${shippingFee}`}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-1 border-t border-blue-200">
                      <span className="font-bold text-blue-950">Amount Payable</span>
                      <span className="font-black text-base text-[#001B3A]">
                        ₹{calculatedTotal.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Payment Details */}
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
              <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                <span>3. Payment & Admin Notes</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium cursor-pointer"
                  >
                    <option value="WhatsApp UPI (GPay / PhonePe / Paytm)">
                      WhatsApp UPI (GPay / PhonePe / Paytm)
                    </option>
                    <option value="Direct Bank Transfer (IMPS / NEFT)">
                      Direct Bank Transfer (IMPS / NEFT)
                    </option>
                    <option value="Direct Store Payment">Direct Store Payment</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Status</label>
                  <select
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium cursor-pointer"
                  >
                    <option value="Paid / Confirmed">Paid / Confirmed</option>
                    <option value="Pending Verification">Pending Verification</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Internal Admin Notes (Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Parent requested urgent dispatch before Monday"
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={handleResetAndClose}
                disabled={loading}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || selectedItems.length === 0}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating Order...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Create WhatsApp Order</span>
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
