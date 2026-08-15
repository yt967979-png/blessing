'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Upload,
  BookOpen,
  Filter,
  CheckCircle2,
  AlertCircle,
  ImageIcon,
  RefreshCw,
} from 'lucide-react';
import type { Product } from '@/context/StoreContext';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';

interface CatalogSectionProps {
  products: Product[];
  onUpdateProduct: (id: string | number, updates: any) => Promise<any> | void;
  onAddNewProduct?: (product: any) => Promise<any> | void;
  onCreateProduct?: (product: any) => Promise<any> | void;
  onDeleteProduct: (id: string | number) => Promise<any> | void;
  onShowToast: (msg: string) => void;
  authHeaders?: Record<string, string>;
}

const STANDARD_SUBJECTS = [
  'Mathematics',
  'Science',
  'Social Science',
  'Tamil',
  'English',
  'Physics',
  'Chemistry',
  'Biology',
  'Computer Science',
  'Commerce',
  'Accountancy',
  'Economics',
  'Business Mathematics',
  'History',
  'Geography',
  'All-in-One Full Set (Combo)',
  'Other / Custom Subject',
];

export const CatalogSection: React.FC<CatalogSectionProps> = ({
  products,
  onUpdateProduct,
  onAddNewProduct,
  onCreateProduct,
  onDeleteProduct,
  onShowToast,
}) => {
  const { user } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);

  // Quick edit states
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editMrp, setEditMrp] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);

  // New book form states
  const [newTitle, setNewTitle] = useState('');
  const [newCls, setNewCls] = useState('10th');
  const [selectedSubjectOption, setSelectedSubjectOption] = useState('Mathematics');
  const [customSubjectText, setCustomSubjectText] = useState('');
  const [newMrp, setNewMrp] = useState<number>(350);
  const [newPrice, setNewPrice] = useState<number>(0); // 0 = No discount (sells at MRP)
  const [newStock, setNewStock] = useState<number>(50);
  const [newBadge, setNewBadge] = useState('Popular');
  const [newImage, setNewImage] = useState('');
  const [imageUploading, setImageUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const classesList = ['all', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

  const resolvedSubject = useMemo(() => {
    if (selectedSubjectOption === 'Other / Custom Subject') {
      return customSubjectText.trim() || 'General';
    }
    return selectedSubjectOption;
  }, [selectedSubjectOption, customSubjectText]);

  const discountPercent = useMemo(() => {
    if (newPrice > 0 && newPrice < newMrp && newMrp > 0) {
      return Math.round(((newMrp - newPrice) / newMrp) * 100);
    }
    return 0;
  }, [newPrice, newMrp]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedClass !== 'all' && (p.cls || '').toLowerCase() !== selectedClass.toLowerCase()) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchTitle = (p.title || '').toLowerCase().includes(q);
        const matchSubj = (p.subject || '').toLowerCase().includes(q);
        const matchCls = (p.cls || '').toLowerCase().includes(q);
        if (!matchTitle && !matchSubj && !matchCls) return false;
      }
      return true;
    });
  }, [products, selectedClass, searchTerm]);

  const handleStartEdit = (p: Product) => {
    setEditingId(p.id);
    setEditPrice(p.price);
    setEditMrp(p.mrp || p.price);
    setEditStock(p.stock ?? 10);
  };

  const handleSaveEdit = async (id: string | number) => {
    try {
      await onUpdateProduct(id, {
        price: editPrice,
        mrp: editMrp,
        stock: editStock,
        inStock: editStock > 0,
      });
      onShowToast('✅ Publication details updated');
      setEditingId(null);
    } catch {
      onShowToast('❌ Update error');
    }
  };

  const handleToggleStockStatus = async (p: Product) => {
    const nextInStock = !p.inStock;
    const nextStock = nextInStock ? Math.max(p.stock || 0, 10) : 0;
    try {
      await onUpdateProduct(p.id, {
        inStock: nextInStock,
        stock: nextStock,
      });
      onShowToast(nextInStock ? `📦 ${p.title} marked IN STOCK` : `⚠️ ${p.title} marked OUT OF STOCK`);
    } catch {
      onShowToast('❌ Toggle failed');
    }
  };

  const handleDeviceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      onShowToast('❌ File too large. Max allowed is 10MB.');
      return;
    }

    setImageUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'blessing_power_guides');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: authHeaders(user),
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Image upload failed');
      }

      setNewImage(data.url);
      onShowToast('✅ Cover image uploaded successfully');
    } catch (err: any) {
      onShowToast(`❌ Upload failed: ${err.message}`);
    } finally {
      setImageUploading(false);
    }
  };

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      onShowToast('Please enter a book title');
      return;
    }

    const mrpVal = Number(newMrp) || 0;
    const offerVal = Number(newPrice) || 0;
    // If offer price is 0 or >= MRP, selling price is MRP (no discount)
    const finalSellingPrice = offerVal > 0 && offerVal < mrpVal ? offerVal : mrpVal;

    setIsSubmitting(true);
    try {
      const payload = {
        title: newTitle.trim(),
        cls: newCls,
        subject: resolvedSubject,
        price: finalSellingPrice,
        mrp: mrpVal,
        stock: Number(newStock),
        badge: newBadge.trim(),
        description: `Complete ${newCls} Standard ${resolvedSubject} guide covering Tamil Nadu Samacheer Kalvi syllabus with question banks and answers.`,
        image: newImage.trim() || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      };

      const creator = onAddNewProduct || onCreateProduct;
      if (creator) {
        await creator(payload);
      }
      onShowToast(`🎉 "${newTitle}" added to bookstore catalog!`);
      setShowAddModal(false);

      // Reset form
      setNewTitle('');
      setSelectedSubjectOption('Mathematics');
      setCustomSubjectText('');
      setNewMrp(350);
      setNewPrice(0);
      setNewStock(50);
      setNewImage('');
    } catch {
      onShowToast('❌ Failed to add publication');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter Bar & Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        {/* Class Standard Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-3 text-xs font-semibold">
          {classesList.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setSelectedClass(c)}
              className={`px-3.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                selectedClass === c
                  ? 'bg-[#2874f0] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span>{c === 'all' ? 'ALL STANDARDS' : `${c} Standard`}</span>
            </button>
          ))}
        </div>

        {/* Search & Add Book Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Guide Title, Standard, or Subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-[#2874f0] focus:bg-white text-slate-900"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2.5 bg-[#2874f0] hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Publication</span>
            </button>
          </div>
        </div>
      </div>

      {/* Publications Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Guide Book</th>
                <th className="p-4">Standard &amp; Subject</th>
                <th className="p-4">Offer Price / MRP</th>
                <th className="p-4">Inventory Status</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-slate-400">
                    <div className="max-w-xs mx-auto space-y-2">
                      <BookOpen className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="font-bold text-sm text-slate-800">No Publications Found</p>
                      <p className="text-xs text-slate-500">
                        Try adjusting your search keywords or choosing a different standard filter.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isEditing = editingId === p.id;
                  const disc =
                    p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
                  const isOOS = !p.inStock || (p.stock ?? 0) <= 0;
                  const isLow = (p.stock ?? 99) <= 5 && !isOOS;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Book Cover & Title */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.image}
                            alt={p.title}
                            className="w-11 h-11 object-contain bg-slate-50 border border-slate-200 rounded-lg p-0.5 shrink-0"
                          />
                          <div className="min-w-0 max-w-sm">
                            <span className="font-bold text-xs text-slate-900 block truncate">
                              {p.title}
                            </span>
                            {p.badge && (
                              <span className="inline-block text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md mt-0.5">
                                {p.badge}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Class & Subject */}
                      <td className="p-4">
                        <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md text-[11px] border border-slate-200">
                          {p.cls || 'General'}
                        </span>
                        {p.subject && (
                          <span className="text-xs text-slate-500 block mt-1">
                            {p.subject}
                          </span>
                        )}
                      </td>

                      {/* Price & MRP */}
                      <td className="p-4">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Offer ₹</span>
                              <input
                                type="number"
                                value={editPrice}
                                onChange={(e) => setEditPrice(Number(e.target.value))}
                                className="w-18 px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold outline-none focus:border-[#2874f0]"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">MRP ₹</span>
                              <input
                                type="number"
                                value={editMrp}
                                onChange={(e) => setEditMrp(Number(e.target.value))}
                                className="w-18 px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold outline-none focus:border-[#2874f0]"
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-slate-900">₹{p.price}</span>
                              {p.mrp > p.price && (
                                <span className="line-through text-xs text-slate-400">
                                  ₹{p.mrp}
                                </span>
                              )}
                            </div>
                            {disc > 0 && (
                              <span className="text-[10px] text-emerald-600 font-bold block">
                                {disc}% SAVINGS
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Stock Inventory */}
                      <td className="p-4">
                        {isEditing ? (
                          <div>
                            <span className="text-[10px] text-slate-400 block">Copies in Rack</span>
                            <input
                              type="number"
                              min={0}
                              value={editStock}
                              onChange={(e) => setEditStock(Math.max(0, Number(e.target.value) || 0))}
                              className="w-20 px-2 py-1 bg-slate-50 border border-blue-400 rounded-lg text-xs font-bold outline-none"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleStockStatus(p)}
                              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                                isOOS
                                  ? 'bg-red-50 text-red-600 border-red-200'
                                  : isLow
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                              title="Click to toggle in-stock / out-of-stock"
                            >
                              {isOOS ? 'OUT OF STOCK' : `${p.stock ?? '—'} IN STOCK`}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(p.id)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(p)}
                                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteProduct(p.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                title="Delete Publication"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add New Publication Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#2874f0]" />
                <span>Publish New Guide to Catalog</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBook} className="space-y-4 text-xs">
              {/* Book Title */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Book Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 10th Standard Mathematics Guide (Tamil & English Medium)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900"
                />
              </div>

              {/* Standard & Subject Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Class Standard *
                  </label>
                  <select
                    value={newCls}
                    onChange={(e) => setNewCls(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900 cursor-pointer font-semibold"
                  >
                    {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => (
                      <option key={c} value={c}>
                        {c} Standard
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Subject (Select from Menu) *
                  </label>
                  <select
                    value={selectedSubjectOption}
                    onChange={(e) => setSelectedSubjectOption(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900 cursor-pointer font-semibold"
                  >
                    {STANDARD_SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Custom Subject Input (Only if 'Other' selected) */}
              {selectedSubjectOption === 'Other / Custom Subject' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Enter Custom Subject Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Environmental Studies / Hindi"
                    value={customSubjectText}
                    onChange={(e) => setCustomSubjectText(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900"
                  />
                </div>
              )}

              {/* Pricing & Stock Fields */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Printed MRP (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newMrp}
                    onChange={(e) => setNewMrp(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Offer Price (₹) <span className="font-normal text-slate-400">(Optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0 = No discount"
                    value={newPrice === 0 ? '' : newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value) || 0)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Initial Copies *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newStock}
                    onChange={(e) => setNewStock(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900 font-bold"
                  />
                </div>
              </div>

              {/* Live Price Feedback Pill */}
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-medium text-slate-600 flex items-center justify-between">
                <span>Selling Price for Students:</span>
                {discountPercent > 0 ? (
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                    ₹{newPrice} ({discountPercent}% OFF on MRP ₹{newMrp})
                  </span>
                ) : (
                  <span className="font-bold text-slate-800 bg-slate-200 px-2.5 py-0.5 rounded-md">
                    ₹{newMrp} (Full MRP — No Discount)
                  </span>
                )}
              </div>

              {/* 1-Tap Device File Upload for Book Cover */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Cover Photo (Upload from Device / Gallery)
                </label>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleDeviceImageUpload}
                  className="hidden"
                />

                {newImage ? (
                  <div className="flex items-center gap-4 p-3 bg-blue-50/50 border border-blue-200 rounded-2xl">
                    <img
                      src={newImage}
                      alt="Cover Preview"
                      className="w-16 h-20 object-contain bg-white rounded-xl border border-slate-200 p-1 shadow-xs"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Cover Photo Ready</span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate max-w-[200px]">{newImage}</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-[#2874f0] font-bold hover:underline cursor-pointer block"
                      >
                        Change Photo
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewImage('')}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                      title="Remove image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-[#2874f0] bg-slate-50 hover:bg-blue-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2 group"
                  >
                    {imageUploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 text-[#2874f0] animate-spin" />
                        <span className="font-bold text-slate-700">Uploading cover image...</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-[#2874f0] flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 text-xs block">
                            Tap to upload book cover from device
                          </span>
                          <span className="text-[11px] text-slate-400">
                            PNG, JPG, WebP up to 10MB (Free 25GB CDN Storage)
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || imageUploading}
                  className="px-6 py-2.5 rounded-xl font-bold text-white bg-[#2874f0] hover:bg-blue-700 transition-colors cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSubmitting ? 'Publishing…' : 'Publish Publication'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogSection;
