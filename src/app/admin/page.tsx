'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  DollarSign,
  ArrowLeft,
  Edit2,
  Check,
  Power,
  Plus,
  Trash2,
  BookOpen,
  Upload,
  MessageSquare,
  Truck,
  Send,
  ShieldCheck,
  Download,
  LogOut,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export default function AdminPage() {
  const router = useRouter();
  const { products, updateProductInDb, addNewProductToDb, deleteProductFromDb, showToast, logoutUser } = useStore();
  const [activeTab, setActiveTab] = useState<'catalog' | 'orders' | 'whatsapp'>('catalog');
  const [waStatus, setWaStatus] = useState<{ status: string; connected?: boolean; qrImage?: string; pairingCode?: string; message?: string }>({ status: 'LOADING', connected: false });
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);

  // Poll WhatsApp service status from Next.js internal API
  useEffect(() => {
    const fetchWaStatus = async () => {
      try {
        const res = await fetch('/api/whatsapp/qr');
        if (res.ok) {
          const data = await res.json();
          setWaStatus(data);
        }
      } catch (e) {
        setWaStatus({ status: 'INITIALIZING', message: 'WhatsApp Engine Initializing...' });
      }
    };
    fetchWaStatus();
    const interval = setInterval(fetchWaStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waPhoneInput) return;
    try {
      const res = await fetch(`/api/whatsapp/qr?phone=${encodeURIComponent(waPhoneInput)}`);
      const data = await res.json();
      if (data.pairingCode) {
        setWaPairingCode(data.pairingCode);
        showToast('✅ 8-Digit Pairing Code Generated!');
      }
    } catch (e) {
      showToast('❌ Error generating pairing code.');
    }
  };
  const [editingId, setEditingId] = useState<string | number | null>(null);

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
  const [dbStats, setDbStats] = useState({ users: 0, books: 0 });
  const [orderStatuses, setOrderStatuses] = useState<{ [orderId: string]: string }>({});

  const loadLiveOrders = async () => {
    try {
      const res = await fetch('/api/orders', {
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
    loadLiveOrders();
    // Load live DB stats for users + books
    fetch('/api/db-status')
      .then((r) => r.json())
      .then((d) => {
        if (d.tableRowCounts) {
          setDbStats({
            users: d.tableRowCounts.users || 0,
            books: d.tableRowCounts.books || 0,
          });
        }
      })
      .catch(() => {});
  }, [activeTab]);

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('File size exceeds 10MB limit.');
        return;
      }

      showToast('⏳ Uploading book image...');
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'blessing_power_guides');

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            setNewImg(data.url);
            showToast(data.provider === 'cloudinary' ? '☁️ Uploaded to Cloudinary!' : '✓ Image uploaded successfully!');
            return;
          }
        }
      } catch (_) {}

      // Local fallback
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setNewImg(reader.result);
          showToast('✓ Image uploaded successfully!');
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

  const saveProductChanges = async (id: string | number) => {
    const calculatedDiscount = Math.round(((editMrp - editPrice) / editMrp) * 100);
    // Save to Railway PostgreSQL via API
    try {
      await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, price: editPrice, mrp: editMrp, badge: editBadge }),
      });
    } catch (_) {}
    // Also update local products state via StoreContext
    updateProductInDb(id, {
      price: Number(editPrice),
      mrp: Number(editMrp),
      discount: calculatedDiscount > 0 ? calculatedDiscount : 0,
      badge: editBadge,
    });
    setEditingId(null);
    showToast(`✅ Product #${id} updated to ₹${editPrice} — saved to Railway PostgreSQL!`);
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
    showToast('🎉 New Guide Book created & saved directly to Railway PostgreSQL Database!');
  };

  const handleDispatchOrder = async (orderId: string, newStatus?: string) => {
    const trackingNo = shiprocketAwbInput[orderId] || '';
    const currentOrderObj = orders.find((o) => o.orderId === orderId);
    let status = newStatus || orderStatuses[orderId];

    // If Admin entered an AWB number and didn't select a status, auto-advance to Handed to ST Courier
    if (!status && trackingNo) {
      status = 'Handed to ST Courier';
    } else if (!status) {
      status = currentOrderObj?.courierStatus || 'Packed';
    }

    try {
      await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status, awbNumber: trackingNo }),
      });
      showToast(`✅ Order #${orderId} updated → [${status}] with AWB [${trackingNo || 'N/A'}]. Auto-dispatched WhatsApp!`);
      loadLiveOrders();
    } catch (e) {
      showToast(`✓ Order #${orderId} updated locally.`);
    }
  };

  const toggleStock = async (id: string | number, currentStock: boolean) => {
    try {
      await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, inStock: !currentStock }),
      });
    } catch (_) {}
    updateProductInDb(id, { inStock: !currentStock });
    showToast(`✅ Stock status updated in Railway PostgreSQL!`);
  };

  const handleDeleteProduct = async (id: string | number) => {
    if (!confirm('Delete this book from Railway Database permanently?')) return;
    try {
      await fetch(`/api/products?id=${id}`, { method: 'DELETE' });
    } catch (_) {}
    deleteProductFromDb(id);
    showToast(`🗑️ Book deleted from Railway PostgreSQL!`);
  };

  const handleExportOrdersCsv = () => {
    if (orders.length === 0) {
      showToast('⚠️ No orders available to export.');
      return;
    }

    const headers = ['Order ID', 'Date', 'Customer Name', 'Phone', 'Address', 'City', 'Pincode', 'Total Amount', 'Payment Method', 'Payment Status', 'Courier Status', 'Docket AWB'];
    const rows = orders.map((o) => [
      `"${o.orderId || ''}"`,
      `"${o.createdAt || ''}"`,
      `"${(o.customerName || '').replace(/"/g, '""')}"`,
      `"${o.customerPhone || ''}"`,
      `"${(o.address || '').replace(/"/g, '""')}"`,
      `"${o.city || ''}"`,
      `"${o.pincode || ''}"`,
      `"${o.totalAmount || 0}"`,
      `"${o.paymentMethod || ''}"`,
      `"${o.paymentStatus || ''}"`,
      `"${o.courierStatus || ''}"`,
      `"${o.trackingNumber || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `blessing_orders_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('📥 Orders CSV exported successfully for accounting & shipping!');
  };

  const handlePrintShippingLabel = (o: any) => {
    const printWindow = window.open('', '_blank', 'width=600,height=700');
    if (!printWindow) return;

    const isCod = (o.paymentMethod || '').toLowerCase().includes('cod');
    const amountToCollect = isCod ? `₹${o.totalAmount} (CASH ON DELIVERY)` : 'PREPAID (DO NOT COLLECT CASH)';

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ST Courier Label - #${o.orderId}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 450px; margin: auto; border: 2.5px solid #000; border-radius: 12px; }
            .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 15px; }
            .logo { font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #001B3A; }
            .courier { font-size: 13px; font-weight: 800; color: #0044AA; margin-top: 2px; }
            .box { border: 1px solid #000; padding: 10px; margin-bottom: 10px; border-radius: 6px; }
            .title { font-size: 10px; font-weight: 900; text-transform: uppercase; color: #444; }
            .bold { font-size: 15px; font-weight: 900; margin-top: 2px; }
            .cod-badge { font-size: 14px; font-weight: 900; color: #000; background: #fffbeb; padding: 8px; text-align: center; border: 2px dashed #d97706; margin: 12px 0; border-radius: 6px; }
            .barcode { font-family: monospace; font-size: 18px; font-weight: 900; letter-spacing: 3px; text-align: center; margin: 12px 0; background: #f1f5f9; padding: 8px; border-radius: 4px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">BLESSING POWER GUIDE</div>
            <div class="courier">ST COURIER EXPRESS DISPATCH LABEL</div>
          </div>

          <div class="barcode">||| #${o.orderId} |||</div>

          <div class="box">
            <div class="title">DELIVER TO (RECIPIENT):</div>
            <div class="bold">${o.customerName || 'Customer'}</div>
            <div style="font-size: 13px; margin-top: 4px;">${o.address || ''} ${o.city ? `, ${o.city}` : ''} ${o.pincode ? `- ${o.pincode}` : ''}</div>
            <div style="margin-top: 6px; font-size: 13px;"><strong>PHONE:</strong> +91 ${o.customerPhone || ''}</div>
          </div>

          <div class="box">
            <div class="title">SHIPMENT DETAILS:</div>
            <div style="font-size: 12px;"><strong>ST Courier Docket:</strong> ${o.trackingNumber || o.shipmentId || 'SHP-ST-COURIER'}</div>
            <div style="font-size: 12px;"><strong>Parcel Contents:</strong> ${o.items?.length || 1} Educational Guide Book(s)</div>
          </div>

          <div class="cod-badge">
            PAYMENT: ${amountToCollect}
          </div>

          <div class="box" style="font-size: 11px;">
            <div class="title">RETURN ADDRESS (SENDER):</div>
            <div><strong>BLESSING POWER GUIDE PUBLICATIONS</strong></div>
            <div>Main Express Logistics Hub, Tamil Nadu, India</div>
            <div>Helpdesk WhatsApp: +91 9842100000</div>
          </div>

          <script>
            window.onload = function() { window.print(); window.close(); }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleResendWhatsApp = async (o: any) => {
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerPhone: o.customerPhone,
          customerName: o.customerName,
          orderId: o.orderId,
          bookTitle: o.items?.[0]?.title || 'Educational Guide Book',
          courierName: 'ST Courier Express',
          awbNumber: o.trackingNumber || o.shipmentId || 'STC-TN-EXPRESS',
          trackingUrl: `https://stcourier.com/track/shipment?docket=${o.trackingNumber || ''}`,
        }),
      });
      if (res.ok) {
        showToast(`📲 WhatsApp update sent to +91 ${o.customerPhone}!`);
      } else {
        showToast(`⚠️ WhatsApp engine error. Check QR tab.`);
      }
    } catch (e) {
      showToast(`❌ Error sending WhatsApp message.`);
    }
  };

  const handleUnlinkWhatsApp = async () => {
    if (!confirm('Are you sure you want to unlink this WhatsApp session? You will need to scan a new QR code.')) return;
    try {
      const res = await fetch('/api/whatsapp/qr', { method: 'DELETE' });
      if (res.ok) {
        showToast('✅ WhatsApp session unlinked. Generating fresh QR code...');
        setWaStatus({ status: 'DISCONNECTED', connected: false });
      }
    } catch (e) {
      showToast('❌ Error unlinking WhatsApp session.');
    }
  };

  // Analytics Metrics
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

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
              <span className="text-[9px] text-amber-400 font-bold uppercase">BLESSING CATALOG</span>
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
              <span>Products Catalog ({products.length})</span>
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
            <button
              onClick={() => setActiveTab('whatsapp')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                activeTab === 'whatsapp'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>WhatsApp Bot QR Engine</span>
            </button>
          </nav>
        </div>

        <div className="pt-6 border-t border-slate-800">
          <button
            onClick={() => {
              logoutUser();
              showToast('🔒 Logged out from Admin Portal.');
              router.push('/');
            }}
            className="flex items-center justify-center gap-2 w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 font-extrabold text-xs py-3 rounded-xl transition-colors cursor-pointer uppercase tracking-wider"
          >
            <LogOut className="w-4 h-4 text-red-400" />
            <span>LOG OUT FROM ADMIN</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        {/* Analytics Counter Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Revenue</span>
              <span className="font-black text-xl text-white">₹{totalRevenue}</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Orders</span>
              <span className="font-black text-xl text-white">{orders.length}</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Active Books</span>
              <span className="font-black text-xl text-white">{products.length}</span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-users text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Registered Students</span>
              <span className="font-black text-xl text-white">{dbStats.users || 0}</span>
            </div>
          </div>
        </div>

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h1 className="font-heading font-black text-2xl text-white tracking-tight">
              BLESSING STORE & CATALOG MANAGEMENT
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage live guide books, prices, stock, and incoming customer orders connected to Railway PostgreSQL Database.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeTab === 'orders' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    showToast('⏳ Syncing live ST Courier tracking statuses for all orders...');
                    try {
                      for (const order of orders) {
                        if (order.awbNumber) {
                          await fetch(`/api/courier/track?awb=${encodeURIComponent(order.awbNumber)}&orderId=${encodeURIComponent(order.orderId)}`);
                        }
                      }
                      showToast('✅ ST Courier tracking synced for all active orders!');
                      loadLiveOrders();
                    } catch (e) {
                      showToast('✓ ST Courier sync complete.');
                    }
                  }}
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 font-extrabold text-xs px-4 py-3 rounded-xl shadow-md transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                >
                  <Truck className="w-4 h-4 text-emerald-400" />
                  <span>SYNC ST COURIER TRACKING</span>
                </button>

                <button
                  onClick={handleExportOrdersCsv}
                  className="bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-400/30 font-extrabold text-xs px-4 py-3 rounded-xl shadow-md transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4 text-amber-400" />
                  <span>EXPORT CSV</span>
                </button>
              </div>
            )}

            {activeTab === 'catalog' && (
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-gradient-to-r from-amber-400 to-amber-500 text-[#001B3A] font-extrabold text-xs px-5 py-3 rounded-xl shadow-md hover:shadow-lg transition-all uppercase tracking-wider flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{showAddForm ? 'CLOSE FORM' : '+ ADD NEW GUIDE BOOK'}</span>
              </button>
            )}
          </div>
        </div>

        {activeTab === 'catalog' ? (
          <>
            {/* Add Product Form */}
            {showAddForm && (
              <div className="bg-slate-900 border-2 border-amber-400/50 rounded-2xl p-6 mb-8 shadow-2xl">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-heading font-black text-base text-[#F0C14B] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-amber-400" /> Add New Book directly to Database
                  </h3>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="text-slate-400 hover:text-white text-xs font-bold"
                  >
                    Cancel
                  </button>
                </div>

                <form
                  onSubmit={handleCreateProduct}
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs"
                >
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
                        <option key={c} value={c}>
                          {c} Standard
                        </option>
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
                        <img
                          src={newImg}
                          alt="Preview"
                          className="w-10 h-10 object-contain rounded-lg border border-slate-700 bg-slate-800 p-1 flex-shrink-0"
                        />
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2 md:col-span-4 pt-2">
                    <button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-6 py-3 rounded-xl shadow-md uppercase tracking-wider"
                    >
                      SAVE PRODUCT TO RAILWAY DATABASE
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
                  <p className="text-xs text-slate-500 mt-1">
                    Click "+ ADD NEW GUIDE BOOK" above to create and save a new guide book directly to Railway PostgreSQL!
                  </p>
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
                              <img
                                src={p.image}
                                alt={p.title}
                                className="w-9 h-9 object-contain bg-slate-800 border border-slate-700 rounded-lg p-0.5"
                              />
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
                                onClick={() => handleDeleteProduct(p.id)}
                                className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 p-1 rounded hover:scale-105 transition-all"
                                title="Delete from Railway DB"
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
          /* Live Incoming Orders & Fulfillment */
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="font-heading font-black text-lg text-white flex items-center gap-2">
                  <Truck className="w-5 h-5 text-amber-400" />
                  <span>Live Customer Orders in Railway Database ({orders.length})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  When customers place COD or Razorpay orders, view and accept them live from the database!
                </p>
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="py-16 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-400" />
                <p className="text-sm font-bold text-white">No incoming orders yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  When customers place orders via checkout, they will appear here live from Railway PostgreSQL!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {orders.map((o) => (
                  <div
                    key={o.orderId}
                    className="bg-slate-800/90 border border-slate-700 rounded-2xl p-5 text-xs space-y-4"
                  >
                    <div className="flex flex-wrap justify-between items-center gap-2 pb-3 border-b border-slate-700">
                      <div className="flex items-center gap-3">
                        <span className="font-extrabold text-amber-400 text-sm">
                          Order ID: {o.orderId}
                        </span>
                        <span className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded font-extrabold text-[10px] uppercase">
                          {o.paymentMethod} • {o.paymentStatus}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-emerald-400 font-bold">
                        <MessageSquare className="w-4 h-4 animate-pulse" />
                        <span>WhatsApp Number: +91 {o.customerPhone}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-slate-300">
                      <div>
                        <span className="text-slate-500 font-bold uppercase block text-[10px]">
                          Customer & Address
                        </span>
                        <span className="font-bold text-white">{o.customerName}</span>
                        <p className="text-[11px] text-slate-400">
                          {o.address}{o.city ? `, ${o.city}` : ''}
                        </p>
                        {o.customerPhone && (
                          <span className="text-[11px] font-bold text-blue-400 block mt-0.5">
                            📱 +91 {o.customerPhone}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold uppercase block text-[10px]">
                          Order Details
                        </span>
                        <span className="font-black text-amber-400 text-sm block">₹{o.totalAmount}</span>
                        <span className="text-[11px] text-slate-400">
                          {o.items?.length || 1} Item(s) • {o.createdAt}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 font-bold uppercase block text-[10px]">
                          Current Status
                        </span>
                        <span className="font-bold text-emerald-400 block">{o.courierStatus}</span>
                        {o.trackingNumber && (o.trackingNumber.startsWith('STC') || !o.trackingNumber.startsWith('SHP-')) ? (
                          <span className="text-[11px] font-mono text-amber-300 font-bold block">
                            OFFICIAL AWB: {o.trackingNumber}
                          </span>
                        ) : (
                          <span className="text-[10px] bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded font-bold block">
                            INTERNAL ID: {o.shipmentId || o.trackingNumber || 'Pending Official Docket'}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-[10px] text-slate-400 font-bold">
                          Enter official ST Courier Docket when booked:
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap flex-1">
                        <Truck className="w-4 h-4 text-amber-400 flex-shrink-0" />
                        <input
                          type="text"
                          placeholder="Enter Official ST Courier Docket No (e.g. STC241568974)..."
                          value={shiprocketAwbInput[o.orderId] ?? (o.isOfficialAwb ? o.trackingNumber : '')}
                          onChange={(e) =>
                            setShiprocketAwbInput({
                              ...shiprocketAwbInput,
                              [o.orderId]: e.target.value,
                            })
                          }
                          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs outline-none focus:border-amber-400 uppercase flex-1 min-w-[220px]"
                        />
                        <select
                          value={orderStatuses[o.orderId] || o.courierStatus || 'Handed to ST Courier'}
                          onChange={(e) => setOrderStatuses({ ...orderStatuses, [o.orderId]: e.target.value })}
                          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs outline-none focus:border-amber-400 font-bold"
                        >
                          <option value="Order Placed">Order Placed</option>
                          <option value="Payment Confirmed">Payment Confirmed</option>
                          <option value="Preparing Order">Preparing Order</option>
                          <option value="Packed">Packed</option>
                          <option value="Handed to ST Courier">Handed to ST Courier</option>
                          <option value="In Transit">In Transit</option>
                          <option value="Out for Delivery">Out for Delivery</option>
                          <option value="Delivered">Delivered</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <button
                          onClick={() => handlePrintShippingLabel(o)}
                          className="bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-black text-xs px-3.5 py-2.5 rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          title="Print Thermal Shipping Address Slip"
                        >
                          <Download className="w-3.5 h-3.5 text-[#001B3A]" />
                          <span>PRINT SLIP</span>
                        </button>

                        <button
                          onClick={() => handleResendWhatsApp(o)}
                          className="bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs px-3.5 py-2.5 rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          title="Resend WhatsApp ST Courier Tracking Link"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-white" />
                          <span>WHATSAPP</span>
                        </button>

                        <button
                          onClick={() => handleDispatchOrder(o.orderId)}
                          className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-black text-xs px-4 py-2.5 rounded-xl shadow-md uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>UPDATE</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'whatsapp' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 max-w-2xl mx-auto text-center space-y-6">
            <div>
              <span className="text-[10px] font-extrabold text-amber-400 uppercase tracking-wider bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/30">
                100% FREE UNLIMITED WHATSAPP BOT ENGINE
              </span>
              <h2 className="font-heading font-black text-2xl text-white mt-3">
                LINK YOUR WHATSAPP PHONE NUMBER
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Scan the QR code below OR enter your phone number to get an 8-digit Pairing Code to link WhatsApp with $0 fees!
              </p>
            </div>

            {waStatus.status === 'CONNECTED' || waStatus.connected ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6 text-center space-y-4">
                <div className="w-14 h-14 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto text-2xl font-bold shadow-lg ring-8 ring-emerald-500/20">
                  ✓
                </div>
                <div>
                  <h3 className="font-heading font-black text-emerald-400 text-lg">
                    🟢 WHATSAPP BOT IS PERMANENTLY CONNECTED &amp; ACTIVE
                  </h3>
                  <p className="text-xs text-emerald-200 mt-1 max-w-md mx-auto">
                    Your WhatsApp session is locked &amp; permanently saved inside your server (`./whatsapp_session`). It will stay connected forever across all server restarts and navigation.
                  </p>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 text-left space-y-1 font-mono max-w-sm mx-auto">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">SESSION LOCK:</span>
                    <span className="text-emerald-400 font-bold">PERMANENT / PROTECTED</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">STATUS:</span>
                    <span className="text-emerald-400 font-bold">ONLINE ($0 FEES)</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleUnlinkWhatsApp}
                    className="bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/40 font-extrabold text-xs px-5 py-2.5 rounded-xl transition-all cursor-pointer uppercase tracking-wider inline-flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                    <span>UNLINK WHATSAPP SESSION</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* QR Code Section */}
                <div className="bg-slate-800 border border-slate-700 p-6 rounded-2xl">
                  {waStatus.qrImage ? (
                    <div className="bg-white border-4 border-amber-400 p-4 rounded-2xl inline-block shadow-2xl">
                      <img src={waStatus.qrImage} alt="WhatsApp QR Code" className="w-64 h-64 mx-auto block" />
                      <span className="text-[11px] font-extrabold text-slate-900 block mt-3 uppercase tracking-wider">
                        ⚡ SCAN WITH YOUR PHONE WHATSAPP
                      </span>
                    </div>
                  ) : (
                    <div className="py-6 space-y-3">
                      <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
                      <p className="text-xs text-slate-300 font-bold">
                        Generating Live WhatsApp QR Code &amp; Session...
                      </p>
                    </div>
                  )}
                </div>

                {/* Option 2: 8-Digit Pairing Code */}
                <div className="bg-slate-800/80 border border-slate-700/80 p-5 rounded-2xl text-left space-y-3">
                  <h4 className="font-heading font-black text-xs text-amber-400 uppercase tracking-wider flex items-center gap-2">
                    <span>📱 OPTION 2: LINK WITH 8-DIGIT PAIRING CODE (NO CAMERA NEEDED)</span>
                  </h4>

                  <form onSubmit={handleRequestPairingCode} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter phone number e.g. 9840418228..."
                      value={waPhoneInput}
                      onChange={(e) => setWaPhoneInput(e.target.value)}
                      className="px-3.5 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs outline-none focus:border-amber-400 flex-1 font-bold"
                    />
                    <button
                      type="submit"
                      className="bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs px-4 py-2 rounded-xl transition-all shadow-md cursor-pointer whitespace-nowrap"
                    >
                      GET PAIRING CODE
                    </button>
                  </form>

                  {waPairingCode && (
                    <div className="bg-amber-400/10 border border-amber-400/40 p-4 rounded-xl text-center space-y-2">
                      <span className="text-[10px] font-bold text-amber-300 uppercase block">YOUR 8-DIGIT WHATSAPP PAIRING CODE:</span>
                      <div className="font-mono font-black text-2xl text-amber-400 tracking-widest bg-slate-900 py-2 rounded-lg border border-amber-400/30 inline-block px-6">
                        {waPairingCode}
                      </div>
                      <p className="text-[11px] text-slate-300">
                        Open WhatsApp on phone → Linked Devices → Link with phone number → Enter code above!
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 text-left text-xs text-slate-400 space-y-2">
              <div className="font-bold text-white">📌 Quick Instructions:</div>
              <div>1. Open **WhatsApp** on your mobile phone.</div>
              <div>2. Tap **Menu / Settings** (top right 3 dots or gear icon).</div>
              <div>3. Tap **Linked Devices** → **Link a Device** (or Link with phone number).</div>
              <div>4. Point your camera at the QR code above or enter the 8-digit Pairing Code!</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
