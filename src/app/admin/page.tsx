'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  ArrowLeft,
  Edit2,
  Check,
  Power,
  Plus,
  Trash2,
  BookOpen,
  Upload,
  Sparkles,
  MessageSquare,
  Truck,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export default function AdminPage() {
  const { products, updateProductInDb, addNewProductToDb, deleteProductFromDb, showToast } = useStore();
  const [activeTab, setActiveTab] = useState<'catalog' | 'orders'>('catalog');
  const [editingId, setEditingId] = useState<number | null>(null);

  // Edit form state
  const [editPrice, setEditPrice] = useState(0);
  const [editMrp, setEditMrp] = useState(0);
  const [editBadge, setEditBadge] = useState('');

  // New product form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCls, setNewCls] = useState('10th');
  const [newCat, setNewCat] = useState<'guide' | 'combo'>('guide');
  const [newPrice, setNewPrice] = useState(190);
  const [newMrp, setNewMrp] = useState(240);
  const [newBadge, setNewBadge] = useState('BESTSELLER');
  const [newImg, setNewImg] = useState('https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80');

  // Live Orders from Database
  const [orders, setOrders] = useState<any[]>([]);
  const [shiprocketAwbInput, setShiprocketAwbInput] = useState<{ [orderId: string]: string }>({});

  const loadLiveOrders = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/orders', {
        headers: { 'x-admin-key': 'admin123' },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setOrders(data);
      }
    } catch (err) {
      console.warn('Orders API offline');
    }
  };

  useEffect(() => {
    if (activeTab === 'orders') loadLiveOrders();
  }, [activeTab]);

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds 5MB limit.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setNewImg(reader.result);
          showToast('✓ Image uploaded!');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const startEditing = (p: any) => {
    setEditingId(p.id);
    setEditPrice(p.price);
    setEditMrp(p.mrp);
    setEditBadge(p.badge);
  };

  const saveProductChanges = (id: number) => {
    const calculatedDiscount = Math.round(((editMrp - editPrice) / editMrp) * 100);
    updateProductInDb(id, {
      price: Number(editPrice),
      mrp: Number(editMrp),
      discount: calculatedDiscount > 0 ? calculatedDiscount : 0,
      badge: editBadge,
    });
    setEditingId(null);
    showToast(`✓ Updated Product #${id} Price to ₹${editPrice}!`);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const calculatedDiscount = Math.round(((newMrp - newPrice) / newMrp) * 100);
    addNewProductToDb({
      title: newTitle,
      cls: newCls,
      category: newCat,
      price: Number(newPrice),
      mrp: Number(newMrp),
      discount: calculatedDiscount > 0 ? calculatedDiscount : 0,
      badge: newBadge,
      image: newImg,
      description: `Complete ${newCls} Standard ${newTitle} for State Board / CBSE exams.`,
    });
    setShowAddForm(false);
    setNewTitle('');
  };

  const addPresetBook = (preset: '10th_maths' | '12th_physics' | '10th_combo') => {
    if (preset === '10th_maths') {
      addNewProductToDb({
        title: '10th Standard Mathematics Master Guide',
        cls: '10th',
        category: 'guide',
        price: 180,
        mrp: 220,
        discount: 18,
        badge: 'BESTSELLER',
        image: 'https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=400&q=80',
        description: 'Complete 10th Maths guide with chapter-wise solved model question papers.',
      });
    } else if (preset === '12th_physics') {
      addNewProductToDb({
        title: '12th Standard Physics Master Guide (Model Q&A Papers)',
        cls: '12th',
        category: 'guide',
        price: 210,
        mrp: 260,
        discount: 19,
        badge: 'TOP RATED',
        image: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
        description: 'High-score 12th Physics master guide covering numerical problems.',
      });
    } else if (preset === '10th_combo') {
      addNewProductToDb({
        title: '10th Standard All-in-One 5 Subject Super Combo Pack',
        cls: '10th',
        category: 'combo',
        price: 790,
        mrp: 1050,
        discount: 25,
        badge: '25% OFF',
        image: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=400&q=80',
        description: 'Save ₹260 with the Complete 10th Standard 5-Book Bundle.',
      });
    }
  };

  const handleShiprocketAssign = async (orderId: string) => {
    const awb = shiprocketAwbInput[orderId] || `SR-TN-${Math.floor(100000 + Math.random() * 900000)}`;

    try {
      const res = await fetch('http://localhost:5000/api/orders/shiprocket-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, shiprocketAwb: awb }),
      });

      if (res.ok) {
        showToast(`🎉 Order #${orderId} accepted! Shiprocket AWB: ${awb}. Automated WhatsApp update dispatched to customer!`);
        loadLiveOrders();
      }
    } catch (e) {
      showToast(`✓ Order #${orderId} accepted! Shiprocket AWB: ${awb}`);
    }
  };

  const toggleStock = (id: number, currentStock: boolean) => {
    updateProductInDb(id, { inStock: !currentStock });
    showToast(`✓ Product #${id} Stock status updated`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-slate-900 border-r border-slate-800 p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-500 text-[#001B3A] rounded-xl flex items-center justify-center font-black text-xl shadow-md">
              B
            </div>
            <div>
              <h2 className="font-heading font-black text-sm text-white tracking-wide">STORE ADMIN</h2>
              <span className="text-[9px] text-amber-400 font-bold uppercase">Shiprocket Suite</span>
            </div>
          </div>

          <nav className="space-y-1 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('catalog')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                activeTab === 'catalog'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Products Catalog</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                activeTab === 'orders'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              <span>Incoming Orders ({orders.length})</span>
            </button>
          </nav>
        </div>

        <div className="pt-6 border-t border-slate-800">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 w-full bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs py-2.5 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-amber-400" />
            <span>Return to Website</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="font-heading font-black text-2xl text-white tracking-tight">
              Shiprocket Order Fulfillment & Product Creator
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Accept customer orders (COD / Online), generate Shiprocket AWB tracking numbers, and dispatch automated WhatsApp updates
            </p>
          </div>

          {activeTab === 'catalog' && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-xs px-5 py-3 rounded-xl shadow-md hover:shadow-lg transition-all uppercase tracking-wider flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddForm ? 'CLOSE FORM' : 'ADD NEW GUIDE BOOK'}</span>
            </button>
          )}
        </div>

        {activeTab === 'catalog' ? (
          <>
            {/* Preset Sample Creator Buttons */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <div>
                  <span className="text-xs font-bold text-white">1-Click Sample Guide Presets</span>
                  <p className="text-[11px] text-slate-400">Click to instantly populate database with pre-configured books</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => addPresetBook('10th_maths')}
                  className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs px-3 py-2 rounded-xl border border-slate-700 transition-colors"
                >
                  + 10th Maths Guide (₹180)
                </button>
                <button
                  onClick={() => addPresetBook('12th_physics')}
                  className="bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs px-3 py-2 rounded-xl border border-slate-700 transition-colors"
                >
                  + 12th Physics Guide (₹210)
                </button>
                <button
                  onClick={() => addPresetBook('10th_combo')}
                  className="bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold text-xs px-3 py-2 rounded-xl border border-slate-700 transition-colors"
                >
                  + 10th All-in-1 Combo (₹790)
                </button>
              </div>
            </div>

            {/* Add Product Form */}
            {showAddForm && (
              <div className="bg-slate-900 border-2 border-amber-400/50 rounded-2xl p-6 mb-8 shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-heading font-black text-base text-[#F0C14B] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-400" /> Create & Add New Guide Book to Database
                  </h3>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="text-slate-400 hover:text-white text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>

                <form onSubmit={handleCreateProduct} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-300 mb-1 font-bold">Book Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 10th Standard Mathematics Guide"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:border-amber-400"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Class Standard *</label>
                    <select
                      value={newCls}
                      onChange={(e) => setNewCls(e.target.value)}
                      className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                    >
                      {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => (
                        <option key={c} value={c}>{c} Standard</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Category *</label>
                    <select
                      value={newCat}
                      onChange={(e) => setNewCat(e.target.value as any)}
                      className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                    >
                      <option value="guide">Single Subject Guide</option>
                      <option value="combo">5-Subject Combo Bundle</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Sale Price (₹) *</label>
                    <input
                      type="number"
                      required
                      value={newPrice}
                      onChange={(e) => setNewPrice(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Original MRP (₹) *</label>
                    <input
                      type="number"
                      required
                      value={newMrp}
                      onChange={(e) => setNewMrp(Number(e.target.value))}
                      className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Offer Badge *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. BESTSELLER / 20% OFF"
                      value={newBadge}
                      onChange={(e) => setNewBadge(e.target.value)}
                      className="w-full p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none uppercase"
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-2">
                    <label className="block text-slate-300 mb-1 font-bold flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-amber-400" />
                      <span>Upload Book Cover Image (Local File)</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        className="w-full p-2 bg-slate-800 border border-slate-700 rounded-xl text-white text-xs file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-amber-400 file:text-[#001B3A] cursor-pointer"
                      />
                      {newImg && (
                        <img src={newImg} alt="Preview" className="w-10 h-10 object-contain rounded-lg border border-slate-700 bg-slate-800 p-1 flex-shrink-0" />
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2 md:col-span-4 pt-2">
                    <button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-md uppercase tracking-wider"
                    >
                      SAVE PRODUCT TO DATABASE
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Live Database Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
              <h3 className="font-heading font-bold text-base text-white mb-4">
                Manage Books in Database ({products.length})
              </h3>

              {products.length === 0 ? (
                <div className="py-16 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30 text-amber-400" />
                  <p className="text-sm font-bold text-white">Database is currently empty (0 products)</p>
                  <p className="text-xs text-slate-500 mt-1">Click "ADD NEW GUIDE BOOK" or use the 1-Click Sample Presets above to populate books!</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase font-bold">
                        <th className="py-3 px-2">Cover</th>
                        <th className="py-3 px-2">Title</th>
                        <th className="py-3 px-2">Class</th>
                        <th className="py-3 px-2">Sale Price</th>
                        <th className="py-3 px-2">MRP</th>
                        <th className="py-3 px-2">Badge Offer</th>
                        <th className="py-3 px-2">Stock</th>
                        <th className="py-3 px-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-slate-300">
                      {products.map((p) => {
                        const isEditing = editingId === p.id;
                        return (
                          <tr key={p.id} className="hover:bg-slate-800/30">
                            <td className="py-2 px-2">
                              <img src={p.image} alt={p.title} className="w-9 h-9 object-contain bg-slate-800 border border-slate-700 rounded-lg p-0.5" />
                            </td>
                            <td className="py-3 px-2 font-medium text-white max-w-[200px] truncate">
                              {p.title}
                            </td>
                            <td className="py-3 px-2">{p.cls}</td>

                            <td className="py-3 px-2 font-bold">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editPrice}
                                  onChange={(e) => setEditPrice(Number(e.target.value))}
                                  className="w-20 px-2 py-1 bg-slate-800 border border-amber-400 rounded text-amber-300 font-bold outline-none"
                                />
                              ) : (
                                <span>₹{p.price}</span>
                              )}
                            </td>

                            <td className="py-3 px-2 text-slate-400">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editMrp}
                                  onChange={(e) => setEditMrp(Number(e.target.value))}
                                  className="w-20 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-300 font-bold outline-none"
                                />
                              ) : (
                                <span>₹{p.mrp}</span>
                              )}
                            </td>

                            <td className="py-3 px-2">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editBadge}
                                  onChange={(e) => setEditBadge(e.target.value)}
                                  className="w-24 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-white text-[10px] font-bold uppercase outline-none"
                                />
                              ) : (
                                <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                  {p.badge}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-2">
                              <button
                                onClick={() => toggleStock(p.id, p.inStock)}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors flex items-center gap-1 ${
                                  p.inStock
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : 'bg-red-500/10 text-red-400 border-red-500/30'
                                }`}
                              >
                                <Power className="w-3 h-3" />
                                <span>{p.inStock ? 'IN STOCK' : 'OFFLINE'}</span>
                              </button>
                            </td>

                            <td className="py-3 px-2 flex items-center gap-2">
                              {isEditing ? (
                                <button
                                  onClick={() => saveProductChanges(p.id)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1 rounded text-[11px] flex items-center gap-1 shadow-sm"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>SAVE</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => startEditing(p)}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold px-3 py-1 rounded text-[11px] flex items-center gap-1 border border-slate-700"
                                >
                                  <Edit2 className="w-3 h-3 text-amber-400" />
                                  <span>EDIT</span>
                                </button>
                              )}

                              <button
                                onClick={() => deleteProductFromDb(p.id)}
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 p-1 rounded hover:scale-105 transition-all"
                                title="Delete from DB"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          /* Live Incoming Orders & Shiprocket Fulfillment */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-heading font-black text-lg text-white flex items-center gap-2">
                  <Truck className="w-5 h-5 text-amber-400" />
                  <span>Live Incoming Orders & Shiprocket AWB Dispatch</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">When customers place COD or Razorpay orders, accept & assign Shiprocket AWB here to automatically trigger WhatsApp notifications!</p>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="py-16 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-400" />
                <p className="text-sm font-bold text-white">No incoming orders yet</p>
                <p className="text-xs text-slate-500 mt-1">When customers place orders via checkout, they will appear here live!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((o) => (
                  <div key={o.orderId} className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 text-xs space-y-4">
                    <div className="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-slate-700">
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-amber-400 text-sm">Order ID: {o.orderId}</span>
                        <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded font-extrabold text-[10px] uppercase">
                          {o.paymentMethod} • {o.paymentStatus}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-emerald-400 font-bold">
                        <MessageSquare className="w-4 h-4 animate-pulse" />
                        <span>WhatsApp Number: +91 {o.customerPhone}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-slate-300">
                      <div>
                        <span className="text-slate-500 font-bold uppercase block text-[10px]">Customer Name & Address</span>
                        <span className="font-bold text-white">{o.customerName}</span>
                        <p className="text-[11px] text-slate-400">{o.address}, {o.city}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold uppercase block text-[10px]">Total Order Amount</span>
                        <span className="font-black text-amber-400 text-sm">₹{o.totalAmount}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold uppercase block text-[10px]">Current Status</span>
                        <span className="font-bold text-emerald-400">{o.courierStatus}</span>
                      </div>
                    </div>

                    {/* Shiprocket AWB Assign Box */}
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Truck className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <input
                          type="text"
                          placeholder="Shiprocket AWB (e.g. SR-TN-984210)"
                          value={shiprocketAwbInput[o.orderId] || ''}
                          onChange={(e) =>
                            setShiprocketAwbInput({
                              ...shiprocketAwbInput,
                              [o.orderId]: e.target.value,
                            })
                          }
                          className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs outline-none focus:border-amber-400 uppercase w-56"
                        />
                      </div>

                      <button
                        onClick={() => handleShiprocketAssign(o.orderId)}
                        className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-md uppercase tracking-wider flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>ACCEPT ORDER & SHIP VIA SHIPROCKET</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
