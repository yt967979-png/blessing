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
      const ok = await onUpdateProduct(id, {
        price: editPrice,
        mrp: editMrp,
        stock: editStock,
        inStock: editStock > 0,
      });
      if (ok) {
        onShowToast('✅ Publication details updated');
        setEditingId(null);
      } else {
        onShowToast('❌ Failed to update');
      }
    } catch {
      onShowToast('❌ Update error');
    }
  };

  const handleToggleStockStatus = async (p: Product) => {
    const nextInStock = !p.inStock;
    const nextStock = nextInStock ? Math.max(p.stock || 0, 10) : 0;
    const ok = await onUpdateProduct(p.id, {
      inStock: nextInStock,
      stock: nextStock,
    });
    if (ok) {
      onShowToast(nextInStock ? `📦 ${p.title} marked IN STOCK` : `⚠️ ${p.title} marked OUT OF STOCK`);
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

      const ok = await onAddNewProduct({
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

      if (ok) {
        onShowToast('✅ New guide published to catalog');
        setShowAddModal(false);
        setNewTitle('');
        setNewDescription('');
        setNewImage('');
      } else {
        onShowToast('❌ Failed to publish book');
      }
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
      <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif font-black text-lg text-[#1E2A4A] flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#D98C2B]" />
            <span>Blessing Power Guide — Book Catalog & Pricing</span>
          </h2>
          <p className="text-xs text-[#55607A] mt-0.5 font-sans">
            Manage school study materials, standard allocations, MRP/offer prices, and stock levels.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* CSV Bulk Import Button */}
          <label className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-mono font-bold text-[#1E2A4A] bg-[#FAF7F0] hover:bg-slate-100 border border-[#55607A]/20 rounded-lg transition-colors cursor-pointer shadow-xs">
            <Upload className="w-3.5 h-3.5 text-[#D98C2B]" />
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
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-bold text-white bg-[#1E2A4A] hover:bg-[#D98C2B] rounded-lg transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Guide Book</span>
          </button>
        </div>
      </div>

      {/* ─── Search & Class Standard Filter Pills ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#55607A]" />
            <input
              type="text"
              placeholder="Search by title, standard (10th, 12th), or subject..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg text-xs font-sans text-[#1E2A4A] outline-none focus:border-[#D98C2B] transition-colors"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-xs text-[#55607A] hover:text-[#1E2A4A]"
              >
                ✕
              </button>
            )}
          </div>

          <div className="text-xs font-mono font-bold text-[#55607A]">
            Showing <span className="text-[#1E2A4A]">{filteredProducts.length}</span> of{' '}
            <span className="text-[#1E2A4A]">{products.length}</span> publications
          </div>
        </div>

        {/* Class Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
          <span className="text-[11px] font-mono font-bold text-[#55607A] uppercase mr-1 shrink-0">
            Standard:
          </span>
          {classesList.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => setSelectedClass(cls)}
              className={`px-3 py-1 text-xs font-mono font-bold rounded-lg border transition-colors cursor-pointer shrink-0 ${
                selectedClass === cls
                  ? 'bg-[#1E2A4A] text-white border-[#1E2A4A] shadow-xs'
                  : 'bg-[#FAF7F0] text-[#55607A] border-[#55607A]/20 hover:bg-slate-100'
              }`}
            >
              {cls === 'all' ? 'All Classes' : `${cls} Standard`}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Catalog Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#55607A]/20 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#FAF7F0] border-b border-[#55607A]/20 text-[11px] font-mono font-bold text-[#55607A] uppercase tracking-wider">
                <th className="p-3.5">Guide Book</th>
                <th className="p-3.5">Standard & Subject</th>
                <th className="p-3.5">Offer Price / MRP</th>
                <th className="p-3.5">Inventory Status</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-[#55607A]">
                    <div className="max-w-xs mx-auto space-y-2">
                      <BookOpen className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="font-bold text-sm text-[#1E2A4A]">No Publications Found</p>
                      <p className="text-[11px] text-[#55607A]">
                        Try adjusting your search terms or selecting a different class standard filter.
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
                    <tr key={p.id} className="hover:bg-[#FAF7F0]/60 transition-colors">
                      {/* Book Cover & Title */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={p.image}
                            alt={p.title}
                            className="w-10 h-10 object-contain bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg p-0.5 shrink-0"
                          />
                          <div className="min-w-0 max-w-sm">
                            <span className="font-bold text-xs text-[#1E2A4A] block truncate">
                              {p.title}
                            </span>
                            {p.badge && (
                              <span className="inline-block text-[9px] font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded mt-0.5">
                                {p.badge}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Class & Subject */}
                      <td className="p-3.5">
                        <span className="font-mono font-bold text-[#1E2A4A] bg-[#FAF7F0] px-2 py-0.5 rounded border border-[#55607A]/20 text-[11px]">
                          {p.cls || 'General'}
                        </span>
                        {p.subject && (
                          <span className="text-[11px] text-[#55607A] block mt-0.5">
                            {p.subject}
                          </span>
                        )}
                      </td>

                      {/* Price & MRP */}
                      <td className="p-3.5 font-mono">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <div>
                              <span className="text-[9px] text-[#55607A] block">Offer ₹</span>
                              <input
                                type="number"
                                value={editPrice}
                                onChange={(e) => setEditPrice(Number(e.target.value))}
                                className="w-16 px-1.5 py-1 bg-[#FAF7F0] border border-[#55607A]/30 rounded text-xs font-mono font-bold outline-none focus:border-[#D98C2B]"
                              />
                            </div>
                            <div>
                              <span className="text-[9px] text-[#55607A] block">MRP ₹</span>
                              <input
                                type="number"
                                value={editMrp}
                                onChange={(e) => setEditMrp(Number(e.target.value))}
                                className="w-16 px-1.5 py-1 bg-[#FAF7F0] border border-[#55607A]/30 rounded text-xs font-mono font-bold outline-none focus:border-[#D98C2B]"
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm text-[#1E2A4A]">₹{p.price}</span>
                              {p.mrp > p.price && (
                                <span className="line-through text-[11px] text-[#55607A]">
                                  ₹{p.mrp}
                                </span>
                              )}
                            </div>
                            {disc > 0 && (
                              <span className="text-[10px] text-[#2F9E60] font-bold block">
                                {disc}% SAVINGS
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Stock Inventory */}
                      <td className="p-3.5 font-mono">
                        {isEditing ? (
                          <div>
                            <span className="text-[9px] text-[#55607A] block">Units in Rack</span>
                            <input
                              type="number"
                              min={0}
                              value={editStock}
                              onChange={(e) => setEditStock(Math.max(0, Number(e.target.value) || 0))}
                              className="w-16 px-1.5 py-1 bg-[#FAF7F0] border border-[#D98C2B] rounded text-xs font-mono font-bold outline-none"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleStockStatus(p)}
                              className={`text-[10px] font-mono font-bold px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                                isOOS
                                  ? 'bg-[#C43B3B]/10 text-[#C43B3B] border-[#C43B3B]/30'
                                  : isLow
                                  ? 'bg-[#D98C2B]/10 text-[#D98C2B] border-[#D98C2B]/30 animate-pulse'
                                  : 'bg-[#2F9E60]/10 text-[#2F9E60] border-[#2F9E60]/30'
                              }`}
                              title="Click to toggle in-stock / out-of-stock"
                            >
                              {isOOS ? 'OUT OF STOCK' : `${p.stock ?? '—'} IN STOCK`}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3.5 text-right font-mono">
                        <div className="flex items-center justify-end gap-1.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(p.id)}
                                className="px-2.5 py-1 bg-[#2F9E60] hover:bg-emerald-700 text-white rounded text-[11px] font-bold cursor-pointer transition-colors shadow-xs"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingId(null)}
                                className="px-2.5 py-1 bg-[#FAF7F0] hover:bg-slate-200 text-[#55607A] border border-slate-300 rounded text-[11px] font-bold cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(p)}
                                className="px-2.5 py-1 bg-[#FAF7F0] hover:bg-slate-200 text-[#1E2A4A] border border-[#55607A]/20 rounded text-[11px] font-bold cursor-pointer transition-colors"
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
                                className="p-1.5 text-slate-400 hover:text-[#C43B3B] rounded hover:bg-red-50 transition-colors cursor-pointer"
                                title="Delete publication"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          <div className="bg-white rounded-2xl border border-[#55607A]/20 max-w-xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-serif font-black text-base text-[#1E2A4A] flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#D98C2B]" />
                <span>Publish New Guide to Catalog</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateBook} className="space-y-4 text-xs font-sans">
              <div>
                <label className="block font-mono font-bold text-[#55607A] mb-1">
                  Book Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 10th Standard Mathematics Guide (Tamil & English Medium)"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono font-bold text-[#55607A] mb-1">
                    Class Standard *
                  </label>
                  <select
                    value={newCls}
                    onChange={(e) => setNewCls(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B] font-mono cursor-pointer"
                  >
                    {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => (
                      <option key={c} value={c}>
                        {c} Standard
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-mono font-bold text-[#55607A] mb-1">
                    Subject *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Science / Maths / Tamil"
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-mono font-bold text-[#55607A] mb-1">
                    Offer Price (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-mono font-bold text-[#55607A] mb-1">
                    Printed MRP (₹) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newMrp}
                    onChange={(e) => setNewMrp(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B] font-mono"
                  />
                </div>
                <div>
                  <label className="block font-mono font-bold text-[#55607A] mb-1">
                    Initial Copies *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newStock}
                    onChange={(e) => setNewStock(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-mono font-bold text-[#55607A] mb-1">
                  Book Description / Syllabus Highlights (SEO & Parents)
                </label>
                <textarea
                  rows={3}
                  placeholder="Detailed exam guide covering Samacheer Kalvi syllabus, unit-wise questions, and previous year model papers..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B]"
                />
              </div>

              <div>
                <label className="block font-mono font-bold text-[#55607A] mb-1">
                  Cover Image URL (or upload below)
                </label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newImage}
                  onChange={(e) => setNewImage(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF7F0] border border-[#55607A]/20 rounded-lg outline-none focus:border-[#D98C2B] font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg font-mono font-bold text-[#55607A] hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg font-mono font-bold text-white bg-[#1E2A4A] hover:bg-[#D98C2B] transition-colors cursor-pointer shadow-xs disabled:opacity-50"
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
