'use client';

import React, { useState, useEffect } from 'react';
import { X, MapPin, CheckCircle2, Loader2 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import {
  StudentShippingAddressForm,
  type ShippingFormData,
} from '@/components/checkout/StudentShippingAddressForm';

interface EditOrderAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onOrderUpdated: (updatedOrder: any) => void;
  onShowToast: (msg: string) => void;
}

const DEFAULT_FLOOR = 'Independent House (தனி வீடு / Ground Floor)';

const digits = (v: unknown, max: number, fromEnd = true) => {
  const d = String(v || '').replace(/\D/g, '');
  return fromEnd ? d.slice(-max) : d.slice(0, max);
};

/** Pre-fill the storefront address form from any stored order address shape (new + legacy keys). */
function toFormData(order: any): ShippingFormData {
  const addr = order?.shippingAddress || {};
  return {
    studentName: addr.studentName || addr.name || order?.customerName || '',
    parentName: addr.parentName || addr.parent_name || '',
    phone: digits(addr.phone || order?.customerPhone, 10),
    alternatePhone: digits(addr.alternatePhone || addr.alternate_phone || order?.customerAltPhone, 10),
    email: addr.email || addr.primary_email || '',
    whatsappNumber: digits(addr.whatsappNumber || addr.whatsapp_number, 10),
    alternateEmail: addr.alternateEmail || addr.alternate_email || '',
    doorNo: addr.doorNo || addr.door_no || '',
    buildingName: addr.buildingName || addr.building_name || '',
    floorNo: addr.floorNo || addr.floor_no || DEFAULT_FLOOR,
    streetName: addr.streetName || addr.street_name || '',
    areaLocality: addr.areaLocality || addr.area_locality || '',
    townCity: addr.townCity || addr.city || addr.town || order?.city || '',
    taluk: addr.taluk || '',
    district: addr.district || 'Chennai',
    state: addr.state || order?.state || 'Tamil Nadu',
    pincode: digits(addr.pincode || order?.pincode, 6, false),
    landmark: addr.landmark || addr.near_landmark || order?.landmark || '',
    deliveryInstructions: addr.deliveryInstructions || addr.delivery_instructions || '',
  };
}

export const EditOrderAddressModal: React.FC<EditOrderAddressModalProps> = ({
  isOpen,
  onClose,
  order,
  onOrderUpdated,
  onShowToast,
}) => {
  const { user } = useStore();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ShippingFormData>(() => toFormData(order));
  const [addressOverride, setAddressOverride] = useState('');

  useEffect(() => {
    if (!order) return;
    setForm(toFormData(order));
    setAddressOverride('');
  }, [order]);

  if (!isOpen || !order) return null;

  const currentLabelAddress: string = order.shippingAddress?.address || order.address || '';

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    const cleanPhone = digits(form.phone, 10);
    const cleanAlt = digits(form.alternatePhone, 10);
    if (!form.studentName.trim()) return onShowToast('Please enter student / customer name');
    if (cleanPhone.length !== 10) return onShowToast('Please enter a valid 10-digit primary mobile number');
    if (cleanAlt && (cleanAlt.length !== 10 || cleanAlt === cleanPhone)) {
      return onShowToast('Alternate mobile must be a different 10-digit number');
    }
    if (digits(form.pincode, 6, false).length !== 6) return onShowToast('Please enter a valid 6-digit PIN code');
    if (form.whatsappNumber && digits(form.whatsappNumber, 10).length !== 10) {
      return onShowToast('WhatsApp number must be 10 digits');
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders/address', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({
          orderId: order.orderId || order.id,
          studentName: form.studentName.trim(),
          parentName: form.parentName.trim(),
          phone: cleanPhone,
          alternatePhone: cleanAlt,
          email: form.email.trim(),
          whatsappNumber: digits(form.whatsappNumber, 10),
          alternateEmail: (form.alternateEmail || '').trim(),
          doorNo: form.doorNo.trim(),
          buildingName: (form.buildingName || '').trim(),
          floorNo: form.floorNo.trim(),
          streetName: form.streetName.trim(),
          areaLocality: form.areaLocality.trim(),
          townCity: form.townCity.trim(),
          city: form.townCity.trim(),
          taluk: (form.taluk || '').trim(),
          district: form.district.trim(),
          state: form.state.trim() || 'Tamil Nadu',
          pincode: digits(form.pincode, 6, false),
          landmark: form.landmark.trim(),
          deliveryInstructions: (form.deliveryInstructions || '').trim(),
          // Empty → server rebuilds the courier label line from the structured fields
          address: addressOverride.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update order address');

      onShowToast(`✅ Shipping details updated for #${order.orderId}!`);

      const saved = data.shippingAddress || {};
      onOrderUpdated({
        ...order,
        customerName: saved.studentName || form.studentName.trim(),
        customerPhone: saved.phone || cleanPhone,
        customerAltPhone: saved.alternatePhone || cleanAlt,
        address: saved.address || order.address,
        city: saved.city || saved.townCity || form.townCity.trim(),
        pincode: saved.pincode || form.pincode,
        state: saved.state || form.state,
        landmark: saved.landmark || form.landmark.trim(),
        parentName: saved.parentName || form.parentName.trim(),
        email: saved.email || form.email.trim(),
        doorNo: saved.doorNo,
        floorNo: saved.floorNo,
        streetName: saved.streetName,
        areaLocality: saved.areaLocality,
        district: saved.district,
        shippingAddress: saved,
      });
      onClose();
    } catch (err: any) {
      onShowToast(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-order-address-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full my-8 overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-[#001B3A] to-[#002B5B] text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-[#001B3A] flex items-center justify-center font-bold">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 id="edit-order-address-title" className="font-heading font-black text-base sm:text-lg leading-tight">
                Edit Order Shipping Details
              </h2>
              <p className="text-[11px] text-amber-300 font-medium">
                Order #{order.orderId} · Same full address form customers fill on the website
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto bg-slate-50/60">
          <StudentShippingAddressForm data={form} onChange={setForm} />

          {/* Courier label override (optional) */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2">
            {currentLabelAddress && (
              <p className="text-[11px] text-slate-500">
                <span className="font-bold text-slate-700">Current label address: </span>
                {currentLabelAddress}
              </p>
            )}
            <label htmlFor="address-override" className="block font-bold text-slate-700">
              Custom courier label address{' '}
              <span className="font-normal text-slate-400 text-[10.5px]">
                (optional — leave empty to auto-build from the fields above)
              </span>
            </label>
            <textarea
              id="address-override"
              rows={2}
              value={addressOverride}
              onChange={(e) => setAddressOverride(e.target.value)}
              placeholder="Only fill this if the label must be printed exactly as typed"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 resize-none text-[11px]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold text-xs transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-[#2874f0] hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Shipping Details</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
