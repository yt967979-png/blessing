'use client';

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Upload,
  Search,
  SlidersHorizontal,
  Tag,
  AlertTriangle,
  FileText,
  IndianRupee,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Product } from '@/lib/products';

interface CatalogSectionProps {
  products: Product[];
  onUpdateProduct: (id: string | number, updates: Partial<Product>) => Promise<any> | void;
  onAddNewProduct: (product: any) => Promise<any> | void;
  onDeleteProduct: (id: string | number) => Promise<any> | void;
  onShowToast: (msg: string) => void;
  authHeaders: Record<string, string>;
}

export const CatalogSection: React.FC<CatalogSectionProps> = ({
  products,
  onUpdateProduct,
  onAddNewProduct,
  onDeleteProduct,
  onShowToast,
  authHeaders,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);

  // Quick edit states
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editMrp, setEditMrp] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);

  // New book form states
  const [newTitle, setNewTitle] = useState('');
  const [newCls, setNewCls] = useState('10th');
  const [newSubject, setNewSubject] = useState('Mathematics');
  const [newPrice, setNewPrice] = useState<number>(280);
  const [newMrp, setNewMrp] = useState<number>(350);
  const [newStock, setNewStock] = useState<number>(50);
  const [newDescription, setNewDescription] = useState('');
  const [newBadge, setNewBadge] = useState('Popular');
  const [newImage, setNewImage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const classesList = ['all', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];

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

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      onShowToast('Please enter a book title');
      return;
    }
    setIsSubmitting(true);
    try {
      const slug = newTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      await onAddNewProduct({
        title: newTitle.trim(),
        subtitle: `${newCls} Standard ${newSubject} Examination Guide`,
        slug: slug || `book-${Date.now()}`,
        cls: newCls,
        category: 'guide',
        subject: newSubject,
        price: newPrice,
        mrp: newMrp,
        discount: newMrp > newPrice ? Math.round(((newMrp - newPrice) / newMrp) * 100) : 0,
        stock: newStock,
        inStock: newStock > 0,
        rating: 5.0,
        reviews: 0,
        badge: newBadge,
        badgeColor: 'bg-blue-600',
        image:
          newImage ||
          'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
        description: newDescription.trim(),
        features: ['Full Syllabus Coverage', 'Solved Question Papers', 'Model Test Series'],
      });

      onShowToast('✅ New guide published to catalog');
      setShowAddModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewImage('');
    } catch {
      onShowToast('❌ Publication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    onShowToast('⏳ Processing CSV file…');
    try {
      const csv = await file.text();
      const r = await fetch('/api/products/bulk', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ csv }),
      });
      const d = await r.json();
      if (!r.ok) {
        onShowToast(`❌ ${d.error || 'Import failed'}`);
        return;
      }
      onShowToast(`✅ Successfully imported ${d.imported || 0} book(s)`);
      window.location.reload();
    } catch {
      onShowToast('❌ CSV import network failure');
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Top Control Toolbar ────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#2874f0]" />
            <span>Book Catalog & Stock Inventory</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage school study materials, standard allocations, MRP/offer prices, and stock levels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* CSV Bulk Import Button */}
          <label className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-xs">
            <Upload className="w-4 h-4 text-[#2874f0]" />
            <span>Bulk CSV Import</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleCsvUpload}
            />
          </label>

          {/* Add New Publication Button */}
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#2874f0] hover:bg-blue-700 rounded-xl transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Guide Book</span>
          </button>
        </div>
      </div>

      {/* ─── Search & Class Standard Filter Pills ────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search by title, standard (10th, 12th), or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:border-[#2874f0] focus:bg-white transition-all shadow-inner"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            )}
          </div>

          <div className="text-xs font-medium text-slate-500">
            Showing <strong className="text-slate-900">{filteredProducts.length}</strong> of{' '}
            <strong className="text-slate-900">{products.length}</strong> publications
          </div>
        </div>

        {/* Class Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          <span className="text-[11px] font-bold text-slate-400 uppercase mr-1 shrink-0">
            Standard:
          </span>
          {classesList.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => setSelectedClass(cls)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer shrink-0 ${
                selectedClass === cls
                  ? 'bg-[#2874f0] text-white border-[#2874f0] shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cls === 'all' ? 'All Classes' : `${cls} Standard`}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Catalog Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Guide Book</th>
                <th className="p-4">Standard & Subject</th>
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
                                onClick={async () => {
                                  if (confirm(`Remove publication "${p.title}" from catalog?`)) {
                                    await onDeleteProduct(p.id);
                                    onShowToast('🗑️ Book removed from catalog');
                                  }
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                title="Delete publication"
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

      {/* ─── Add New Publication Modal ─────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-xl w-full p-6 sm:p-8 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#2874f0]" />
                <span>Publish New Guide to Catalog</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBook} className="space-y-4 text-xs">
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
                    Subject *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Science / Maths / Tamil"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Offer Price (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900 font-bold"
                  />
                </div>
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

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Book Description / Syllabus Highlights (SEO & Parents)
                </label>
                <textarea
                  rows={3}
                  placeholder="Detailed exam guide covering Samacheer Kalvi syllabus, unit-wise questions, and previous year model papers..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Cover Image URL
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newImage}
                  onChange={(e) => setNewImage(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900"
                />
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
                  disabled={isSubmitting}
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
