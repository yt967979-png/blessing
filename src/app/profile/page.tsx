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
  Gift,
  AlertCircle,
  ShoppingBag,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Modals } from '@/components/modals/Modals';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loginUser, logoutUser, wishlist, products, showToast, setIsAuthOpen } = useStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'addresses' | 'wishlist'>('profile');

  // Dynamic user edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');

  // Dynamic User Addresses (saved in localStorage)
  const [addresses, setAddresses] = useState<any[]>([]);

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

  // Restore & Save Addresses in LocalStorage dynamically
  useEffect(() => {
    const saved = localStorage.getItem('bpg_user_addresses');
    if (saved) {
      try {
        setAddresses(JSON.parse(saved));
      } catch (e) {}
    }
  }, [user]);

  // Fetch live orders from backend database
  useEffect(() => {
    fetch('http://localhost:5000/api/orders')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setLiveOrders(data);
        }
      })
      .catch(() => {});
  }, []);

  const saveAddressesToStorage = (updatedList: any[]) => {
    setAddresses(updatedList);
    localStorage.setItem('bpg_user_addresses', JSON.stringify(updatedList));
  };

  // Save updated user profile info dynamically
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const updatedUser = {
      ...user,
      name,
      email,
      phone,
    };

    loginUser(updatedUser);
    setIsEditing(false);
    showToast('✓ Profile details updated successfully!');
  };

  // Dynamic Add Address
  const [showAddAddrForm, setShowAddAddrForm] = useState(false);
  const [newAddrType, setNewAddrType] = useState('HOME');
  const [newAddrName, setNewAddrName] = useState('');
  const [newAddrPhone, setNewAddrPhone] = useState('');
  const [newAddrText, setNewAddrText] = useState('');
  const [newAddrCity, setNewAddrCity] = useState('');
  const [newAddrPincode, setNewAddrPincode] = useState('');

  const handleAddAddress = (e: React.FormEvent) => {
    e.preventDefault();
    const created = {
      id: Date.now(),
      type: newAddrType,
      name: newAddrName || user?.name || 'Customer',
      phone: newAddrPhone || user?.phone || '',
      address: newAddrText,
      city: newAddrCity || 'Chennai',
      pincode: newAddrPincode || '600012',
    };
    const updated = [...addresses, created];
    saveAddressesToStorage(updated);
    setShowAddAddrForm(false);
    setNewAddrText('');
    showToast('✓ Delivery address added!');
  };

  const handleDeleteAddress = (id: number) => {
    const updated = addresses.filter((a) => a.id !== id);
    saveAddressesToStorage(updated);
    showToast('🗑️ Address deleted');
  };

  const wishlistedProducts = products.filter((p) => wishlist.includes(p.id));

  // If user is not logged in, prompt sign in box
  if (!user) {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col">
        <AnnouncementBar />
        <Header />
        <NavBar />
        <div className="max-w-md mx-auto my-16 p-8 bg-white border border-slate-200 rounded-3xl shadow-xl text-center space-y-4">
          <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-200">
            <User className="w-8 h-8" />
          </div>
          <h2 className="font-heading font-black text-xl text-[#001B3A]">Please Sign In to Access Profile</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Log in to manage your profile settings, view active orders, and access saved addresses.
          </p>
          <button
            onClick={() => setIsAuthOpen(true)}
            className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-md transition-all"
          >
            LOGIN / REGISTER NOW
          </button>
        </div>
        <Footer />
        <Modals />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <AnnouncementBar />
      <Header />
      <NavBar />

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

      <div className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Dynamic Account Sidebar Navigation */}
          <div className="lg:col-span-4 space-y-4">
            {/* Dynamic User Header Box */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#001B3A] to-[#003B73] text-amber-400 font-extrabold text-2xl flex items-center justify-center shadow-md uppercase">
                {user.name[0]}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Hello,
                </span>
                <h3 className="font-heading font-black text-lg text-[#001B3A] truncate">
                  {user.name}
                </h3>
                <span className="text-xs text-blue-600 font-semibold truncate block">
                  {user.email}
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="bg-white border border-slate-200 rounded-2xl p-2 shadow-xs text-xs font-bold divide-y divide-slate-100">
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center justify-between transition-colors ${
                  activeTab === 'profile'
                    ? 'bg-blue-50 text-blue-700 font-black'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-blue-600" />
                  <span>Personal Info & Security</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
                onClick={() => setActiveTab('orders')}
                className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center justify-between transition-colors ${
                  activeTab === 'orders'
                    ? 'bg-blue-50 text-blue-700 font-black'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Package className="w-4 h-4 text-amber-500" />
                  <span>My Orders & Live Tracking ({liveOrders.length})</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>

              <button
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
                onClick={() => setActiveTab('wishlist')}
                className={`w-full text-left px-4 py-3.5 rounded-xl flex items-center justify-between transition-colors ${
                  activeTab === 'wishlist'
                    ? 'bg-blue-50 text-blue-700 font-black'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Heart className="w-4 h-4 text-red-500" />
                  <span>My Wishlist ({wishlist.length})</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            {/* Logout Card */}
            <button
              onClick={() => {
                logoutUser();
                router.push('/');
              }}
              className="w-full bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs p-4 rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>LOGOUT FROM ACCOUNT</span>
            </button>
          </div>

          {/* Right Main Dynamic Content Panel */}
          <div className="lg:col-span-8">
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
                        Mobile Number (WhatsApp)
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
                      My Orders & Live Tracking
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
                  <div className="py-12 text-center text-slate-400">
                    <Package className="w-12 h-12 mx-auto mb-2 opacity-30 text-amber-500" />
                    <p className="text-xs font-bold text-slate-600">No active orders placed yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {liveOrders.map((o) => (
                      <div
                        key={o.orderId}
                        className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition-all space-y-4"
                      >
                        <div className="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-slate-100 text-xs font-bold text-slate-700">
                          <div>
                            <span>Order ID: </span>
                            <span className="text-amber-600 font-extrabold">{o.orderId}</span>
                          </div>
                          <div className="text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            <Truck className="w-3.5 h-3.5" />
                            <span>{o.courierStatus || 'Shipped via ST Courier Express'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="flex-1 text-xs">
                            <h4 className="font-heading font-extrabold text-slate-900">
                              {o.items?.[0]?.title || 'Guide Book Package'}
                            </h4>
                            <p className="text-slate-500 mt-0.5">
                              Deliver to: {o.customerName} ({o.city})
                            </p>
                            <div className="font-black text-sm text-[#001B3A] mt-1">
                              ₹{o.totalAmount} Total
                            </div>
                          </div>
                          <Link
                            href="/orders"
                            className="bg-[#001B3A] hover:bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors"
                          >
                            TRACK ORDER
                          </Link>
                        </div>
                      </div>
                    ))}
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
                      Save your addresses for fast 1-click checkout
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddAddrForm(!showAddAddrForm)}
                    className="bg-blue-600 hover:bg-[#001B3A] text-white font-extrabold text-xs px-4 py-2 rounded-xl flex items-center gap-1 shadow-xs transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{showAddAddrForm ? 'CANCEL' : 'ADD ADDRESS'}</span>
                  </button>
                </div>

                {showAddAddrForm && (
                  <form
                    onSubmit={handleAddAddress}
                    className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3 text-xs"
                  >
                    <div className="flex gap-3">
                      {['HOME', 'WORK', 'OTHER'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setNewAddrType(type)}
                          className={`px-3 py-1.5 rounded-lg font-bold border transition-colors ${
                            newAddrType === type
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="Receiver Name"
                        value={newAddrName}
                        onChange={(e) => setNewAddrName(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none"
                      />
                      <input
                        type="tel"
                        placeholder="Phone Number"
                        value={newAddrPhone}
                        onChange={(e) => setNewAddrPhone(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none"
                      />
                    </div>

                    <input
                      type="text"
                      required
                      placeholder="Door No, Street Address & Landmark"
                      value={newAddrText}
                      onChange={(e) => setNewAddrText(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none"
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        placeholder="City (e.g. Chennai)"
                        value={newAddrCity}
                        onChange={(e) => setNewAddrCity(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Pincode (e.g. 600012)"
                        value={newAddrPincode}
                        onChange={(e) => setNewAddrPincode(e.target.value)}
                        className="px-3 py-2 bg-white border border-slate-300 rounded-xl outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="bg-emerald-600 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl uppercase tracking-wider"
                    >
                      SAVE ADDRESS
                    </button>
                  </form>
                )}

                {addresses.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl p-6">
                    <MapPin className="w-12 h-12 mx-auto mb-2 opacity-30 text-emerald-600" />
                    <p className="text-xs font-bold text-slate-700">No delivery addresses saved yet</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 mb-4">Click + ADD ADDRESS to save your shipping address for fast 1-click checkout.</p>
                    <button
                      onClick={() => setShowAddAddrForm(true)}
                      className="bg-blue-600 hover:bg-[#001B3A] text-white font-extrabold text-xs px-5 py-2.5 rounded-xl uppercase tracking-wider shadow-sm transition-colors"
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
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">
                              {addr.type}
                            </span>
                            <span className="font-extrabold text-slate-900">{addr.name}</span>
                            <span className="text-slate-500">• {addr.phone}</span>
                          </div>

                          <button
                            onClick={() => handleDeleteAddress(addr.id)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-slate-700 leading-relaxed font-medium">
                          {addr.address}, {addr.city} — {addr.pincode}
                        </p>
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

          </div>
        </div>
      </div>

      <Footer />
      <CartDrawer />
      <Modals />
    </main>
  );
}
