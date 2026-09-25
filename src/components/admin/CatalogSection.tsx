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
  Clock,
  Unlock,
  FileText,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import type { Product } from '@/context/StoreContext';
import { useStore } from '@/context/StoreContext';
import { authHeaders, authFormHeaders } from '@/lib/clientAuth';
import {
  STANDARD_COMBO_CHOICES,
  ALL_COMBO_SUBJECT_DEFINITIONS,
  getComboIncludedSubjects,
} from '@/lib/comboMetadata';

export interface StockHoldItem {
  id: string;
  holdGroupId?: string;
  bookId: string;
  title: string;
  cls?: string;
  price?: number;
  qty: number;
  razorpayOrderId?: string;
  expiresAt?: string;
  createdAt?: string;
}

export interface ActiveStockHoldsData {
  count: number;
  totalQty: number;
  list?: StockHoldItem[];
}

interface CatalogSectionProps {
  products: Product[];
  activeStockHolds?: ActiveStockHoldsData;
  onReleaseHold?: (holdGroupId: string, bookTitle: string) => Promise<void>;
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

export const COMBO_PRESETS = [
  {
    label: '⚡ 10th Core (5 Books)',
    cls: '10th',
    subjects: ['Tamil', 'English', 'Mathematics', 'Science', 'Social Science'],
  },
  {
    label: '🔬 11th/12th Bio-Maths (6 Books)',
    cls: '12th',
    subjects: ['Tamil', 'English', 'Mathematics', 'Physics', 'Chemistry', 'Biology'],
  },
  {
    label: '💻 11th/12th Comp Sci (6 Books)',
    cls: '12th',
    subjects: ['Tamil', 'English', 'Mathematics', 'Physics', 'Chemistry', 'Computer Science'],
  },
  {
    label: '📊 11th/12th Commerce (6 Books)',
    cls: '12th',
    subjects: ['Tamil', 'English', 'Commerce', 'Accountancy', 'Economics', 'Business Mathematics'],
  },
  {
    label: '🌿 11th/12th Pure Science (6 Books)',
    cls: '12th',
    subjects: ['Tamil', 'English', 'Physics', 'Chemistry', 'Botany', 'Zoology'],
  },
];

export const CatalogSection: React.FC<CatalogSectionProps> = ({
  products,
  activeStockHolds,
  onReleaseHold,
  onUpdateProduct,
  onAddNewProduct,
  onCreateProduct,
  onDeleteProduct,
  onShowToast,
  authHeaders: parentAuthHeaders,
}) => {
  const { user, refreshProducts } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showHoldsBanner, setShowHoldsBanner] = useState(false);
  const [editingId, setEditingId] = useState<string | number | null>(null);

