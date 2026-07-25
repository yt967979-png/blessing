'use client';

import React, { useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { Header } from '@/components/layout/Header';
import { NavBar } from '@/components/layout/NavBar';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Modals } from '@/components/modals/Modals';

export default function ProfilePage() {
  const { user, logoutUser, wishlist, products, showToast } = useStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'addresses' | 'wishlist'>('profile');

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || 'M. Karthik');
  const [email, setEmail] = useState(user?.email || 'student@gmail.com');
  const [phone, setPhone] = useState(user?.phone || '9840418228');

  // Saved Addresses
  const [addresses, setAddresses] = useState([
    {
      id: 1,
      type: 'HOME',
      name: 'M. Karthik',
      phone: '9840418228',
      address: 'No. 45, Medavakkam High Rd, Agaramthen',
      city: 'Chennai',
      pincode: '600012',
      isDefault: true,
    },
  ]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditing(false);
    showToast('✓ Profile information updated successfully!');
  };

  const wishlistedProducts = products.filter((p) => wishlist.includes(p.id));

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <AnnouncementBar />
      <Header />
      <NavBar />

      {/* Breadcrumb */}
      <div className="bg-white border-b border-slate-200 py-3">
        <div className="max-w-7xl mx-auto px-4 text-xs font-semibold text-slate-500 flex items-center gap-2">
          <Link href="/" className="hover:text-blue-600">Home</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-slate-900">My Account</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 flex-1 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Flipkart / Amazon Style Sidebar Navigation */}
          <div className="lg:col-span-4 space-y-4">
            {/* User Header Box */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#001B3A] to-[#003B73] text-amber-400 font-extrabold text-2xl flex items-center justify-center shadow-md">
                {(user?.name || 'K')[0]}
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hello,</span>
                <h3 className="font-heading font-black text-lg text-[#001B3A]">{user?.name || 'M. Karthik'}</h3>
                <span className="text-xs text-blue-600 font-semibold">{user?.email || 'student@gmail.com'}</span>
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
                  <span>Personal Information</span>
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
                  <span>My Orders & Tracking</span>
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
                  <span>Manage Delivery Addresses</span>
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
              onClick={logoutUser}
              className="w-full bg-white border border-red-200 hover:bg-red-50 text-red-600 font-bold text-xs p-4 rounded-2xl flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>LOGOUT FROM ACCOUNT</span>
            </button>
          </div>

          {/* Right Main Content Panel */}
          <div className="lg:col-span-8">
            {activeTab === 'profile' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="font-heading font-black text-xl text-[#001B3A]">Personal Information</h2>
                    <p className="text-xs text-slate-500">Manage your name, mobile number, and email address</p>
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
                        disabled={!isEditing}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                          isEditing
                            ? 'border-blue-600 bg-white text-slate-900'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Mobile Number</label>
                      <input
                        type="tel"
                        disabled={!isEditing}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                          isEditing
                            ? 'border-blue-600 bg-white text-slate-900'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      disabled={!isEditing}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl border outline-none ${
                        isEditing
                          ? 'border-blue-600 bg-white text-slate-900'
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

            {activeTab === 'orders' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="font-heading font-black text-xl text-[#001B3A]">My Orders & Tracking</h2>
                    <p className="text-xs text-slate-500">Track current shipments and view order history</p>
                  </div>
                  <Link
                    href="/orders"
                    className="text-xs font-extrabold text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <span>Full Orders Page</span>
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>

                {/* Sample Order Card */}
                <div className="border border-slate-200 rounded-2xl p-5 hover:border-slate-300 transition-all space-y-4">
                  <div className="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-slate-100 text-xs font-bold text-slate-700">
                    <div>
                      <span>Order ID: </span>
                      <span className="text-amber-600 font-extrabold">BPG-1082</span>
                    </div>
                    <div className="text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      <Truck className="w-3.5 h-3.5" />
                      <span>In Transit — Out for Delivery</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <img
                      src="https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=400&q=80"
                      alt="Book"
                      className="w-16 h-16 object-contain bg-slate-50 border border-slate-200 rounded-xl p-1"
                    />
                    <div className="flex-1 text-xs">
                      <h4 className="font-heading font-extrabold text-slate-900">10th Standard Mathematics Guide</h4>
                      <p className="text-slate-500 mt-0.5">TN State Board • Express Delivery</p>
                      <div className="font-black text-sm text-[#001B3A] mt-1">₹370 Total</div>
                    </div>
                    <Link
                      href="/orders"
                      className="bg-[#001B3A] hover:bg-blue-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors"
                    >
                      TRACK ORDER
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'addresses' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="font-heading font-black text-xl text-[#001B3A]">Saved Delivery Addresses</h2>
                    <p className="text-xs text-slate-500">Manage addresses for fast 1-click checkout</p>
                  </div>
                </div>

                <div className="space-y-4">
                  {addresses.map((addr) => (
                    <div key={addr.id} className="border border-blue-200 bg-blue-50/40 rounded-2xl p-5 text-xs space-y-2 relative">
                      <div className="flex items-center gap-2">
                        <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase">
                          {addr.type}
                        </span>
                        <span className="font-extrabold text-slate-900">{addr.name}</span>
                        <span className="text-slate-500">• {addr.phone}</span>
                      </div>
                      <p className="text-slate-700 leading-relaxed font-medium">
                        {addr.address}, {addr.city} — {addr.pincode}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'wishlist' && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 shadow-xs">
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="font-heading font-black text-xl text-[#001B3A]">My Wishlist ({wishlistedProducts.length})</h2>
                    <p className="text-xs text-slate-500 font-medium">Your saved guide books for later</p>
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
                        <img src={p.image} alt={p.title} className="w-14 h-14 object-contain bg-slate-50 border border-slate-200 rounded-lg p-1" />
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
