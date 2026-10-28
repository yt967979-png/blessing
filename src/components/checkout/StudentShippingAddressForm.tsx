'use client';

import React from 'react';
import {
  User,
  Phone,
  Mail,
  Home,
  MapPin,
  Building2,
  Compass,
  FileText,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { TAMIL_NADU_DISTRICTS, FLOOR_OPTIONS } from '@/lib/addresses';

export interface ShippingFormData {
  type?: string;
  // ── 14 Mandatory Fields (*) ──
  studentName: string; // 1. Student Full Name *
  parentName: string; // 2. Parent / Guardian Name *
  phone: string; // 3. Mobile Number *
  alternatePhone: string; // 4. Alternate Mobile Number *
  email: string; // 5. Primary Email ID *
  doorNo: string; // 6. Door / House / Flat Number *
  floorNo: string; // 7. Floor Number / Floor Details * (includes Independent House)
  streetName: string; // 8. Street / Road Name *
  areaLocality: string; // 9. Area / Locality *
  townCity: string; // 10. Village / Town / City *
  district: string; // 11. District * (Tamil Nadu 38 districts)
  state: string; // 12. State * ("Tamil Nadu")
  pincode: string; // 13. PIN Code * (6 digits)
  landmark: string; // 14. Nearby Landmark *

  // ── 5 Optional Fields ──
  whatsappNumber?: string; // 1. WhatsApp Number (optional)
  alternateEmail?: string; // 2. Alternate Email ID (optional)
  buildingName?: string; // 3. Building / Apartment Name (optional)
  taluk?: string; // 4. Taluk (optional)
  deliveryInstructions?: string; // 5. Delivery Instructions (optional)
}

interface StudentShippingAddressFormProps {
  data: ShippingFormData;
  onChange: (updated: ShippingFormData) => void;
  onSubmit?: () => void;
  submitButtonText?: string;
  isLoading?: boolean;
  onCancel?: () => void;
}

export const StudentShippingAddressForm: React.FC<StudentShippingAddressFormProps> = ({
  data,
  onChange,
  onSubmit,
  submitButtonText = 'Save Address',
  isLoading = false,
  onCancel,
}) => {
  const updateField = <K extends keyof ShippingFormData>(field: K, value: ShippingFormData[K]) => {
    onChange({
      ...data,
      [field]: value,
    });
  };

  const handleCopyPhoneToWhatsApp = () => {
    if (data.phone) {
      updateField('whatsappNumber', data.phone);
    }
  };

  return (
    <div className="space-y-6 text-xs">
      {/* ── Form Title & Summary Badge ─────────────────────────────── */}
      <div className="bg-gradient-to-r from-blue-50 via-slate-50 to-amber-50 p-3.5 rounded-2xl border border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div>
          <h3 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
            <span>📦 Student Book Order – Shipping Details</span>
          </h3>
          <p className="text-[11px] text-slate-600 mt-0.5">
            ST Courier மூலம் விரைவாக டெலிவரி செய்ய கீழே உள்ள விவரங்களை நிரப்பவும்.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold px-2.5 py-1 rounded-full border border-blue-200">
            14 Mandatory *
          </span>
          <span className="text-[10px] bg-slate-200 text-slate-700 font-bold px-2.5 py-1 rounded-full">
            5 Optional
          </span>
        </div>
      </div>

      {/* ── SECTION 1: Student & Parent Information ─────────────────── */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
          <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
            1
          </div>
          <div>
            <h4 className="font-extrabold text-slate-900 text-xs">
              Student &amp; Parent Details (மாணவர் &amp; பெற்றோர் விவரங்கள்)
            </h4>
            <p className="text-[10px] text-slate-500">Contact &amp; order confirmation details</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 1. Student Full Name * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Student Full Name <span className="text-red-500 font-black">*</span>
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={data.studentName || ''}
                onChange={(e) => updateField('studentName', e.target.value)}
                placeholder="மாணவர் பெயர் (e.g. K. Yogesh)"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
              />
            </div>
          </div>

          {/* 2. Parent / Guardian Name * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Parent / Guardian Name <span className="text-red-500 font-black">*</span>
            </label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={data.parentName || ''}
                onChange={(e) => updateField('parentName', e.target.value)}
                placeholder="பெற்றோர் / பாதுகாவலர் பெயர்"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
              />
            </div>
          </div>

          {/* 3. Mobile Number * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Mobile Number <span className="text-red-500 font-black">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={data.phone || ''}
                onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit Primary Mobile"
                className="w-full pl-11 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs font-mono transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">OTP &amp; order updates will be sent here</p>
          </div>

          {/* 4. Alternate Mobile Number * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Alternate Mobile Number <span className="text-red-500 font-black">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">
                +91
              </span>
              <input
                type="tel"
                maxLength={10}
                value={data.alternatePhone || ''}
                onChange={(e) => updateField('alternatePhone', e.target.value.replace(/\D/g, ''))}
                placeholder="Different 10-digit number (ST Courier)"
                className="w-full pl-11 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs font-mono transition-all"
              />
            </div>
            <p className="text-[10px] text-amber-700 font-semibold mt-0.5">
              Required. Courier calls this if primary number is busy or unreachable.
            </p>
          </div>

          {/* 5. Primary Email ID * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Primary Email ID <span className="text-red-500 font-black">*</span>
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={data.email || ''}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="name@example.com (GST Invoice will be sent)"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
              />
            </div>
          </div>

          {/* WhatsApp Number (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700">
                WhatsApp Number <span className="font-normal text-slate-400 text-[10.5px]">(optional)</span>
              </label>
              {data.phone && data.phone !== data.whatsappNumber && (
                <button
                  type="button"
                  onClick={handleCopyPhoneToWhatsApp}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-bold cursor-pointer"
                >
                  Same as Mobile
                </button>
              )}
            </div>
            <div className="relative">
              <Phone className="w-3.5 h-3.5 text-emerald-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                maxLength={10}
                value={data.whatsappNumber || ''}
                onChange={(e) => updateField('whatsappNumber', e.target.value.replace(/\D/g, ''))}
                placeholder="WhatsApp for ST Courier live tracking docket"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 text-xs font-mono transition-all"
              />
            </div>
          </div>

          {/* Alternate Email ID (Optional) */}
          <div className="sm:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">
              Alternate Email ID <span className="font-normal text-slate-400 text-[10.5px]">(optional)</span>
            </label>
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={data.alternateEmail || ''}
                onChange={(e) => updateField('alternateEmail', e.target.value)}
                placeholder="Secondary email for backup receipts"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 2: Door, Floor & Building Details ──────────────── */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
          <div className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
            2
          </div>
          <div>
            <h4 className="font-extrabold text-slate-900 text-xs">
              Door, Floor &amp; Building Details (கதவு &amp; தள விவரங்கள்)
            </h4>
            <p className="text-[10px] text-slate-500">Accurate premises identification for the courier</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 6. Door / House / Flat Number * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Door / House / Flat Number <span className="text-red-500 font-black">*</span>
            </label>
            <div className="relative">
              <Home className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={data.doorNo || ''}
                onChange={(e) => updateField('doorNo', e.target.value)}
                placeholder="e.g. 14/B, Flat 302, Plot 12"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
              />
            </div>
          </div>

          {/* Building / Apartment Name (Optional) */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Building / Apartment Name <span className="font-normal text-slate-400 text-[10.5px]">(optional)</span>
            </label>
            <div className="relative">
              <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={data.buildingName || ''}
                onChange={(e) => updateField('buildingName', e.target.value)}
                placeholder="e.g. Sri Krishna Apartments, Royal Enclave"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
              />
            </div>
          </div>

          {/* 7. Floor Number / Floor Details * (With Independent House 1-tap option) */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="block font-bold text-slate-700">
              Floor Number / Floor Details <span className="text-red-500 font-black">*</span>
            </label>
            <p className="text-[11px] text-slate-500">
              தனி வீட்டில் வசிப்பவர்கள் கீழே உள்ள <strong>&quot;Independent House (தனி வீடு)&quot;</strong> என்பதை ஒரு கிளிக்கில் தேர்ந்தெடுக்கலாம்:
            </p>

            {/* Quick 1-tap Choice Chips */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {FLOOR_OPTIONS.map((opt) => {
                const isSelected = data.floorNo === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField('floorNo', opt)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                    }`}
                  >
                    {isSelected && <span className="mr-1">✓</span>}
                    {opt}
                  </button>
                );
              })}
            </div>

            <div className="pt-1">
              <input
                type="text"
                value={data.floorNo || ''}
                onChange={(e) => updateField('floorNo', e.target.value)}
                placeholder="Or type specific floor (e.g. 4th Floor, Block C)"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION 3: Street, Locality & Town ──────────────────────── */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
          <div className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
            3
          </div>
          <div>
            <h4 className="font-extrabold text-slate-900 text-xs">
              Street, Locality &amp; Town (தெரு &amp; ஊர் விவரங்கள்)
            </h4>
            <p className="text-[10px] text-slate-500">Road name and neighborhood details</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* 8. Street / Road Name * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Street / Road Name <span className="text-red-500 font-black">*</span>
            </label>
            <input
              type="text"
              value={data.streetName || ''}
              onChange={(e) => updateField('streetName', e.target.value)}
              placeholder="e.g. Gandhi Nagar 2nd Main Road"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
            />
          </div>

          {/* 9. Area / Locality * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Area / Locality <span className="text-red-500 font-black">*</span>
            </label>
            <input
              type="text"
              value={data.areaLocality || ''}
              onChange={(e) => updateField('areaLocality', e.target.value)}
              placeholder="e.g. Anna Nagar West, Madhuranthakam"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
            />
          </div>

          {/* 10. Village / Town / City * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Village / Town / City <span className="text-red-500 font-black">*</span>
            </label>
            <input
              type="text"
              value={data.townCity || ''}
              onChange={(e) => updateField('townCity', e.target.value)}
              placeholder="e.g. Melmaruvathur Town, Tindivanam"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
            />
          </div>

          {/* Taluk (Optional) */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Taluk <span className="font-normal text-slate-400 text-[10.5px]">(optional)</span>
            </label>
            <input
              type="text"
              value={data.taluk || ''}
              onChange={(e) => updateField('taluk', e.target.value)}
              placeholder="e.g. Cheyyur Taluk, Chengalpattu Taluk"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
            />
          </div>

          {/* 14. Nearby Landmark * */}
          <div className="sm:col-span-2">
            <label className="block font-bold text-slate-700 mb-1">
              Nearby Landmark <span className="text-red-500 font-black">*</span>
            </label>
            <div className="relative">
              <Compass className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={data.landmark || ''}
                onChange={(e) => updateField('landmark', e.target.value)}
                placeholder="அருகிலுள்ள அடையாளம் (e.g. Near Govt High School / Opp. Bus Stand / Near Pillayar Kovil)"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Helps ST Courier delivery agent locate your home quickly without calling repeatedly.
            </p>
          </div>
        </div>
      </div>

      {/* ── SECTION 4: District, State, PIN Code & Delivery Notes ───── */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
          <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
            4
          </div>
          <div>
            <h4 className="font-extrabold text-slate-900 text-xs">
              District, PIN Code &amp; State (மாவட்டம் &amp; அஞ்சல் குறியீடு)
            </h4>
            <p className="text-[10px] text-slate-500">Tamil Nadu routing &amp; PIN code validation</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* 11. District * (Select from Tamil Nadu 38 Districts) */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              District <span className="text-red-500 font-black">*</span>
            </label>
            <select
              value={data.district || 'Chennai'}
              onChange={(e) => updateField('district', e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all cursor-pointer font-bold text-slate-800"
            >
              {TAMIL_NADU_DISTRICTS.map((dist) => (
                <option key={dist} value={dist}>
                  {dist}
                </option>
              ))}
            </select>
          </div>

          {/* 12. State * (Pre-set to Tamil Nadu) */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              State <span className="text-red-500 font-black">*</span>
            </label>
            <input
              type="text"
              readOnly
              value={data.state || 'Tamil Nadu'}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-700 font-bold text-xs cursor-not-allowed outline-none"
            />
          </div>

          {/* 13. PIN Code * */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              PIN Code <span className="text-red-500 font-black">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                maxLength={6}
                value={data.pincode || ''}
                onChange={(e) => updateField('pincode', e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit PIN Code"
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs font-mono font-bold transition-all"
              />
            </div>
          </div>

          {/* Delivery Instructions (Optional) */}
          <div className="sm:col-span-3">
            <label className="block font-bold text-slate-700 mb-1">
              Delivery Instructions <span className="font-normal text-slate-400 text-[10.5px]">(optional)</span>
            </label>
            <div className="relative">
              <FileText className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
              <textarea
                rows={2}
                value={data.deliveryInstructions || ''}
                onChange={(e) => updateField('deliveryInstructions', e.target.value)}
                placeholder="e.g. Call before delivery, School hours 9 AM to 4 PM, Leave at security gate"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl bg-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-xs transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Submit & Action Buttons ─────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>
        )}
        {onSubmit && (
          <button
            type="button"
            disabled={isLoading}
            onClick={onSubmit}
            className="flex-1 py-3.5 px-6 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 disabled:opacity-60 text-white font-extrabold text-sm rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <span>Saving Address...</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitButtonText}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
