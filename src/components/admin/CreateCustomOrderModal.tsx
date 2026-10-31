'use client';

import React, { useState } from 'react';
import {
  X,
  Phone,
  User,
  MapPin,
  Home,
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
  Compass,
} from 'lucide-react';
import { useStore, type Product } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import { FREE_DELIVERY_AT_QTY, deliveryFeeForQty, cartHasCombo, effectiveBookCount } from '@/lib/deliveryRules';
import { normalizeRequiredAlternateMobile } from '@/lib/authValidation';
import { TAMIL_NADU_DISTRICTS, FLOOR_OPTIONS } from '@/lib/addresses';

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

  // 14 Mandatory Fields
  const [studentName, setStudentName] = useState('');
  const [parentName, setParentName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAltPhone, setCustomerAltPhone] = useState('');
  const [email, setEmail] = useState('');
  const [doorNo, setDoorNo] = useState('');
  const [floorNo, setFloorNo] = useState('Independent House (தனி வீடு / Ground Floor)');
  const [streetName, setStreetName] = useState('');
  const [areaLocality, setAreaLocality] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('Chennai');
  const [state, setState] = useState('Tamil Nadu');
  const [pincode, setPincode] = useState('');
  const [landmark, setLandmark] = useState('');
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

    const cleanPhone = customerPhone.replace(/\D/g, '').slice(-10);
    if (!studentName.trim()) {
      onShowToast('Please enter customer / student name');
      return;
    }
    if (cleanPhone.length !== 10) {
      onShowToast('Please enter a valid 10-digit primary mobile number');
      return;
    }
    const alt = normalizeRequiredAlternateMobile(customerAltPhone, cleanPhone);
    if (!alt.ok) {
      onShowToast(alt.error);
      return;
    }
    if (pincode.replace(/\D/g, '').length !== 6) {
      onShowToast('Please enter a valid 6-digit postal pincode');
      return;
    }
    if (selectedItems.length === 0) {
      onShowToast('Please select at least 1 book or combo pack');
      return;
    }

    setLoading(true);
    try {
      const addressParts = [
        doorNo.trim(),
        floorNo.trim(),
        streetName.trim(),
        areaLocality.trim(),
        landmark.trim() ? `Near ${landmark.trim()}` : '',
        city.trim(),
        district.trim() && district.trim() !== city.trim() ? district.trim() : '',
        `${state.trim()} - ${pincode.trim()}`,
      ].filter(Boolean);

      const resolvedAddress = rawAddress.trim() || addressParts.join(', ');

      const res = await fetch('/api/admin/orders/custom', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(user),
        },
        body: JSON.stringify({
          studentName: studentName.trim(),
          customerName: studentName.trim(),
          parentName: parentName.trim(),
          customerPhone: cleanPhone,
          phone: cleanPhone,
          customerAltPhone: alt.value,
          alternatePhone: alt.value,
          email: email.trim(),
          doorNo: doorNo.trim(),
          floorNo: floorNo.trim(),
          streetName: streetName.trim(),
          areaLocality: areaLocality.trim(),
          address: resolvedAddress,
          landmark: landmark.trim(),
          city: city.trim(),
          district: district.trim(),
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
    setStudentName('');
    setParentName('');
    setCustomerPhone('');
    setCustomerAltPhone('');
    setEmail('');
    setDoorNo('');
    setFloorNo('Independent House (தனி வீடு / Ground Floor)');
    setStreetName('');
    setAreaLocality('');
    setCity('');
    setDistrict('Chennai');
    setPincode('');
    setLandmark('');
    setRawAddress('');
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
            {/* 1. Customer & 14-Field Shipping Details */}
            <div className="space-y-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
              <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span>1. Student Contact & Address (14 Format)</span>
                </div>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                  14 Mandatory *
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Student Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. S. Murugan / Priya"
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Parent / Guardian Name</label>
                  <input
                    type="text"
                    placeholder="e.g. K. Selvam (Father)"
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Primary Mobile (10 Digits) *</label>
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
                  <label className="block font-bold text-slate-700 mb-1">Alternate Mobile *</label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="Different 10-digit number"
                    value={customerAltPhone}
                    onChange={(e) => setCustomerAltPhone(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Door / Flat / House No *</label>
                  <input
                    type="text"
                    placeholder="e.g. 14/2, Plot 45"
                    value={doorNo}
                    onChange={(e) => setDoorNo(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Floor Details</label>
                  <select
                    value={floorNo}
                    onChange={(e) => setFloorNo(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium cursor-pointer"
                  >
                    {FLOOR_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Street / Road Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Gandhi Street, Nehru Road"
                    value={streetName}
                    onChange={(e) => setStreetName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Area / Locality *</label>
                  <input
                    type="text"
                    placeholder="e.g. Anna Nagar, KK Nagar"
                    value={areaLocality}
                    onChange={(e) => setAreaLocality(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1 text-blue-700">
                    <Compass className="w-3.5 h-3.5" />
                    <span>Nearby Landmark (Delivery Executive Guide) *</span>
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
                  <label className="block font-bold text-slate-700 mb-1">Village / Town / City *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Madurai, Coimbatore"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Tamil Nadu District *</label>
                  <select
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium cursor-pointer"
                  >
                    {TAMIL_NADU_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Postal Pincode (6 Digits) *</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="e.g. 625020"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium font-mono"
                  />
                </div>
              </div>

              {/* Quick Full Address Paste */}
              <div className="pt-2 border-t border-slate-200">
                <label className="block font-bold text-slate-600 mb-1">
                  Or Paste Full WhatsApp Address Message:
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Murugan, No 14 Gandhi St, Anna Nagar, Madurai 625020"
                  value={rawAddress}
                  onChange={(e) => setRawAddress(e.target.value)}
                  className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium resize-none text-[11px]"
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
