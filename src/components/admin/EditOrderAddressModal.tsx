'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  User,
  Phone,
  Mail,
  Home,
  CheckCircle2,
  Loader2,
  Building2,
  Compass,
} from 'lucide-react';
import { TAMIL_NADU_DISTRICTS, FLOOR_OPTIONS } from '@/lib/addresses';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';

interface EditOrderAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: any | null;
  onOrderUpdated: (updatedOrder: any) => void;
  onShowToast: (msg: string) => void;
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

  // Form states (14 Fields)
  const [studentName, setStudentName] = useState('');
  const [parentName, setParentName] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [doorNo, setDoorNo] = useState('');
  const [floorNo, setFloorNo] = useState('');
  const [streetName, setStreetName] = useState('');
  const [areaLocality, setAreaLocality] = useState('');
  const [city, setCity] = useState('');
  const [district, setDistrict] = useState('Chennai');
  const [state, setState] = useState('Tamil Nadu');
  const [pincode, setPincode] = useState('');
  const [landmark, setLandmark] = useState('');
  const [fullAddress, setFullAddress] = useState('');

  useEffect(() => {
    if (!order) return;
    const addr = order.shippingAddress || {};

    setStudentName(addr.studentName || addr.name || order.customerName || '');
    setParentName(addr.parentName || '');
    setPhone(String(addr.phone || order.customerPhone || '').replace(/\D/g, '').slice(-10));
    setAlternatePhone(String(addr.alternatePhone || addr.alternate_phone || order.customerAltPhone || '').replace(/\D/g, '').slice(-10));
    setEmail(addr.email || addr.primary_email || '');
    setDoorNo(addr.doorNo || addr.door_no || '');
    setFloorNo(addr.floorNo || addr.floor_no || 'Independent House (தனி வீடு / Ground Floor)');
    setStreetName(addr.streetName || addr.street_name || '');
    setAreaLocality(addr.areaLocality || addr.area_locality || '');
    setCity(addr.townCity || addr.city || order.city || '');
    setDistrict(addr.district || order.city || 'Chennai');
    setState(addr.state || order.state || 'Tamil Nadu');
    setPincode(String(addr.pincode || order.pincode || '').replace(/\D/g, '').slice(0, 6));
    setLandmark(addr.landmark || addr.near_landmark || order.landmark || '');
    setFullAddress(order.address || addr.address || '');
  }, [order]);

  if (!isOpen || !order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (!studentName.trim()) {
      onShowToast('Please enter student / customer name');
      return;
    }
    if (cleanPhone.length !== 10) {
      onShowToast('Please enter a valid 10-digit primary mobile number');
      return;
    }
    if (pincode.replace(/\D/g, '').length !== 6) {
      onShowToast('Please enter a valid 6-digit postal pincode');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/orders/address', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(user),
        },
        body: JSON.stringify({
          orderId: order.orderId || order.id,
          studentName: studentName.trim(),
          parentName: parentName.trim(),
          phone: cleanPhone,
          alternatePhone: alternatePhone.replace(/\D/g, '').slice(-10),
          email: email.trim(),
          doorNo: doorNo.trim(),
          floorNo: floorNo.trim(),
          streetName: streetName.trim(),
          areaLocality: areaLocality.trim(),
          city: city.trim(),
          district: district.trim(),
          state: state.trim(),
          pincode: pincode.trim(),
          landmark: landmark.trim(),
          address: fullAddress.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update order address');
      }

      onShowToast(`✅ Shipping address updated for #${order.orderId}!`);

      const updated = {
        ...order,
        customerName: studentName.trim(),
        customerPhone: cleanPhone,
        customerAltPhone: alternatePhone.replace(/\D/g, '').slice(-10),
        address: data.shippingAddress?.address || fullAddress.trim(),
        city: city.trim() || district.trim(),
        pincode: pincode.trim(),
        state: state.trim(),
        landmark: landmark.trim(),
        shippingAddress: data.shippingAddress,
      };

      onOrderUpdated(updated);
      onClose();
    } catch (err: any) {
      onShowToast(`❌ Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-[#001B3A] to-[#002B5B] text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-400 text-[#001B3A] flex items-center justify-center font-bold">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-black text-base sm:text-lg leading-tight">
                Edit Order Shipping Details
              </h2>
              <p className="text-[11px] text-amber-300 font-medium">
                Order #{order.orderId} · Correct student address, mobile number or landmark
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {/* Student & Contact */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span>Customer / Student Contact Details</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Student Full Name *</label>
                <input
                  type="text"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. S. Murugan"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Parent / Guardian Name</label>
                <input
                  type="text"
                  value={parentName}
                  onChange={(e) => setParentName(e.target.value)}
                  placeholder="e.g. K. Selvam (Father)"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Primary Mobile (10 Digits) *</label>
                <input
                  type="tel"
                  required
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 9876543210"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-mono font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Alternate Mobile Number</label>
                <input
                  type="tel"
                  maxLength={10}
                  value={alternatePhone}
                  onChange={(e) => setAlternatePhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 9443210987"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-mono font-medium"
                />
              </div>
            </div>
          </div>

          {/* 14 Mandatory Address Fields */}
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 text-blue-600" />
                <span>Doorstep Delivery Address (14 Format)</span>
              </div>
              <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                ST Courier Delivery
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Door / Flat / House No *</label>
                <input
                  type="text"
                  value={doorNo}
                  onChange={(e) => setDoorNo(e.target.value)}
                  placeholder="e.g. 14/2, Plot 45"
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
                  value={streetName}
                  onChange={(e) => setStreetName(e.target.value)}
                  placeholder="e.g. Gandhi Street, Nehru Road"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Area / Locality *</label>
                <input
                  type="text"
                  value={areaLocality}
                  onChange={(e) => setAreaLocality(e.target.value)}
                  placeholder="e.g. Anna Nagar, KK Nagar"
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
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="e.g. Opposite Bus Stop, Near SBI ATM"
                  className="w-full px-3.5 py-2.5 bg-white border border-blue-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Village / Town / City *</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Madurai, Coimbatore"
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
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 625020"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-mono font-medium"
                />
              </div>
            </div>

            {/* Direct Address Textarea Override */}
            <div className="pt-2 border-t border-slate-200">
              <label className="block font-bold text-slate-700 mb-1">
                Full Formatted Address Line (Printed on Courier Label)
              </label>
              <textarea
                rows={2}
                value={fullAddress}
                onChange={(e) => setFullAddress(e.target.value)}
                placeholder="Or paste full raw address text here"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium resize-none text-[11px]"
              />
            </div>
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

