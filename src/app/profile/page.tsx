'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Package,
  Heart,
  MapPin,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Truck,
  Edit2,
  Check,
  CreditCard,
  Plus,
  Trash2,
  AlertCircle,
  AlertTriangle,
  ShoppingBag,
  Download,
  X,
  TicketPercent,
  MessageCircle,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { isValidMobileNumber, normalizeRequiredAlternateMobile } from '@/lib/authValidation';
import {
  createUserAddress,
  deleteUserAddress,
  formatFullAddressLine,
  migrateLocalAddressesToDb,
  updateUserAddress,
  checkAddressCompleteness,
} from '@/lib/addresses';
import { authHeaders } from '@/lib/clientAuth';
import { useOrderLiveSync } from '@/hooks/useOrderLiveSync';
import { Header } from '@/components/layout/Header';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { ProfileCouponsSection } from '@/components/profile/ProfileCouponsSection';
import { isRecordCancelled, isParcelDelivered, isDeliveryAttempted } from '@/lib/orderStatus';
import { StudentShippingAddressForm, type ShippingFormData } from '@/components/checkout/StudentShippingAddressForm';
import { pincodeDeliveryMessage } from '@/lib/pincode';

const initialNewAddress: ShippingFormData = {
  type: 'HOME',
  studentName: '',
  parentName: '',
  phone: '',
  alternatePhone: '',
  email: '',
  whatsappNumber: '',
  alternateEmail: '',
  doorNo: '',
  floorNo: 'Independent House (தனி வீடு / Ground Floor)',
  buildingName: '',
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

function addressToShippingFormData(a: any): ShippingFormData {
  return {
    type: a?.type || 'HOME',
    studentName: a?.studentName || a?.name || '',
    parentName: a?.parentName || '',
    phone: a?.phone || '',
    alternatePhone: a?.alternatePhone || '',
    email: a?.email || a?.primaryEmail || '',
    whatsappNumber: a?.whatsappNumber || '',
    alternateEmail: a?.alternateEmail || '',
    doorNo: a?.doorNo || '',
    floorNo: a?.floorNo || 'Independent House (தனி வீடு / Ground Floor)',
    buildingName: a?.buildingName || '',
    streetName: a?.streetName || a?.address || '',
    areaLocality: a?.areaLocality || '',
    townCity: a?.townCity || a?.town || a?.city || '',
    taluk: a?.taluk || '',
    district: a?.district || a?.city || 'Chennai',
    state: a?.state || 'Tamil Nadu',
    pincode: String(a?.pincode || ''),
    landmark: a?.landmark || '',
    deliveryInstructions: a?.deliveryInstructions || '',
  };
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, loginUser, logoutUser, wishlist, wishlistCount, products, cart, showToast, setIsAuthOpen } = useStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'addresses' | 'wishlist' | 'coupons'>('orders');

  // Dynamic user edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');

  // Addresses from PostgreSQL
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(false);

  // Live Orders fetched from API
  const [liveOrders, setLiveOrders] = useState<any[]>([]);

  // Sync state when user logs in/out or updates profile
  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setPhone(user.phone || '');
    }
  }, [user]);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'coupons' || tab === 'orders' || tab === 'profile' || tab === 'addresses' || tab === 'wishlist') {
      setActiveTab(tab);
    }
  }, []);

  // Load addresses from DB (migrate old localStorage once)
  useEffect(() => {
    if (!user?.id) {
      setAddresses([]);
      return;
    }
    let cancelled = false;
    setAddressesLoading(true);
    migrateLocalAddressesToDb(user)
      .then((list) => {
        if (!cancelled) setAddresses(list);
      })
      .finally(() => {
        if (!cancelled) setAddressesLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const fetchUserLiveOrders = () => {
      if (user) {
        fetch(`/api/orders`, { headers: authHeaders(user) })
          .then((res) => res.json())
          .then((data) => {
            if (Array.isArray(data)) {
              setLiveOrders(data);
            }
          })
          .catch(() => {});
      } else {
        setLiveOrders([]);
      }
    };

    fetchUserLiveOrders();

    const interval = setInterval(fetchUserLiveOrders, 45000);
    return () => {
      clearInterval(interval);
    };
  }, [user]);

  useOrderLiveSync(Boolean(user?.id), () => {
    if (!user) return;
    fetch(`/api/orders`, { headers: authHeaders(user) })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setLiveOrders(data);
      })
      .catch(() => {});
  });

  // Save updated user profile info to Railway PostgreSQL
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const res = await fetch('/api/auth', {
        method: 'PATCH',
        headers: authHeaders(user),
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (data.error) {
        showToast('⚠️ ' + data.error);
        return;
      }
      loginUser(
        { ...user, name: data.name || name, phone: data.phone || phone, needsProfile: false },
        cart,
        wishlist,
        addresses
      );
      setIsEditing(false);
      showToast('✓ Profile saved successfully!');
    } catch {
      loginUser({ ...user, name, phone, needsProfile: false }, cart, wishlist, addresses);
      setIsEditing(false);
      showToast('✓ Profile updated (offline).');
    }
  };

  const [showAddAddrForm, setShowAddAddrForm] = useState(false);
  const [editingAddrId, setEditingAddrId] = useState<string | null>(null);
  const [addrFormData, setAddrFormData] = useState<ShippingFormData>(initialNewAddress);
  const [addressSaving, setAddressSaving] = useState(false);

  const startAddAddress = () => {
    setEditingAddrId(null);
    setAddrFormData({
      ...initialNewAddress,
      studentName: user?.name || '',
      phone: user?.phone || '',
      email: user?.email || '',
    });
    setShowAddAddrForm(true);
  };

  const startEditAddress = (addr: any) => {
    setEditingAddrId(String(addr.id));
    setAddrFormData(addressToShippingFormData(addr));
    setShowAddAddrForm(true);
  };

  const handleAddAddress = async () => {
    if (!user?.id) return;
    // 14 Mandatory Fields
    if (!addrFormData.studentName.trim()) {
      showToast('1. Student Full Name is required *');
      return;
    }
    if (!addrFormData.parentName.trim()) {
      showToast('2. Parent / Guardian Name is required *');
      return;
    }
    if (!isValidMobileNumber(addrFormData.phone)) {
      showToast('3. Enter a valid 10-digit primary Mobile Number *');
      return;
    }
    const alt = normalizeRequiredAlternateMobile(addrFormData.alternatePhone, addrFormData.phone);
    if (!alt.ok) {
      showToast(alt.error);
      return;
    }
    if (!addrFormData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addrFormData.email.trim())) {
      showToast('5. Enter a valid Primary Email ID *');
      return;
    }
    if (!addrFormData.doorNo.trim()) {
      showToast('6. Door / House / Flat Number is required *');
      return;
    }
    if (!addrFormData.floorNo.trim()) {
      showToast('7. Floor Details is required (or select Independent House) *');
      return;
    }
    if (!addrFormData.streetName.trim()) {
      showToast('8. Street / Road Name is required *');
      return;
    }
    if (!addrFormData.areaLocality.trim()) {
      showToast('9. Area / Locality is required *');
      return;
    }
    if (!addrFormData.townCity.trim()) {
      showToast('10. Village / Town / City is required *');
      return;
    }
    if (!addrFormData.district.trim()) {
      showToast('11. District is required *');
      return;
    }
    if (!addrFormData.state.trim()) {
      showToast('12. State is required *');
      return;
    }
    if (!addrFormData.pincode || String(addrFormData.pincode).length !== 6) {
      showToast('13. Enter a valid 6-digit PIN Code *');
      return;
    }
    const pinCheck = pincodeDeliveryMessage(String(addrFormData.pincode));
    if (!pinCheck.ok) {
      showToast(pinCheck.message);
      return;
    }
    if (!addrFormData.landmark.trim()) {
      showToast('14. Nearby Landmark is required *');
      return;
    }

    setAddressSaving(true);
    try {
      const fullAddress = formatFullAddressLine({
        doorNo: addrFormData.doorNo,
        floorNo: addrFormData.floorNo,
        buildingName: addrFormData.buildingName,
        streetName: addrFormData.streetName,
        areaLocality: addrFormData.areaLocality,
        townCity: addrFormData.townCity,
        taluk: addrFormData.taluk,
        landmark: addrFormData.landmark,
      });

      const created = await createUserAddress(user, {
        type: addrFormData.type || 'HOME',
        studentName: addrFormData.studentName.trim(),
        parentName: addrFormData.parentName.trim(),
        name: addrFormData.studentName.trim(),
        phone: addrFormData.phone.trim(),
        alternatePhone: alt.value,
        whatsappNumber: (addrFormData.whatsappNumber || '').trim(),
        email: addrFormData.email.trim(),
        alternateEmail: (addrFormData.alternateEmail || '').trim(),
        doorNo: addrFormData.doorNo.trim(),
        floorNo: addrFormData.floorNo.trim(),
        buildingName: (addrFormData.buildingName || '').trim(),
        streetName: addrFormData.streetName.trim(),
        areaLocality: addrFormData.areaLocality.trim(),
        townCity: addrFormData.townCity.trim(),
        taluk: (addrFormData.taluk || '').trim(),
        district: addrFormData.district.trim(),
        state: addrFormData.state.trim() || 'Tamil Nadu',
        address: fullAddress,
        town: addrFormData.townCity.trim(),
        landmark: addrFormData.landmark.trim(),
        city: addrFormData.district.trim() || 'Chennai',
        pincode: String(addrFormData.pincode),
        deliveryInstructions: (addrFormData.deliveryInstructions || '').trim(),
        isDefault: addresses.length === 0,
      });
      if (!created.ok) {
        showToast(created.error);
        return;
      }
      setAddresses((prev) => [created.address, ...prev]);
      setShowAddAddrForm(false);
      setEditingAddrId(null);
      showToast('✓ Address saved to your account');
    } finally {
      setAddressSaving(false);
    }
  };

  const handleUpdateAddress = async () => {
    if (!user?.id || !editingAddrId) return;
    // 14 Mandatory Fields
    if (!addrFormData.studentName.trim()) {
      showToast('1. Student Full Name is required *');
      return;
    }
    if (!addrFormData.parentName.trim()) {
      showToast('2. Parent / Guardian Name is required *');
      return;
    }
    if (!isValidMobileNumber(addrFormData.phone)) {
      showToast('3. Enter a valid 10-digit primary Mobile Number *');
      return;
    }
    const alt = normalizeRequiredAlternateMobile(addrFormData.alternatePhone, addrFormData.phone);
    if (!alt.ok) {
      showToast(alt.error);
      return;
    }
    if (!addrFormData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addrFormData.email.trim())) {
      showToast('5. Enter a valid Primary Email ID *');
      return;
    }
    if (!addrFormData.doorNo.trim()) {
      showToast('6. Door / House / Flat Number is required *');
      return;
    }
    if (!addrFormData.floorNo.trim()) {
      showToast('7. Floor Details is required (or select Independent House) *');
      return;
    }
    if (!addrFormData.streetName.trim()) {
      showToast('8. Street / Road Name is required *');
      return;
    }
    if (!addrFormData.areaLocality.trim()) {
      showToast('9. Area / Locality is required *');
      return;
    }
    if (!addrFormData.townCity.trim()) {
      showToast('10. Village / Town / City is required *');
      return;
    }
    if (!addrFormData.district.trim()) {
      showToast('11. District is required *');
      return;
    }
    if (!addrFormData.state.trim()) {
      showToast('12. State is required *');
      return;
    }
    if (!addrFormData.pincode || String(addrFormData.pincode).length !== 6) {
      showToast('13. Enter a valid 6-digit PIN Code *');
      return;
    }
    const pinCheck = pincodeDeliveryMessage(String(addrFormData.pincode));
    if (!pinCheck.ok) {
      showToast(pinCheck.message);
      return;
    }
    if (!addrFormData.landmark.trim()) {
      showToast('14. Nearby Landmark is required *');
      return;
    }

    setAddressSaving(true);
    try {
      const fullAddress = formatFullAddressLine({
        doorNo: addrFormData.doorNo,
        floorNo: addrFormData.floorNo,
        buildingName: addrFormData.buildingName,
        streetName: addrFormData.streetName,
        areaLocality: addrFormData.areaLocality,
        townCity: addrFormData.townCity,
        taluk: addrFormData.taluk,
        landmark: addrFormData.landmark,
      });

      const updated = await updateUserAddress(user, editingAddrId, {
        type: addrFormData.type || 'HOME',
        studentName: addrFormData.studentName.trim(),
        parentName: addrFormData.parentName.trim(),
        name: addrFormData.studentName.trim(),
        phone: addrFormData.phone.trim(),
        alternatePhone: alt.value,
        whatsappNumber: (addrFormData.whatsappNumber || '').trim(),
        email: addrFormData.email.trim(),
        alternateEmail: (addrFormData.alternateEmail || '').trim(),
        doorNo: addrFormData.doorNo.trim(),
        floorNo: addrFormData.floorNo.trim(),
        buildingName: (addrFormData.buildingName || '').trim(),
        streetName: addrFormData.streetName.trim(),
        areaLocality: addrFormData.areaLocality.trim(),
        townCity: addrFormData.townCity.trim(),
        taluk: (addrFormData.taluk || '').trim(),
        district: addrFormData.district.trim(),
        state: addrFormData.state.trim() || 'Tamil Nadu',
        address: fullAddress,
        town: addrFormData.townCity.trim(),
        landmark: addrFormData.landmark.trim(),
        city: addrFormData.district.trim() || 'Chennai',
        pincode: String(addrFormData.pincode),
        deliveryInstructions: (addrFormData.deliveryInstructions || '').trim(),
      });
      if (!updated.ok) {
        showToast(updated.error);
        return;
      }
      setAddresses((prev) => prev.map((a) => (String(a.id) === editingAddrId ? updated.address : a)));
      setShowAddAddrForm(false);
      setEditingAddrId(null);
      showToast('✓ Address updated');
    } finally {
      setAddressSaving(false);
    }
  };

  const handleDeleteAddress = async (id: string | number) => {
    if (!user?.id) return;
    const ok = await deleteUserAddress(user, String(id));
    if (!ok) {
      showToast('❌ Failed to delete address');
      return;
    }
    setAddresses((prev) => prev.filter((a) => a.id !== id));
    showToast('🗑️ Address removed');
  };

  const handleSetDefaultAddress = async (id: string | number) => {
    if (!user?.id) return;
    const updated = await updateUserAddress(user, String(id), { isDefault: true });
    if (!updated.ok) {
      showToast(updated.error);
      return;
    }
    setAddresses((prev) =>
      prev
        .map((a) => ({ ...a, isDefault: a.id === id }))
        .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
    );
    showToast('✓ Default address updated');
  };

  const wishlistedProducts = products.filter((p) => wishlist.includes(p.id));

  // If user is not logged in, prompt sign in box
  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
        <AnnouncementBar />
        <Header />
        <div className="max-w-md mx-auto my-16 p-8 bg-white border border-slate-200 rounded-3xl shadow-xl text-center space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-200">
            <User className="w-8 h-8" />
          </div>
          <h2 className="font-heading font-black text-xl text-[#001B3A]">Sign In to Your Account</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Access your order history, delivery addresses, and saved guides.
          </p>
          <button
            onClick={() => setIsAuthOpen(true)}
            className="w-full bg-[#0044AA] hover:bg-[#003388] text-white font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2"
          >
            <span>SIGN IN / REGISTER</span>
          </button>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col page-mobile-nav">
      <AnnouncementBar />
      <Header />

      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-200 py-3">
        <div className="max-w-7xl mx-auto px-4 text-xs font-semibold text-slate-500 flex items-center gap-2">
          <Link href="/" className="hover:text-blue-600">
            Home
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900">My Account</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5 sm:py-8 flex-1 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-8">
          {/* Account sidebar — compact chips on mobile, full nav on desktop */}
          <div className="lg:col-span-4 space-y-3 lg:space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-xs flex items-center gap-3 sm:gap-4">
              <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-[#001B3A] to-[#003B73] text-amber-400 font-extrabold text-xl sm:text-2xl flex items-center justify-center shadow-md uppercase shrink-0">
                {user.name[0]}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Hello,
                </span>
                <h3 className="font-heading font-black text-base sm:text-lg text-[#001B3A] truncate">
                  {user.name}
                </h3>
                <span className="text-xs text-blue-600 font-semibold truncate block">
                  {user.email}
                </span>
              </div>
            </div>

            {/* Mobile horizontal tabs */}
            <div className="lg:hidden overflow-x-auto scroll-chips -mx-1 px-1">
              <div className="flex gap-2 min-w-max pb-0.5">
                {user && (user.role === 'admin' || user.role === 'super_admin') && (
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs font-extrabold touch-manipulation min-h-11 border transition-colors bg-[#001B3A] text-amber-400 border-amber-400/40"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Admin
                  </Link>
                )}
                {(
                  [
                    { id: 'orders' as const, label: `Orders (${liveOrders.length})`, Icon: Package },
                    { id: 'coupons' as const, label: 'Coupons', Icon: TicketPercent },
                    { id: 'profile' as const, label: 'Profile', Icon: User },
                    { id: 'addresses' as const, label: `Address (${addresses.length})`, Icon: MapPin },
                    { id: 'wishlist' as const, label: `Wishlist (${wishlistCount})`, Icon: Heart },
                  ] as const
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full text-xs font-extrabold touch-manipulation min-h-11 border transition-colors ${
                      activeTab === id
                        ? 'bg-[#2874f0] text-white border-[#2874f0] shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Desktop vertical nav */}
            <div className="hidden lg:block bg-white border border-slate-200 rounded-2xl p-2 shadow-xs text-xs font-bold divide-y divide-slate-100">
              {user && (user.role === 'admin' || user.role === 'super_admin') && (
                <Link
                  href="/admin"
                  className="w-full text-left px-4 py-3.5 rounded-xl flex items-center justify-between transition-colors bg-gradient-to-r from-[#001B3A] to-[#002B5B] text-amber-400 hover:brightness-110"
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    <span>Open Admin Dashboard</span>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-400" />
                </Link>
              )}

              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center justify-between transition-colors ${
                  activeTab === 'orders'
                    ? 'bg-blue-50 text-blue-700 font-black'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Package className="w-4 h-4 text-amber-500" />
                  <span>My Orders &amp; Tracking ({liveOrders.length})</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('coupons')}
                className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center justify-between transition-colors ${
                  activeTab === 'coupons'
                    ? 'bg-blue-50 text-blue-700 font-black'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <TicketPercent className="w-4 h-4 text-amber-500" />
                  <span>Available Coupons</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center justify-between transition-colors ${
                  activeTab === 'profile'
                    ? 'bg-blue-50 text-blue-700 font-black'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-blue-600" />
                  <span>Personal Info &amp; Security</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('addresses')}
                className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center justify-between transition-colors ${
                  activeTab === 'addresses'
                    ? 'bg-blue-50 text-blue-700 font-black'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span>Delivery Addresses ({addresses.length})</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('wishlist')}
                className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center justify-between transition-colors ${
                  activeTab === 'wishlist'
                    ? 'bg-blue-50 text-blue-700 font-black'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Heart className="w-4 h-4 text-red-500" />
                  <span>My Wishlist ({wishlistCount})</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                logoutUser();
                router.push('/');
              }}
              className="hidden lg:flex w-full bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs p-4 rounded-2xl items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>LOGOUT FROM ACCOUNT</span>
            </button>
          </div>

          {/* Right Main Dynamic Content Panel */}
          <div className="lg:col-span-8 space-y-4">
            {activeTab === 'coupons' && (
              <ProfileCouponsSection user={user} showToast={showToast} />
            )}

            {/* 1. Personal Information */}
            {activeTab === 'profile' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="font-heading font-black text-xl text-[#001B3A]">
                      Personal Info & Security
                    </h2>
                    <p className="text-xs text-slate-500">
                      Manage your account details, phone, and email address
                    </p>
                  </div>
                  {!isEditing ? (
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-xs font-extrabold text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Info</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => setIsEditing(false)}
                      className="text-xs font-bold text-slate-400 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Full Name</label>
                      <input
                        type="text"
                        required
                        disabled={!isEditing}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                          isEditing
                            ? 'border-blue-600 bg-white text-slate-900 font-semibold'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Mobile Number
                      </label>
                      <input
                        type="tel"
                        disabled={!isEditing}
                        placeholder="Add your mobile number"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                          isEditing
                            ? 'border-blue-600 bg-white text-slate-900 font-semibold'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      required
                      disabled={!isEditing}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                        isEditing
                          ? 'border-blue-600 bg-white text-slate-900 font-semibold'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    />
                  </div>

                  {isEditing && (
                    <button
                      type="submit"
                      className="bg-blue-600 hover:bg-[#001B3A] text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-md uppercase tracking-wider transition-colors flex items-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>SAVE CHANGES</span>
                    </button>
                  )}
                </form>
              </div>
            )}

            {/* 2. My Orders */}
            {activeTab === 'orders' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="font-heading font-black text-xl text-[#001B3A]">
                      My Orders & Tracking
                    </h2>
                    <p className="text-xs text-slate-500">
                      Track live shipments and download tax invoices
                    </p>
                  </div>
                  <Link
                    href="/orders"
                    className="text-xs font-extrabold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span>Full Orders Page</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>

                {liveOrders.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                    <Package className="w-12 h-12 mx-auto mb-3 text-amber-500 opacity-60" />
                    <h3 className="font-heading font-black text-slate-800 text-base">No active orders found yet</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                      When you purchase study guides via Checkout, your live order status &amp; ST Courier dockets will appear here!
                    </p>
                    <Link
                      href="/products"
                      className="inline-flex items-center gap-2 mt-4 bg-[#001B3A] hover:bg-blue-600 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-xs transition-all"
                    >
                      <ShoppingBag className="w-4 h-4 text-amber-400" />
                      <span>BROWSE STUDY GUIDES</span>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {liveOrders.map((o) => {
                      const rawStatus = o.courierStatus || o.status || 'Confirmed';
                      const cancelled = isRecordCancelled(o);
                      const currentStatus = String(rawStatus).toLowerCase().includes('awaiting')
                        ? 'Confirmed'
                        : rawStatus;
                      const allSteps = [
                        'Confirmed',
                        'Preparing Order',
                        'Packed',
                        'Handed to ST Courier',
                        'In Transit',
                        'Out for Delivery',
                        'Delivered',
                      ];
                      const hasAwb = Boolean(o.trackingNumber && !String(o.trackingNumber).startsWith('SHP-'));
                      const sLow = String(currentStatus || '').toLowerCase();
                      let stepIdx = 0;
                      if (cancelled) {
                        stepIdx = -1;
                      } else if (isParcelDelivered(sLow)) {
                        stepIdx = 6;
                      } else if (isDeliveryAttempted(sLow) || sLow.includes('out for delivery')) {
                        stepIdx = 5;
                      } else if (sLow.includes('in transit')) {
                        stepIdx = 4;
                      } else if (
                        sLow.includes('dispatched') ||
                        sLow.includes('dispatch') ||
                        sLow.includes('shipped') ||
                        sLow.includes('handed to st courier') ||
                        sLow.includes('handed') ||
                        hasAwb
                      ) {
                        stepIdx = 3;
                      } else if (sLow.includes('packed')) {
                        stepIdx = 2;
                      } else if (sLow.includes('preparing') || sLow.includes('prepar')) {
                        stepIdx = 1;
                      } else {
                        const directMatch = allSteps.findIndex((s) => s.toLowerCase() === sLow);
                        stepIdx = directMatch >= 0 ? directMatch : 0;
                      }

                      return (
                        <div
                          key={o.orderId}
                          className={`border rounded-2xl p-5 bg-white shadow-xs space-y-4 transition-all ${
                            cancelled ? 'border-red-200' : 'border-slate-200 hover:border-blue-300'
                          }`}
                        >
                          <div className="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                              <span className="font-heading font-black text-[#001B3A] text-base">
                                Order #{o.orderId}
                              </span>
                              <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-md font-extrabold text-[10px] uppercase">
                                {o.paymentMethod || 'Razorpay UPI'} • {o.paymentStatus || 'Paid'}
                              </span>
                            </div>

                            {cancelled ? (
                              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 font-extrabold text-xs px-3 py-1 rounded-full">
                                <X className="w-4 h-4" />
                                <span>Cancelled</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 font-extrabold text-xs px-3 py-1 rounded-full">
                                <Truck className="w-4 h-4 text-emerald-600 animate-pulse" />
                                <span>{currentStatus}</span>
                              </div>
                            )}
                          </div>

                          {cancelled ? (
                            <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-3 text-xs text-red-700 font-semibold">
                              This order is cancelled — no shipment will be sent.
                            </div>
                          ) : (
                          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 space-y-1.5">
                            <div className="flex justify-between items-center text-[10px] font-extrabold uppercase text-slate-500">
                              <span>Shipment Progress (Stage {stepIdx + 1} of {allSteps.length}):</span>
                              <span className="text-emerald-700 font-black">{currentStatus}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 text-[9px] text-center">
                              {allSteps.map((s, idx) => {
                                const isDone = idx <= stepIdx;
                                const isCur = idx === stepIdx;
                                return (
                                  <div
                                    key={s}
                                    className={`py-1 px-1 rounded border font-bold truncate transition-all ${
                                      isCur
                                        ? 'bg-[#001B3A] text-amber-300 border-[#001B3A] font-black shadow-xs'
                                        : isDone
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : 'bg-white text-slate-400 border-slate-200'
                                    }`}
                                  >
                                    {isDone ? '✓ ' : ''}{s}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          )}

                          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-1">
                            <div className="text-xs space-y-0.5">
                              <h4 className="font-heading font-black text-slate-900 text-sm">
                                {o.items?.[0]?.title || 'Blessing Power Guide Book Package'}
                              </h4>
                              <p className="text-slate-500 text-[11px]">
                                Deliver to: <strong className="text-slate-800">{o.customerName}</strong> ({o.address}{o.city ? `, ${o.city}` : ''})
                              </p>
                              {!cancelled && o.trackingNumber && (
                                <span className="text-[11px] font-mono text-amber-700 font-bold block pt-0.5">
                                  ST Courier Docket AWB: {o.trackingNumber}
                                </span>
                              )}
                              <div className="font-black text-sm text-[#001B3A] pt-1">
                                ₹{o.totalAmount} Total • {o.createdAt}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                              <a
                                href={`https://wa.me/919486017820?text=${encodeURIComponent(
                                  `Hello Blessing Power Guide, I would like to check details for my Order #${o.orderId}${o.trackingNumber ? ` (ST Courier AWB: ${o.trackingNumber})` : ''}.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#128C7E] border border-[#25D366]/30 font-extrabold text-xs px-3 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 flex-1 sm:flex-none cursor-pointer"
                                title="Contact support on WhatsApp regarding this order"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-[#25D366] fill-[#25D366]/20" />
                                <span>WHATSAPP</span>
                              </a>

                              <a
                                href={`/api/orders/${o.orderId}/invoice`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs px-3.5 py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 border border-slate-300 flex-1 sm:flex-none"
                                title="Download Official Tax Invoice PDF"
                              >
                                <Download className="w-3.5 h-3.5 text-blue-600" />
                                <span>INVOICE</span>
                              </a>

                              {cancelled ? (
                                <Link
                                  href="/orders"
                                  className="bg-red-700 hover:bg-red-800 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                                >
                                  <span>VIEW DETAILS</span>
                                </Link>
                              ) : (
                              <Link
                                href={`/track?orderId=${encodeURIComponent(o.orderId)}${
                                  o.customerPhone || user?.phone
                                    ? `&phone=${encodeURIComponent(o.customerPhone || user?.phone || '')}`
                                    : ''
                                }`}
                                className="bg-[#001B3A] hover:bg-blue-600 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 flex-1 sm:flex-none"
                              >
                                <Truck className="w-3.5 h-3.5 text-amber-400" />
                                <span>TRACK LIVE</span>
                              </Link>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 3. Delivery Addresses */}
            {activeTab === 'addresses' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs space-y-6">
                <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="font-heading font-black text-xl text-[#001B3A]">
                      Manage Delivery Addresses
                    </h2>
                    <p className="text-xs text-slate-500">
                      Save addresses to your account for fast checkout on any device
                    </p>
                  </div>
                  {addressesLoading && (
                    <p className="text-xs text-slate-400 px-1">Loading your saved addresses…</p>
                  )}
                  <button
                    onClick={() => {
                      if (showAddAddrForm) {
                        setShowAddAddrForm(false);
                        setEditingAddrId(null);
                      } else {
                        startAddAddress();
                      }
                    }}
                    className="bg-blue-600 hover:bg-[#001B3A] text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1 shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{showAddAddrForm ? 'CANCEL' : 'ADD ADDRESS'}</span>
                  </button>
                </div>

                {showAddAddrForm && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <h3 className="font-extrabold text-slate-800 text-sm">
                        {editingAddrId ? 'Update Shipping Address Details' : 'Add New Student Shipping Address'}
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddAddrForm(false);
                          setEditingAddrId(null);
                        }}
                        className="text-xs text-slate-500 hover:text-slate-800 font-bold"
                      >
                        Cancel
                      </button>
                    </div>

                    <StudentShippingAddressForm
                      data={addrFormData}
                      onChange={setAddrFormData}
                      onSubmit={() => void (editingAddrId ? handleUpdateAddress() : handleAddAddress())}
                      submitButtonText={editingAddrId ? 'SAVE CHANGES' : 'SAVE ADDRESS'}
                      isLoading={addressSaving}
                      onCancel={() => {
                        setShowAddAddrForm(false);
                        setEditingAddrId(null);
                      }}
                    />
                  </div>
                )}

                {addresses.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl p-6">
                    <MapPin className="w-12 h-12 mx-auto mb-2 opacity-30 text-emerald-600" />
                    <p className="text-xs font-bold text-slate-700">No delivery addresses saved yet</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 mb-4">Click + ADD ADDRESS to save your shipping address for fast 1-click checkout.</p>
                    <button
                      onClick={startAddAddress}
                      className="bg-blue-600 hover:bg-[#001B3A] text-white font-extrabold text-xs px-5 py-2.5 rounded-xl uppercase tracking-wider shadow-sm transition-colors cursor-pointer"
                    >
                      + ADD YOUR FIRST ADDRESS
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="border border-blue-200 bg-blue-50/40 rounded-2xl p-5 text-xs space-y-2 relative"
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                {addr.type || 'HOME'}
                              </span>
                              {addr.isDefault && (
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                  Default
                                </span>
                              )}
                              <span className="font-extrabold text-slate-900 text-sm">
                                {addr.studentName || addr.name}
                              </span>
                              {addr.parentName && (
                                <span className="text-[11px] text-slate-500 font-medium">
                                  (Parent: {addr.parentName})
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-slate-600 space-y-0.5">
                              <p>
                                <span className="font-semibold text-slate-700">Mobile:</span> {addr.phone}
                                {addr.alternatePhone ? (
                                  <span> · <span className="font-semibold text-slate-700">Alt:</span> {addr.alternatePhone}</span>
                                ) : (
                                  <span className="text-red-600 font-bold"> · missing alternate mobile *</span>
                                )}
                                {addr.whatsappNumber && (
                                  <span> · <span className="text-emerald-700 font-semibold">WA:</span> {addr.whatsappNumber}</span>
                                )}
                              </p>

                              {addr.email && (
                                <p className="text-slate-500 text-[10.5px]">
                                  Email: {addr.email}
                                </p>
                              )}

                              <p className="text-slate-800 font-medium leading-relaxed">
                                {addr.address || [addr.doorNo, addr.floorNo, addr.streetName, addr.areaLocality, addr.townCity].filter(Boolean).join(', ')}
                              </p>

                              <p className="text-slate-700 font-bold">
                                {addr.district || addr.city} — {addr.pincode} ({addr.state || 'Tamil Nadu'})
                              </p>

                              {addr.landmark && (
                                <p className="text-blue-800 text-[10.5px] font-semibold">
                                  📍 Landmark: {addr.landmark}
                                </p>
                              )}
                            </div>

                            {!checkAddressCompleteness(addr).isComplete && (
                              <div className="mt-2 p-2 bg-amber-50 border border-amber-300 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-start gap-1.5">
                                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                  <div>
                                    <p className="font-extrabold text-amber-950 text-[11px]">
                                      ⚠️ Incomplete Old Format Address
                                    </p>
                                    <p className="text-[10px] text-amber-800 leading-tight">
                                      Missing: <span className="font-bold">{checkAddressCompleteness(addr).missingFields.join(', ')}</span>. You must complete these to place book orders.
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => startEditAddress(addr)}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-black text-[10px] uppercase shrink-0 transition-colors shadow-2xs self-start sm:self-auto cursor-pointer"
                                >
                                  Complete Address ✏️
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditAddress(addr)}
                              className="text-[10px] font-extrabold text-blue-700 hover:underline"
                            >
                              Edit
                            </button>
                            {!addr.isDefault && (
                              <button
                                type="button"
                                onClick={() => void handleSetDefaultAddress(addr.id)}
                                className="text-[10px] font-extrabold text-blue-700 hover:underline"
                              >
                                Set default
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteAddress(addr.id)}
                              className="text-red-500 hover:text-red-700"
                              title="Delete address"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. Wishlist */}
            {activeTab === 'wishlist' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="font-heading font-black text-xl text-[#001B3A]">
                      My Wishlist ({wishlistedProducts.length})
                    </h2>
                    <p className="text-xs text-slate-500 font-medium">Your saved guide books</p>
                  </div>
                  <Link href="/wishlist" className="text-xs font-bold text-blue-600 hover:underline">
                    Open wishlist page →
                  </Link>
                </div>

                {wishlistedProducts.length === 0 ? (
                  <div className="py-12 text-center text-slate-400">
                    <Heart className="w-12 h-12 mx-auto mb-2 opacity-30 text-red-500" />
                    <p className="text-xs font-bold text-slate-600">Your wishlist is currently empty</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {wishlistedProducts.map((p) => (
                      <div key={p.id} className="border border-slate-200 rounded-xl p-3 flex gap-3 items-center">
                        <img
                          src={p.image}
                          alt={p.title}
                          className="w-14 h-14 object-contain bg-slate-50 border border-slate-200 rounded-lg p-1"
                        />
                        <div className="flex-1 min-w-0 text-xs">
                          <h4 className="font-bold text-[#001B3A] truncate">{p.title}</h4>
                          <div className="font-black text-slate-900 mt-0.5">₹{p.price}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Mobile logout — after content so tabs stay first */}
            <button
              type="button"
              onClick={() => {
                logoutUser();
                router.push('/');
              }}
              className="lg:hidden w-full bg-white border border-red-200 active:bg-red-50 text-red-600 font-bold text-xs p-4 rounded-2xl flex items-center justify-center gap-2 shadow-xs touch-manipulation min-h-12"
            >
              <LogOut className="w-4 h-4" />
              <span>LOGOUT</span>
            </button>

          </div>
        </div>
      </div>

      <Footer />
    </main>
  );
}