  // Quick edit states
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editMrp, setEditMrp] = useState<number>(0);
  const [editStock, setEditStock] = useState<number>(0);
  const [editCls, setEditCls] = useState<string>('10th');
  const [editSubject, setEditSubject] = useState<string>('Mathematics');
  const [editTitle, setEditTitle] = useState<string>('');
  const [editBadge, setEditBadge] = useState<string>('');
  const [editImage, setEditImage] = useState<string>('');
  const [editImageUploading, setEditImageUploading] = useState<boolean>(false);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const [editComboSubjects, setEditComboSubjects] = useState<string[]>([]);
  const [editCustomComboSubjectInput, setEditCustomComboSubjectInput] = useState('');

  // New publication modal states
  const [newTitle, setNewTitle] = useState('');
  const [newCls, setNewCls] = useState('10th');
  const [selectedSubjectOption, setSelectedSubjectOption] = useState('Mathematics');
  const [customSubjectText, setCustomSubjectText] = useState('');
  const [selectedComboSubjects, setSelectedComboSubjects] = useState<string[]>([
    'Tamil',
    'English',
    'Mathematics',
    'Science',
    'Social Science',
  ]);
  const [customComboSubjectInput, setCustomComboSubjectInput] = useState('');
  const [newMrp, setNewMrp] = useState<string>('350');
  const [newPrice, setNewPrice] = useState<string>('280');
  const [newStock, setNewStock] = useState<string>('50');
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(5);
  const [newBadge, setNewBadge] = useState('Popular');
  const [newImage, setNewImage] = useState('');
  const [hsnCode, setHsnCode] = useState('4901');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [imageUploading, setImageUploading] = useState(false);
  const [editSamplePdf, setEditSamplePdf] = useState<string>('');
  const [newSamplePdf, setNewSamplePdf] = useState('');
  const [pdfUploading, setPdfUploading] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const editPdfInputRef = useRef<HTMLInputElement>(null);
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

  // Holds map by book ID
  const holdsByBookId = useMemo(() => {
    const map = new Map<string, number>();
    (activeStockHolds?.list || []).forEach((h) => {
      const bId = String(h.bookId);
      map.set(bId, (map.get(bId) || 0) + (h.qty || 0));
    });
    return map;
  }, [activeStockHolds]);

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
    setEditTitle(p.title || '');
    setEditBadge(p.badge || '');
    setEditImage(p.image || '');
    setEditPrice(p.price);
    setEditMrp(p.mrp || p.price);
    setEditStock(p.stock ?? 0);
    setEditSamplePdf(p.samplePdfUrl || '');
    setEditCls(p.cls || '10th');
    setEditSubject(p.subject || 'Mathematics');
    const initialSubs =
      p.comboSubjects && p.comboSubjects.length > 0
        ? p.comboSubjects
        : getComboIncludedSubjects(p).map((s) => s.name);
    setEditComboSubjects(initialSubs);
    setEditCustomComboSubjectInput('');
  };

  const handleEditDeviceImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      onShowToast('❌ File too large. Max allowed is 10MB.');
      return;
    }

    setEditImageUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'blessing_power_guides');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: authFormHeaders(user),
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Image upload failed');
      }

      setEditImage(data.url);
      onShowToast('✅ Cover image updated');
    } catch (err: any) {
      onShowToast(`❌ Upload failed: ${err.message}`);
    } finally {
      setEditImageUploading(false);
    }
  };

  const handleSaveEdit = async (id: string | number) => {
    const numPrice = Number(editPrice);
    const numMrp = Number(editMrp);
    const numStock = Math.max(0, parseInt(String(editStock), 10) || 0);
    const isCombo =
      editSubject === 'All-in-One Full Set (Combo)' ||
      editTitle.toLowerCase().includes('combo') ||
      editComboSubjects.length > 0;
    try {
      await onUpdateProduct(id, {
        title: editTitle.trim(),
        badge: editBadge.trim(),
        image: editImage.trim() || undefined,
        cls: editCls,
        subject: editSubject,
        category: isCombo ? 'combo' : 'guide',
        comboSubjects: isCombo ? editComboSubjects : undefined,
        price: numPrice,
        mrp: numMrp,
        stock: numStock,
        inStock: numStock > 0,
        samplePdfUrl: editSamplePdf.trim() || null,
      });
      onShowToast('✅ Publication details updated');
      setEditingId(null);
    } catch {
      onShowToast('❌ Update error');
    }
  };

  const handleToggleStockStatus = async (p: Product) => {
    const nextInStock = !p.inStock;
    const currentStock = p.stock ?? 0;
    try {
      if (nextInStock && currentStock <= 0) {
        // Turning ON from 0: ensure at least 1 unit so customer can buy
        await onUpdateProduct(p.id, {
          inStock: true,
          stock: 1,
        });
      } else {
        // Toggling status without destroying existing rack inventory count!
        await onUpdateProduct(p.id, {
          inStock: nextInStock,
        });
      }
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
        headers: authFormHeaders(user),
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

  const handleDevicePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      onShowToast('❌ PDF too large. Max allowed is 25MB.');
      return;
    }

    setPdfUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'samples');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: authFormHeaders(user),
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'PDF upload failed');
      }

      setNewSamplePdf(data.url);
      onShowToast('✅ Sample pages PDF uploaded successfully');
    } catch (err: any) {
      onShowToast(`❌ PDF upload failed: ${err.message}`);
    } finally {
      setPdfUploading(false);
    }
  };

  const handleEditDevicePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      onShowToast('❌ PDF too large. Max allowed is 25MB.');
      return;
    }

    setPdfUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'samples');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: authFormHeaders(user),
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'PDF upload failed');
      }

      setEditSamplePdf(data.url);
      onShowToast('✅ Sample pages PDF attached');
    } catch (err: any) {
      onShowToast(`❌ PDF upload failed: ${err.message}`);
    } finally {
      setPdfUploading(false);
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

    const isCombo =
      selectedSubjectOption === 'All-in-One Full Set (Combo)' ||
      resolvedSubject.toLowerCase().includes('combo');

    if (isCombo && selectedComboSubjects.length === 0) {
      onShowToast('⚠️ Please tick at least 1 subject for this combo pack');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: newTitle.trim(),
        cls: newCls,
        category: isCombo ? 'combo' : 'guide',
        subject: resolvedSubject,
        comboSubjects: isCombo ? selectedComboSubjects : undefined,
        price: numPrice,
        mrp: numMrp,
        stock: Math.max(0, Number(newStock) || 0),
        status: targetStatus,
        badge: newBadge.trim() || (isCombo ? 'Combo Set' : ''),
        description: isCombo
          ? `Complete ${newCls} Standard All-in-One Combo Guide Pack (${selectedComboSubjects.join(', ')}). Covers full Tamil Nadu State Board syllabus with solved question papers.`
          : `Complete ${newCls} Standard ${resolvedSubject} guide covering Tamil Nadu Samacheer Kalvi syllabus with question banks and answers.`,
        image: newImage.trim() || 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80',
        samplePdfUrl: newSamplePdf.trim() || null,
      };

      const creator = onAddNewProduct || onCreateProduct;
      if (creator) {
        await creator(payload);
      } else {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(parentAuthHeaders || {}),
        };
        if (user?.token) headers.Authorization = `Bearer ${user.token}`;

        const res = await fetch('/api/products', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Failed to create publication (${res.status})`);
        }
        // Server POST triggers notifyCatalogChanged → SSE → auto-refresh via StoreContext
      }

      onShowToast(
        targetStatus === 'published'
          ? `🎉 "${newTitle}" published live to bookstore!`
          : `📝 "${newTitle}" saved as Draft`
      );
      setShowAddModal(false);

      // Reset form
      setNewTitle('');
      setNewSamplePdf('');
      setSelectedSubjectOption('Mathematics');
      setCustomSubjectText('');
      setNewMrp('350');
      setNewPrice('280');
      setNewStock('50');
      setNewImage('');
    } catch (err: any) {
      onShowToast(`❌ ${err?.message || 'Failed to save publication'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Active Student Holds Banner (If any) */}
      {(activeStockHolds?.count ?? 0) > 0 && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-[#2874f0] animate-spin" />
              <span className="font-bold text-slate-900">
                <strong className="text-[#2874f0]">{activeStockHolds?.count} student(s)</strong> currently in checkout ({activeStockHolds?.totalQty} copies temporarily reserved)
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowHoldsBanner(!showHoldsBanner)}
              className="text-xs font-bold text-[#2874f0] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{showHoldsBanner ? 'Hide Held Details' : 'View Held Books'}</span>
              {showHoldsBanner ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showHoldsBanner && (activeStockHolds?.list || []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-blue-200/60 space-y-2">
              {(activeStockHolds?.list || []).map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200 text-xs"
                >
                  <div>
                    <span className="font-bold text-slate-900">{h.title}</span>
                    <span className="text-slate-500 ml-2 font-medium">({h.qty} copy held)</span>
                    {h.expiresAt && (
                      <span className="text-[11px] text-amber-700 ml-3">
                        Expires: {new Date(h.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  {onReleaseHold && (
                    <button
                      type="button"
                      onClick={() => onReleaseHold(h.holdGroupId || h.id, h.title)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-200 rounded-lg text-[11px] font-bold cursor-pointer"
                    >
                      Release to Rack
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      {/* Publications Table (Desktop md+) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="p-4">Guide Book</th>
                <th className="p-4">Standard &amp; Subject</th>
                <th className="p-4">Offer Price / MRP</th>
                <th className="p-4">Rack Inventory Status</th>
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
                    p.mrp > p.price
                      ? p.price <= 0
                        ? 100
                        : Math.min(99, Math.round(((p.mrp - p.price) / p.mrp) * 100))
                      : 0;
                  const isOOS = !p.inStock || (p.stock ?? 0) <= 0;
                  const isLow = (p.stock ?? 99) <= 5 && !isOOS;
                  const heldCount = holdsByBookId.get(String(p.id)) || 0;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Book Cover & Title */}
                      <td className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="relative group shrink-0">
                            <img
                              src={isEditing && editImage ? editImage : p.image}
                              alt={p.title}
                              className="w-12 h-12 object-contain bg-slate-50 border border-slate-200 rounded-lg p-0.5"
                            />
                            {isEditing && (
                              <button
                                type="button"
                                disabled={editImageUploading}
                                onClick={() => editImageInputRef.current?.click()}
                                className="absolute inset-0 bg-slate-900/60 text-white rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[9px] font-bold"
                                title="Change cover image"
                              >
                                {editImageUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                          <div className="min-w-0 max-w-sm flex-1">
                            {isEditing ? (
                              <div className="space-y-1.5">
                                <input
                                  type="text"
                                  value={editTitle}
                                  onChange={(e) => setEditTitle(e.target.value)}
                                  placeholder="Publication Title"
                                  className="w-full px-2 py-1 bg-white border border-blue-400 rounded-lg text-xs font-bold outline-none text-slate-900"
                                />
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <select
                                    value={editBadge}
                                    onChange={(e) => setEditBadge(e.target.value)}
                                    className="px-2 py-0.5 bg-white border border-slate-300 rounded text-[10px] font-bold outline-none cursor-pointer"
                                  >
                                    <option value="">No Badge</option>
                                    <option value="Popular">Popular</option>
                                    <option value="Bestseller">Bestseller</option>
                                    <option value="Combo Set">Combo Set</option>
                                    <option value="New Edition">New Edition</option>
                                  </select>
                                  <input
                                    ref={editImageInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleEditDeviceImageUpload}
                                    className="hidden"
                                  />
                                  <button
                                    type="button"
                                    disabled={editImageUploading}
                                    onClick={() => editImageInputRef.current?.click()}
                                    className="text-[10px] text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded font-bold cursor-pointer flex items-center gap-1"
                                  >
                                    <ImageIcon className="w-2.5 h-2.5" />
                                    <span>{editImageUploading ? 'Uploading...' : 'Change Cover'}</span>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="font-bold text-xs text-slate-900 block truncate">
                                  {p.title}
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  {p.badge && (
                                    <span className="inline-block text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                                      {p.badge}
                                    </span>
                                  )}
                                  {p.samplePdfUrl && (
                                    <a
                                      href={p.samplePdfUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-[9px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-0.5 rounded-md"
                                      title="Click to view sample pages PDF"
                                    >
                                      <FileText className="w-2.5 h-2.5 text-purple-600" />
                                      <span>Sample PDF</span>
                                      <ExternalLink className="w-2 h-2 text-purple-500" />
                                    </a>
                                  )}
                                </div>
                              </>
                            )}
                            {isEditing && (
                              <div className="mt-2 pt-1 border-t border-slate-200 flex items-center gap-2">
                                <input
                                  ref={editPdfInputRef}
                                  type="file"
                                  accept="application/pdf,.pdf"
                                  onChange={handleEditDevicePdfUpload}
                                  className="hidden"
                                />
                                <button
                                  type="button"
                                  disabled={pdfUploading}
                                  onClick={() => editPdfInputRef.current?.click()}
                                  className="text-[10px] font-bold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2 py-1 rounded-md cursor-pointer flex items-center gap-1"
                                >
                                  <FileText className="w-3 h-3" />
                                  <span>{editSamplePdf ? 'Replace PDF' : '+ Attach Sample PDF'}</span>
                                </button>
                                {editSamplePdf && (
                                  <button
                                    type="button"
                                    onClick={() => setEditSamplePdf('')}
                                    className="text-[10px] text-red-600 hover:underline cursor-pointer"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            )}
                            {isEditing && (editSubject === 'All-in-One Full Set (Combo)' || p.category === 'combo' || p.title.toLowerCase().includes('combo') || editComboSubjects.length > 0) && (
                              <div className="mt-3 p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs">📦</span>
                                    <span className="text-[11px] font-black text-purple-950 uppercase tracking-wide">
                                      Combo Subjects ({editComboSubjects.length} Books)
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => setEditComboSubjects(['Tamil', 'English', 'Mathematics', 'Science', 'Social Science'])}
                                      className="text-[9px] font-bold px-1.5 py-0.5 bg-white border border-purple-200 text-purple-800 rounded hover:bg-purple-100 cursor-pointer"
                                    >
                                      10th (5)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditComboSubjects(['Tamil', 'English', 'Mathematics', 'Physics', 'Chemistry', 'Biology'])}
                                      className="text-[9px] font-bold px-1.5 py-0.5 bg-white border border-purple-200 text-purple-800 rounded hover:bg-purple-100 cursor-pointer"
                                    >
                                      Bio-Maths (6)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditComboSubjects(['Tamil', 'English', 'Commerce', 'Accountancy', 'Economics', 'Business Mathematics'])}
                                      className="text-[9px] font-bold px-1.5 py-0.5 bg-white border border-purple-200 text-purple-800 rounded hover:bg-purple-100 cursor-pointer"
                                    >
                                      Commerce (6)
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                                  {STANDARD_COMBO_CHOICES.map((choice) => {
                                    const isTicked = editComboSubjects.includes(choice.name);
                                    return (
                                      <label
                                        key={choice.name}
                                        className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-[10px] font-bold cursor-pointer transition-colors ${
                                          isTicked
                                            ? 'bg-white border-purple-500 text-purple-950 shadow-2xs'
                                            : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isTicked}
                                          onChange={(e) => {
                                            if (e.target.checked) {
                                              setEditComboSubjects((prev) => [...prev, choice.name]);
                                            } else {
                                              setEditComboSubjects((prev) => prev.filter((s) => s !== choice.name));
                                            }
                                          }}
                                          className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                                        />
                                        <span>{choice.icon}</span>
                                        <span className="truncate">{choice.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    placeholder="+ Extra book to combo..."
                                    value={editCustomComboSubjectInput}
                                    onChange={(e) => setEditCustomComboSubjectInput(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        const v = editCustomComboSubjectInput.trim();
                                        if (v && !editComboSubjects.includes(v)) {
                                          setEditComboSubjects((prev) => [...prev, v]);
                                          setEditCustomComboSubjectInput('');
                                        }
                                      }
                                    }}
                                    className="flex-1 px-2 py-1 bg-white border border-purple-200 rounded text-[10px] outline-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const v = editCustomComboSubjectInput.trim();
                                      if (v && !editComboSubjects.includes(v)) {
                                        setEditComboSubjects((prev) => [...prev, v]);
                                        setEditCustomComboSubjectInput('');
                                      }
                                    }}
                                    className="px-2 py-1 bg-purple-600 text-white rounded text-[10px] font-bold cursor-pointer"
                                  >
                                    Add
                                  </button>
                                </div>

                                <div className="p-2 bg-gradient-to-br from-amber-50 to-orange-50/70 border border-dashed border-amber-300 rounded-xl space-y-1">
                                  <span className="text-[10px] font-black text-amber-900 flex items-center gap-1">
                                    <span>📦 Inside This Combo Pack ({editComboSubjects.length} Books):</span>
                                  </span>
                                  <div className="flex flex-wrap gap-1">
                                    {editComboSubjects.map((sub, i) => (
                                      <span
                                        key={sub}
                                        className="text-[9px] font-bold bg-white text-slate-800 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs"
                                      >
                                        <span>{i + 1}. {sub}</span>
                                        <button
                                          type="button"
                                          onClick={() => setEditComboSubjects((prev) => prev.filter((s) => s !== sub))}
                                          className="text-slate-300 hover:text-red-500 cursor-pointer"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Class & Subject */}
                      <td className="p-4">
                        {isEditing ? (
                          <div className="space-y-1.5 min-w-[130px]">
                            <select
                              value={editCls}
                              onChange={(e) => setEditCls(e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-bold outline-none focus:border-[#2874f0] cursor-pointer"
                            >
                              {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => (
                                <option key={c} value={c}>
                                  {c} Standard
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editSubject}
                              onChange={(e) => setEditSubject(e.target.value)}
                              placeholder="Subject (e.g. Mathematics)"
                              className="w-full px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-medium outline-none focus:border-[#2874f0]"
                            />
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md text-[11px] border border-slate-200">
                              {p.cls || 'General'}
                            </span>
                            {p.subject && (
                              <span className="text-xs text-slate-500 block mt-1 font-medium">
                                {p.subject}
                              </span>
                            )}
                          </div>
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
                                step="any"
                                min="0"
                                value={editPrice}
                                onChange={(e) => setEditPrice(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                                className="w-18 px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold outline-none focus:border-[#2874f0]"
                              />
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">MRP ₹</span>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={editMrp}
                                onChange={(e) => setEditMrp(e.target.value === '' ? ('' as any) : Number(e.target.value))}
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
                          <div className="flex flex-col gap-1 items-start">
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
                              {isOOS ? 'OUT OF STOCK' : `${p.stock ?? '—'} IN RACK`}
                            </button>
                            {heldCount > 0 && (
                              <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5 text-blue-600 animate-spin" />
                                <span>{heldCount} on checkout hold</span>
                              </span>
                            )}
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

      {/* Publications Cards (Mobile md:hidden) */}
      <div className="block md:hidden space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 space-y-2">
            <BookOpen className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-bold text-sm text-slate-800">No Publications Found</p>
            <p className="text-xs text-slate-500">Try adjusting your filters or search.</p>
          </div>
        ) : (
          filteredProducts.map((p) => {
            const isEditing = editingId === p.id;
            const disc =
              p.mrp > p.price
                ? p.price <= 0
                  ? 100
                  : Math.min(99, Math.round(((p.mrp - p.price) / p.mrp) * 100))
                : 0;
            const isOOS = !p.inStock || (p.stock ?? 0) <= 0;
            const isLow = (p.stock ?? 99) <= 5 && !isOOS;
            const heldCount = holdsByBookId.get(String(p.id)) || 0;

            if (isEditing) {
              return (
                <div key={p.id} className="bg-white rounded-2xl border-2 border-blue-400 p-4 shadow-md space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-blue-600">Editing Publication</span>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 block mb-1">Guide Book Title</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold outline-none focus:border-[#2874f0] text-slate-900"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">Standard</label>
                        <select
                          value={editCls}
                          onChange={(e) => setEditCls(e.target.value)}
                          className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold outline-none cursor-pointer"
                        >
                          {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => (
                            <option key={c} value={c}>{c} Standard</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-1">Subject</label>
                        <input
                          type="text"
                          value={editSubject}
                          onChange={(e) => setEditSubject(e.target.value)}
                          className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs outline-none"
                        />
                      </div>
                    </div>

                    {/* Mobile Combo Subjects Editor */}
                    {(editSubject === 'All-in-One Full Set (Combo)' || p.category === 'combo' || p.title.toLowerCase().includes('combo') || editComboSubjects.length > 0) && (
                      <div className="p-3 bg-purple-50/80 border border-purple-200 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black text-purple-950 uppercase">
                            📦 Inside Combo ({editComboSubjects.length} Books)
                          </span>
                          <button
                            type="button"
                            onClick={() => setEditComboSubjects(['Tamil', 'English', 'Mathematics', 'Science', 'Social Science'])}
                            className="text-[9px] font-bold px-1.5 py-0.5 bg-white border border-purple-200 text-purple-800 rounded"
                          >
                            10th (5)
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {STANDARD_COMBO_CHOICES.map((choice) => {
                            const isTicked = editComboSubjects.includes(choice.name);
                            return (
                              <label
                                key={choice.name}
                                className={`flex items-center gap-1.5 p-1.5 rounded-lg border text-[10px] font-bold cursor-pointer ${
                                  isTicked ? 'bg-white border-purple-500 text-purple-950' : 'bg-white/60 border-slate-200 text-slate-600'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isTicked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setEditComboSubjects((prev) => [...prev, choice.name]);
                                    } else {
                                      setEditComboSubjects((prev) => prev.filter((s) => s !== choice.name));
                                    }
                                  }}
                                  className="w-3.5 h-3.5 rounded text-purple-600 accent-purple-600"
                                />
                                <span>{choice.icon}</span>
                                <span className="truncate">{choice.name}</span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="p-2 bg-amber-50/90 border border-dashed border-amber-300 rounded-xl">
                          <span className="text-[10px] font-black text-amber-900 block mb-1">
                            📦 Inside This Pack ({editComboSubjects.length} Books):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {editComboSubjects.map((sub, i) => (
                              <span
                                key={sub}
                                className="text-[9px] font-bold bg-white text-slate-800 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-1"
                              >
                                <span>{i + 1}. {sub}</span>
                                <button
                                  type="button"
                                  onClick={() => setEditComboSubjects((prev) => prev.filter((s) => s !== sub))}
                                  className="text-slate-300 hover:text-red-500 cursor-pointer"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                      <div>
                        <label className="text-[11px] font-bold text-blue-900 block mb-0.5">Offer Price (₹)</label>
                        <span className="text-[9px] text-blue-600 block mb-1">Customer selling price</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                          className="w-full px-2 py-2 bg-white border border-blue-300 rounded-lg text-xs font-extrabold outline-none text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 block mb-0.5">MRP (₹)</label>
                        <span className="text-[9px] text-slate-500 block mb-1">Original printed price</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={editMrp}
                          onChange={(e) => setEditMrp(e.target.value === '' ? ('' as any) : Number(e.target.value))}
                          className="w-full px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold outline-none text-slate-900"
                        />
                      </div>
                    </div>
                    <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-100">
                      <label className="text-[11px] font-bold text-amber-900 block mb-0.5">Copies in Rack</label>
                      <span className="text-[9px] text-amber-700 block mb-1">Available warehouse inventory count</span>
                      <input
                        type="number"
                        min="0"
                        value={editStock}
                        onChange={(e) => setEditStock(Math.max(0, Number(e.target.value) || 0))}
                        className="w-full px-2 py-2 bg-white border border-amber-300 rounded-lg text-xs font-extrabold outline-none text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(p.id)}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors text-center shadow-xs"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex items-start gap-3">
                  <img
                    src={p.image}
                    alt={p.title}
                    className="w-14 h-14 object-contain bg-slate-50 border border-slate-200 rounded-xl p-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md text-[10px] border border-slate-200">
                        {p.cls || 'General'}
                      </span>
                      {p.subject && (
                        <span className="text-[11px] text-slate-500 font-medium">
                          {p.subject}
                        </span>
                      )}
                      {p.badge && (
                        <span className="text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                          {p.badge}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-xs text-slate-900 block mt-1 leading-snug">
                      {p.title}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[10px] text-slate-500 block font-medium">Price</span>
                    <div className="flex items-baseline gap-1.5 mt-0.5">
                      <span className="font-extrabold text-sm text-slate-900">₹{p.price}</span>
                      {p.mrp > p.price && (
                        <span className="line-through text-xs text-slate-400">₹{p.mrp}</span>
                      )}
                    </div>
                    {disc > 0 && (
                      <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
                        {disc}% OFF
                      </span>
                    )}
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex flex-col justify-between">
                    <span className="text-[10px] text-slate-500 block font-medium">Rack Stock</span>
                    <button
                      type="button"
                      onClick={() => handleToggleStockStatus(p)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors cursor-pointer text-center mt-1 ${
                        isOOS
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : isLow
                          ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      {isOOS ? 'OUT OF STOCK' : `${p.stock ?? '—'} IN RACK`}
                    </button>
                    {heldCount > 0 && (
                      <span className="text-[9px] text-blue-700 font-bold mt-1 block">
                        {heldCount} on hold
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(p)}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                  >
                    Edit Publication
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteProduct(p.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    title="Delete Publication"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add New Publication Modal */}
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
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedSubjectOption(val);
                        if (val === 'All-in-One Full Set (Combo)') {
                          if (!newTitle || newTitle.includes('Guide') || newTitle.includes('Mathematics')) {
                            setNewTitle(`${newCls} Standard All-in-One Complete Guide Combo Pack (${selectedComboSubjects.length} Books)`);
                          }
                          if (!newBadge) setNewBadge('Combo Set');
                        }
                      }}
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

                {/* ALL-IN-ONE COMBO SUBJECT CHECKLIST & LIVE BOX PREVIEW */}
                {selectedSubjectOption === 'All-in-One Full Set (Combo)' && (
                  <div className="mt-3 p-4 bg-gradient-to-br from-purple-50/90 via-slate-50 to-amber-50/60 border-2 border-purple-300 rounded-2xl space-y-3.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-md">
                          Combo Pack Configurator
                        </span>
                        <h4 className="font-extrabold text-sm text-slate-900 mt-1">
                          Tick the Subjects Included in this Combo Set
                        </h4>
                        <p className="text-[10px] text-slate-600">
                          Check each book that comes inside this set. The live box below shows exactly what customers see.
                        </p>
                      </div>
                      <span className="text-xs font-black text-purple-900 bg-purple-200/90 px-3 py-1 rounded-full border border-purple-300 shadow-2xs">
                        {selectedComboSubjects.length} Books Selected
                      </span>
                    </div>

                    {/* Quick Presets */}
                    <div>
                      <span className="text-[10px] font-extrabold text-slate-600 uppercase tracking-wider block mb-1.5">
                        ⚡ 1-Click Fast Presets:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {COMBO_PRESETS.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              setSelectedComboSubjects([...preset.subjects]);
                              if (preset.cls && newCls !== preset.cls) {
                                setNewCls(preset.cls);
                              }
                              if (!newTitle || newTitle.includes('Combo') || newTitle.includes('All-in-One')) {
                                setNewTitle(`${preset.cls} Standard All-in-One Complete Combo Guide (${preset.subjects.length} Books)`);
                              }
                            }}
                            className="text-[10px] font-bold px-2.5 py-1 bg-white hover:bg-purple-100 text-purple-950 border border-purple-200 rounded-lg cursor-pointer transition-colors shadow-2xs active:scale-95"
                          >
                            {preset.label}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setSelectedComboSubjects(STANDARD_COMBO_CHOICES.map(c => c.name))}
                          className="text-[10px] font-bold px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg cursor-pointer shadow-2xs"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedComboSubjects([])}
                          className="text-[10px] font-bold px-2.5 py-1 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-lg cursor-pointer shadow-2xs"
                        >
                          Clear All
                        </button>
                      </div>
                    </div>

                    {/* Subject Checkbox Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                      {STANDARD_COMBO_CHOICES.map((choice) => {
                        const isTicked = selectedComboSubjects.includes(choice.name);
                        return (
                          <label
                            key={choice.name}
                            className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                              isTicked
                                ? 'bg-white border-purple-500 text-purple-950 shadow-2xs ring-1 ring-purple-400/40'
                                : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isTicked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedComboSubjects((prev) => [...prev, choice.name]);
                                } else {
                                  setSelectedComboSubjects((prev) => prev.filter((s) => s !== choice.name));
                                }
                              }}
                              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer accent-purple-600"
                            />
                            <span className="text-sm shrink-0">{choice.icon}</span>
                            <div className="min-w-0 flex-1 leading-tight">
                              <span className="block truncate text-[11px] font-bold">{choice.name}</span>
                              {choice.tamilName && (
                                <span className="block text-[9px] text-slate-400 font-tamil truncate">{choice.tamilName}</span>
                              )}
                            </div>
                          </label>
                        );
                      })}
                    </div>

                    {/* Custom subject write-in */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Add extra custom subject book to combo..."
                        value={customComboSubjectInput}
                        onChange={(e) => setCustomComboSubjectInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = customComboSubjectInput.trim();
                            if (val && !selectedComboSubjects.includes(val)) {
                              setSelectedComboSubjects((prev) => [...prev, val]);
                              setCustomComboSubjectInput('');
                            }
                          }
                        }}
                        className="flex-1 px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-xs outline-none text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = customComboSubjectInput.trim();
                          if (val && !selectedComboSubjects.includes(val)) {
                            setSelectedComboSubjects((prev) => [...prev, val]);
                            setCustomComboSubjectInput('');
                          }
                        }}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs"
                      >
                        + Add Book
                      </button>
                    </div>

                    {/* THE BOX SHOWING THE SELECTED SUBJECTS */}
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50/70 border-2 border-dashed border-amber-300 rounded-2xl p-4 space-y-3 shadow-2xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">📦</span>
                          <div>
                            <h5 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                              <span>What's Inside This Complete Combo Pack</span>
                              <span className="text-[10px] bg-amber-400 text-slate-900 px-2 py-0.5 rounded-full font-black">
                                {selectedComboSubjects.length} IN 1
                              </span>
                            </h5>
                            <span className="text-[10px] text-slate-500">
                              Live storefront box preview — updates in real time as you tick subjects
                            </span>
                          </div>
                        </div>
                      </div>

                      {selectedComboSubjects.length === 0 ? (
                        <div className="text-center py-4 bg-white/80 rounded-xl border border-amber-200">
                          <p className="text-xs font-bold text-amber-900">⚠️ No subjects ticked yet</p>
                          <p className="text-[10px] text-slate-500">Please tick at least 1 subject checkbox above</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {selectedComboSubjects.map((subName, i) => {
                            const def = ALL_COMBO_SUBJECT_DEFINITIONS[subName.toLowerCase().trim()];
                            const icon = def?.icon || '📖';
                            const tamil = def?.tamilName || '';
                            return (
                              <div
                                key={subName}
                                className="flex items-center gap-2 p-2 bg-white rounded-xl border border-amber-200 shadow-2xs"
                              >
                                <span className="text-base shrink-0">{icon}</span>
                                <div className="min-w-0 flex-1">
                                  <span className="text-[11px] font-bold text-slate-900 block truncate">
                                    {i + 1}. {subName}
                                  </span>
                                  {tamil && (
                                    <span className="text-[9px] text-slate-400 font-tamil block truncate">{tamil}</span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedComboSubjects((prev) => prev.filter((s) => s !== subName))}
                                  className="text-slate-300 hover:text-red-500 p-0.5 rounded cursor-pointer"
                                  title="Remove from combo"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
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
                      step="any"
                      min={0}
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
                      step="any"
                      min={0}
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

                {/* Sample Pages PDF Upload (Preview Before Buying) */}
                <div className="pt-3 border-t border-slate-200">
                  <div className="font-bold text-[11px] text-slate-800 uppercase tracking-wider flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-purple-600" />
                      <span>Sample Pages PDF (Preview Before Buying)</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal">Optional · Max 25MB</span>
                  </div>

                  <input
                    ref={pdfInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={handleDevicePdfUpload}
                    className="hidden"
                  />

                  {newSamplePdf ? (
                    <div className="flex items-center justify-between p-3 bg-purple-50/70 border border-purple-200 rounded-xl">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-6 h-6 text-purple-600 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-purple-900 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Sample Pages PDF Ready</span>
                          </div>
                          <a
                            href={newSamplePdf}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-purple-700 hover:underline inline-flex items-center gap-1 mt-0.5"
                          >
                            <span>Open PDF Preview</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => pdfInputRef.current?.click()}
                          className="text-xs text-purple-700 font-bold px-2.5 py-1 hover:bg-purple-100 rounded-lg cursor-pointer"
                        >
                          Change
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewSamplePdf('')}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg cursor-pointer"
                          title="Remove PDF"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={pdfUploading}
                      onClick={() => pdfInputRef.current?.click()}
                      className="w-full py-2.5 px-3 bg-white border border-dashed border-purple-300 hover:border-purple-500 rounded-xl text-center cursor-pointer transition-all flex items-center justify-center gap-2 text-purple-700 hover:bg-purple-50/50"
                    >
                      {pdfUploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                          <span className="font-bold text-xs">Uploading PDF...</span>
                        </>
                      ) : (
                        <>
                          <FileText className="w-4 h-4 text-purple-600" />
                          <span className="font-bold text-xs">Upload Sample Pages PDF (e.g. Chapter 1)</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* LIVE STOREFRONT PREVIEW CARD */}
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
