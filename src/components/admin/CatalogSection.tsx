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
  Eye,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Tag,
  ShieldCheck,
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

const DEFAULT_SUBJECTS = [
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

  // New publication modal states
  const [newTitle, setNewTitle] = useState('');
  const [newCls, setNewCls] = useState('10th');
  const [selectedSubjectOption, setSelectedSubjectOption] = useState('Mathematics');
  const [customSubjectText, setCustomSubjectText] = useState('');
  const [newMrp, setNewMrp] = useState<string>('350');
  const [newPrice, setNewPrice] = useState<string>('280'); // Kept empty or explicit string
  const [newStock, setNewStock] = useState<string>('50');
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(5);
  const [newBadge, setNewBadge] = useState('Popular');
  const [newImage, setNewImage] = useState('');
  const [hsnCode, setHsnCode] = useState('4901');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLivePreview, setShowLivePreview] = useState(true);

  const [imageUploading, setImageUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishStatus, setPublishStatus] = useState<'published' | 'draft'>('published');

  const classesList = ['all', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

  // Dynamically merge subjects from existing catalog with default subjects
  const availableSubjects = useMemo(() => {
    const set = new Set(DEFAULT_SUBJECTS);
    products.forEach((p) => {
      if (p.subject && p.subject.trim()) set.add(p.subject.trim());
    });
    return Array.from(set);
  }, [products]);

  const resolvedSubject = useMemo(() => {
    if (selectedSubjectOption === '__custom__') {
      return customSubjectText.trim() || 'General';
    }
    return selectedSubjectOption;
  }, [selectedSubjectOption, customSubjectText]);

  // Numerical pricing calculations
  const numMrp = Number(newMrp) || 0;
  const numPrice = Number(newPrice) || 0;

  const priceError = useMemo(() => {
    if (!newMrp || numMrp <= 0) return 'Printed MRP is required (must be > ₹0).';
    if (!newPrice || numPrice <= 0) return 'Offer price is required. Click "Sell at MRP" if no discount.';
    if (numPrice > numMrp) return `Offer price (₹${numPrice}) cannot exceed Printed MRP (₹${numMrp}).`;
    return null;
  }, [newMrp, newPrice, numMrp, numPrice]);

  const discountPercent = useMemo(() => {
    if (numPrice > 0 && numPrice < numMrp && numMrp > 0) {
      return Math.round(((numMrp - numPrice) / numMrp) * 100);
    }
    return 0;
  }, [numPrice, numMrp]);

  const isSuspiciousDiscount = discountPercent >= 80;

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

  const handleSubmit = async (targetStatus: 'published' | 'draft') => {
    if (!newTitle.trim()) {
      onShowToast('Please enter a book title');
      return;
    }
    if (priceError) {
      onShowToast(`⚠️ ${priceError}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: newTitle.trim(),
        cls: newCls,
        subject: resolvedSubject,
        price: numPrice,
        mrp: numMrp,
        stock: Math.max(0, Number(newStock) || 0),
        status: targetStatus,
        badge: newBadge.trim(),
        description: `Complete ${newCls} Standard ${resolvedSubject} guide covering Tamil Nadu Samacheer Kalvi syllabus with question banks and answers.`,
        image: newImage.trim() || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
      };

      const creator = onAddNewProduct || onCreateProduct;
      if (creator) {
        await creator(payload);
      }
      onShowToast(
        targetStatus === 'published'
          ? `🎉 "${newTitle}" published live to bookstore!`
          : `📝 "${newTitle}" saved as Draft`
      );
      setShowAddModal(false);

      // Reset form
      setNewTitle('');
      setSelectedSubjectOption('Mathematics');
      setCustomSubjectText('');
      setNewMrp('350');
      setNewPrice('280');
      setNewStock('50');
      setNewImage('');
    } catch {
      onShowToast('❌ Failed to save publication');
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

      {/* ─── ADD NEW PUBLICATION MODAL (Redesigned with Price Safety & Live Preview) ─── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 animate-scale-up max-h-[92vh] overflow-y-auto custom-scrollbar">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold tracking-widest text-blue-600 uppercase">
                  Bookstore Inventory
                </span>
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-[#2874f0]" />
                  <span>Publish New Guide to Catalog</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSubmit(publishStatus);
              }}
              className="space-y-5 text-xs"
            >
              {/* SECTION 1: BOOK ESSENTIALS */}
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-200">
                <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-[#2874f0]" />
                  <span>1. Book Essentials</span>
                </div>

                {/* Title Input */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Book Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 10th Standard Mathematics Guide (Tamil & English Medium)"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] text-slate-900 text-xs font-medium shadow-2xs"
                  />
                </div>

                {/* Standard & Subject Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Class Standard *
                    </label>
                    <select
                      value={newCls}
                      onChange={(e) => setNewCls(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] text-slate-900 cursor-pointer font-semibold shadow-2xs"
                    >
                      {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => (
                        <option key={c} value={c}>
                          {c} Standard
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Subject (Dropdown Menu) *
                    </label>
                    <select
                      value={selectedSubjectOption}
                      onChange={(e) => setSelectedSubjectOption(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] text-slate-900 cursor-pointer font-semibold shadow-2xs"
                    >
                      {availableSubjects.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                      <option value="__custom__">+ Add Custom Subject...</option>
                    </select>
                  </div>
                </div>

                {/* Custom Subject Input */}
                {selectedSubjectOption === '__custom__' && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Custom Subject Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Environmental Science / Hindi"
                      value={customSubjectText}
                      onChange={(e) => setCustomSubjectText(e.target.value)}
                      className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] text-slate-900 shadow-2xs"
                    />
                  </div>
                )}
              </div>

              {/* SECTION 2: PRICING & INVENTORY (Price Safety First) */}
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-200">
                <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-600" />
                    <span>2. Pricing &amp; Stock Inventory</span>
                  </div>
                  {numMrp > 0 && (
                    <button
                      type="button"
                      onClick={() => setNewPrice(String(numMrp))}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer"
                    >
                      Sell at Full MRP (₹{numMrp})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Printed MRP */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Printed MRP (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      placeholder="e.g. 350"
                      value={newMrp}
                      onChange={(e) => setNewMrp(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] text-slate-900 font-bold shadow-2xs"
                    />
                  </div>

                  {/* Offer / Selling Price (Protected against silent 0) */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Selling / Offer Price (₹) *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      placeholder="e.g. 280"
                      value={newPrice}
                      onChange={(e) => setNewPrice(e.target.value)}
                      className={`w-full px-3.5 py-2.5 bg-white border rounded-xl outline-none font-bold shadow-2xs ${
                        priceError
                          ? 'border-red-400 focus:border-red-600 text-red-700'
                          : 'border-slate-200 focus:border-[#2874f0] text-slate-900'
                      }`}
                    />
                  </div>

                  {/* Initial Copies */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Initial Copies in Rack *
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      value={newStock}
                      onChange={(e) => setNewStock(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] text-slate-900 font-bold shadow-2xs"
                    />
                  </div>
                </div>

                {/* Inline Price Validation & Live Discount Banner */}
                {priceError ? (
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl text-[11px] text-red-700 font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                    <span>{priceError}</span>
                  </div>
                ) : isSuspiciousDiscount ? (
                  <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-[11px] text-amber-900 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>⚠️ Unusually deep discount: {discountPercent}% OFF (Selling for ₹{numPrice} on ₹{numMrp} MRP). Please verify.</span>
                  </div>
                ) : (
                  <div className="p-2.5 bg-white rounded-xl border border-slate-200 text-[11px] flex items-center justify-between">
                    <span className="text-slate-600 font-medium">Customer Storefront Price:</span>
                    {discountPercent > 0 ? (
                      <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                        ₹{numPrice} • {discountPercent}% OFF (Save ₹{numMrp - numPrice})
                      </span>
                    ) : (
                      <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                        ₹{numMrp} (Full MRP — No Discount)
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* SECTION 3: BOOK COVER IMAGE UPLOAD */}
              <div className="space-y-3 bg-slate-50/50 p-4 rounded-2xl border border-slate-200">
                <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#2874f0]" />
                  <span>3. Book Cover Photo (Device Gallery Upload)</span>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleDeviceImageUpload}
                  className="hidden"
                />

                {newImage ? (
                  <div className="flex items-center gap-4 p-3 bg-white border border-blue-200 rounded-2xl shadow-2xs">
                    <img
                      src={newImage}
                      alt="Cover Preview"
                      className="w-16 h-20 object-contain bg-slate-50 rounded-xl border border-slate-200 p-1 shadow-xs"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Cover Photo Ready</span>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate max-w-[240px]">{newImage}</p>
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
                    className="border-2 border-dashed border-slate-300 hover:border-[#2874f0] bg-white hover:bg-blue-50/20 rounded-2xl p-6 text-center cursor-pointer transition-all space-y-2 group"
                  >
                    {imageUploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <RefreshCw className="w-6 h-6 text-[#2874f0] animate-spin" />
                        <span className="font-bold text-slate-700">Uploading cover image...</span>
                      </div>
                    ) : (
                      <>
                        <div className="w-10 h-10 rounded-full bg-blue-50 text-[#2874f0] flex items-center justify-center mx-auto group-hover:scale-110 transition-transform border border-blue-100">
                          <Upload className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="font-bold text-slate-800 text-xs block">
                            Tap to upload book cover photo
                          </span>
                          <span className="text-[11px] text-slate-400">
                            PNG, JPG, WebP up to 10MB (Free 25GB Storage)
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* LIVE STOREFRONT PREVIEW CARD (Visual sanity check before publish) */}
              <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[11px] text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>Live Storefront Card Preview</span>
                  </span>
                  <span className="text-[10px] text-slate-400">How students see this book</span>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="w-14 h-18 bg-white border border-slate-200 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                    {newImage ? (
                      <img src={newImage} alt="Preview" className="w-full h-full object-contain p-1" />
                    ) : (
                      <BookOpen className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="bg-blue-100 text-[#2874f0] text-[9px] font-bold px-2 py-0.5 rounded">
                        {newCls} Standard
                      </span>
                      <span className="text-slate-400 text-[10px]">★ 5.0 (New)</span>
                    </div>
                    <p className="font-bold text-xs text-slate-900 truncate">
                      {newTitle || 'Guide Book Title'}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 font-mono">
                        ₹{numPrice > 0 ? numPrice : (numMrp || 0)}
                      </span>
                      {discountPercent > 0 && (
                        <>
                          <span className="line-through text-slate-400 text-xs">₹{numMrp}</span>
                          <span className="text-[10px] font-bold text-emerald-600">{discountPercent}% OFF</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 4: ADVANCED COMPLIANCE & SEO (Collapsible) */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="w-full px-4 py-3 flex items-center justify-between text-slate-700 hover:bg-slate-100 text-xs font-bold cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-slate-500" />
                    <span>Advanced &amp; Compliance Details (HSN, Low Stock Alert, SEO)</span>
                  </div>
                  {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showAdvanced && (
                  <div className="p-4 pt-1 space-y-3 bg-white border-t border-slate-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          GST HSN Code
                        </label>
                        <input
                          type="text"
                          value={hsnCode}
                          onChange={(e) => setHsnCode(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono font-bold text-slate-700"
                        />
                        <span className="text-[10px] text-slate-400 block mt-0.5">HSN 4901 (0% GST Exempt Books)</span>
                      </div>

                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Low Stock Alert Threshold
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={lowStockThreshold}
                          onChange={(e) => setLowStockThreshold(Number(e.target.value) || 5)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-700"
                        />
                        <span className="text-[10px] text-slate-400 block mt-0.5">Triggers dashboard alert below {lowStockThreshold} copies</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* MODAL FOOTER: Draft vs Publish Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2.5 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isSubmitting || imageUploading || !!priceError}
                    onClick={() => handleSubmit('draft')}
                    className="px-4 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Save as Draft
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting || imageUploading || !!priceError}
                    onClick={() => handleSubmit('published')}
                    className="px-6 py-2.5 rounded-xl font-bold text-white bg-[#2874f0] hover:bg-blue-700 transition-colors cursor-pointer shadow-md disabled:opacity-50"
                  >
                    {isSubmitting ? 'Publishing…' : 'Publish Publication'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogSection;
