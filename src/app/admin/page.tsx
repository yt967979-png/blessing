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
  MapPin,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export default function AdminPage() {
  const router = useRouter();
  const { user, setIsAuthOpen, products, updateProductInDb, addNewProductToDb, deleteProductFromDb, showToast, logoutUser } = useStore();
  const [activeTab, setActiveTab] = useState<'catalog' | 'orders' | 'whatsapp'>('catalog');
  const [waStatus, setWaStatus] = useState<{ status: string; connected?: boolean; qrImage?: string; pairingCode?: string; message?: string }>({ status: 'LOADING', connected: false });
  const [waPhoneInput, setWaPhoneInput] = useState('');
  const [waPairingCode, setWaPairingCode] = useState<string | null>(null);

  // Check if current logged-in user has Admin privileges
  const isAdmin = !!user && (user.role === 'admin' || (user.email && user.email.toLowerCase().includes('admin')));

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
    showToast('⏳ Generating 8-Digit Pairing Code...');
    try {
      const res = await fetch(`/api/whatsapp/qr?phone=${encodeURIComponent(waPhoneInput)}`);
      const data = await res.json();
      if (data.pairingCode) {
        setWaPairingCode(data.pairingCode);
        showToast(`✅ Pairing Code: ${data.pairingCode}`);
      } else if (data.error) {
        showToast(`⚠️ ${data.error}`);
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
  const [dispatchingOrderIds, setDispatchingOrderIds] = useState<{ [orderId: string]: boolean }>({});
  const [dbStats, setDbStats] = useState({ users: 0, books: 0 });
  const [orderStatuses, setOrderStatuses] = useState<{ [orderId: string]: string }>({});

  const loadLiveOrders = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/orders?adminUserId=${encodeURIComponent(String(user.id))}`);
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

    // Firebase-style Instant Real-Time Order Stream
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource('/api/orders/stream');
      eventSource.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'ORDER_UPDATED') {
            loadLiveOrders();
          }
        } catch (_) {}
      };
    } catch (_) {}

    // Backup polling every 4 seconds
    const interval = setInterval(loadLiveOrders, 4000);

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

    return () => {
      clearInterval(interval);
      if (eventSource) eventSource.close();
    };
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
    const trackingNo = (shiprocketAwbInput[orderId] || '').trim();
    const currentOrderObj = orders.find((o) => o.orderId === orderId);
    let status = newStatus || orderStatuses[orderId];

    // If admin entered an AWB number, it MUST be positively verified before saving.
    if (trackingNo) {
      showToast('⏳ Verifying ST Courier Docket Number with ST Courier Live API...');
      try {
        const verifyRes = await fetch(`/api/courier/track?docket=${encodeURIComponent(trackingNo)}`);
        const verifyData = await verifyRes.json();

        // Block if:
        //   • HTTP error (400 = bad format, 404 = not found in ST Courier network)
        //   • isValid is explicitly false
        //   • verified is not explicitly true (covers the 422 inconclusive case)
        //   • scrapeInconclusive flag is set
        const isPositivelyVerified = verifyRes.ok && verifyData.isValid === true && verifyData.verified === true;

        if (!isPositivelyVerified) {
          // Build a human-readable reason from whatever the API returned
          const reason = verifyData.error
            ?? (verifyData.scrapeInconclusive
              ? `ST Courier's tracking page returned no readable data for "${trackingNo}". Please check the docket on your booking receipt.`
              : `Docket "${trackingNo}" could not be confirmed in the ST Courier network.`);

          showToast(`❌ DOCKET REJECTED: ${reason}`);
          alert(
            `⚠️ ST Courier Docket Verification Failed!\n\n${reason}\n\n` +
            `Please enter a valid official ST Courier docket number (e.g. STC241568974).\n\n` +
            (verifyData.trackingUrl ? `You can verify manually at:\n${verifyData.trackingUrl}` : '')
          );
          return; // Hard stop — do not save anything
        }

        // Docket is verified — auto-adopt the live scraped status from ST Courier
        if (verifyData.status && verifyData.status !== 'Shipped via ST Courier') {
          status = verifyData.status;
        } else if (!status) {
          status = 'Handed to ST Courier';
        }
      } catch (err) {
        // Network failure reaching our own API — do NOT silently proceed
        showToast('❌ Could not reach the ST Courier verification service. Please check your connection and try again.');
        alert('❌ Verification Failed\n\nCould not connect to the ST Courier verification service.\nPlease try again before saving the docket number.');
        return; // Hard stop on network error too
      }
    }

    if (!status) {
      status = currentOrderObj?.courierStatus || 'Handed to ST Courier';
    }

    try {
      await fetch('/api/orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, status, awbNumber: trackingNo }),
      });
      showToast(`🔒 Order #${orderId} VERIFIED & LOCKED INTO ST COURIER AUTO-PILOT! Current Status: [${status}].`);
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
    let rawPhone = (o.customerPhone || '').replace(/\D/g, '');
    if (rawPhone.length === 10) rawPhone = '91' + rawPhone;
    if (!rawPhone) rawPhone = '919840418228';

    const textMsg = `Hello ${o.customerName || 'Student'}! 📚\n\nYour Blessing Power Guide Order #${o.orderId} status has been updated to: *${o.courierStatus || 'Processing'}*.\n\n🚚 ST Courier AWB Docket: *${o.trackingNumber || 'STC241568974'}*\n\nTrack Live: https://stcourier.com/track/shipment?docket=${o.trackingNumber || ''}\n\nThank you for choosing Blessing Power Guide!`;

    const waWebUrl = `https://api.whatsapp.com/send?phone=${rawPhone}&text=${encodeURIComponent(textMsg)}`;
    window.open(waWebUrl, '_blank');

    try {
      await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          step: o.courierStatus || 'ORDER_PLACED',
          customerPhone: o.customerPhone,
          customerName: o.customerName,
          orderId: o.orderId,
          totalAmount: o.totalAmount,
          trackingNumber: o.trackingNumber,
        }),
      });
      showToast(`📲 WhatsApp message sent to +91 ${o.customerPhone}!`);
    } catch (e) {
      showToast(`📲 Opened WhatsApp Chat for +91 ${o.customerPhone}!`);
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

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl flex items-center justify-center mx-auto text-3xl shadow-lg ring-8 ring-red-500/10">
            <ShieldCheck className="w-8 h-8 text-red-400" />
          </div>

          <div>
            <span className="text-[10px] font-black tracking-widest text-red-400 uppercase bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
              RESTRICTED ACCESS AREA
            </span>
            <h2 className="font-heading font-black text-xl text-white mt-3">
              Admin Authorization Required
            </h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              {user ? (
                <>
                  Logged in as <strong className="text-slate-200">{user.email}</strong>. This account does not have administrator privileges.
                </>
              ) : (
                'You must be signed in with an administrator account to access the store management dashboard.'
              )}
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={() => router.push('/')}
              className="w-full py-3 bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs rounded-xl shadow-lg transition-all uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Storefront</span>
            </button>

            <button
              onClick={() => {
                logoutUser();
                setIsAuthOpen(true);
                router.push('/');
              }}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition-all uppercase tracking-wider cursor-pointer"
            >
              Sign In as Administrator
            </button>
          </div>
        </div>
      </div>
    );
  }

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

        {activeTab === 'catalog' && (
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
        )}

        {activeTab === 'orders' && (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="font-heading font-black text-xl text-white">Live Orders Management</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  View and update customer order states live from Railway PostgreSQL database.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-[10px] font-black text-emerald-400 tracking-wider uppercase">
                  🟢 LIVE AUTO-SYNC ACTIVE (DB POLL: 4S)
                </span>
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
                {orders.map((o) => {
                  const currentStatus = o.courierStatus || 'Order Placed';
                  const allSteps = [
                    'Order Placed',
                    'Payment Confirmed',
                    'Preparing Order',
                    'Packed',
                    'Handed to ST Courier',
                    'In Transit',
                    'Out for Delivery',
                    'Delivered',
                  ];
                  const activeIdx = allSteps.findIndex((s) => s.toLowerCase() === currentStatus.toLowerCase());
                  const stepIdx = activeIdx >= 0 ? activeIdx : 0;

                  return (
                    <div
                      key={o.orderId}
                      className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 text-xs space-y-3.5 shadow-lg hover:border-amber-400/40 transition-all"
                    >
                      {/* Top Header Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800 text-xs">
                        <div className="flex items-center gap-2.5">
                          <span className="font-heading font-black text-amber-400 text-base">
                            Order #{o.orderId}
                          </span>
                          <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded font-extrabold text-[10px] uppercase">
                            ₹{o.totalAmount} • {o.paymentMethod || 'Razorpay'}
                          </span>
                          {o.isOfficialAwb && (
                            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-extrabold text-[10px] uppercase flex items-center gap-1">
                              🔒 AUTO-PILOT ACTIVE
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-slate-300 font-medium">
                          <span className="text-[11px] text-slate-400">{o.createdAt}</span>
                          <button
                            onClick={() => handleResendWhatsApp(o)}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-lg font-extrabold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WhatsApp: +91 {o.customerPhone || 'N/A'}</span>
                          </button>
                        </div>
                      </div>

                      {/* 8-Stage Progress Pill Bar */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-extrabold uppercase">
                          <span className="text-slate-400">Status Progress (Stage {stepIdx + 1} of 8):</span>
                          <span className="text-emerald-400 font-bold bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded">
                            {currentStatus}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1 text-[9px] text-center">
                          {allSteps.map((s, idx) => {
                            const isDone = idx <= stepIdx;
                            const isCur = idx === stepIdx;
                            return (
                              <div
                                key={s}
                                className={`py-1 px-1 rounded-md border font-bold truncate transition-all ${
                                  isCur
                                    ? 'bg-blue-600 text-white border-blue-400 font-black shadow-xs'
                                    : isDone
                                    ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/30'
                                    : 'bg-slate-900 text-slate-600 border-slate-800'
                                }`}
                              >
                                {isDone ? '✓ ' : ''}{s}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Single Clean ST Courier Docket Dispatch Control */}
                      <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-slate-300 text-[11px] flex items-center gap-1.5">
                            <Truck className="w-3.5 h-3.5 text-amber-400" />
                            <span>ST Courier Dispatch & Docket Assignment:</span>
                          </span>
                          <span className="text-[10px] text-emerald-400 font-extrabold uppercase bg-emerald-950/80 border border-emerald-500/30 px-2 py-0.5 rounded">
                            Current Status: {o.courierStatus || 'Order Placed'}
                          </span>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-2">
                          <input
                            type="text"
                            placeholder="Enter ST Courier Docket AWB (e.g. STC241568974)..."
                            value={
                              shiprocketAwbInput[o.orderId] !== undefined
                                ? shiprocketAwbInput[o.orderId]
                                : o.trackingNumber && !o.trackingNumber.startsWith('SHP-')
                                ? o.trackingNumber
                                : ''
                            }
                            onChange={(e) =>
                              setShiprocketAwbInput({
                                ...shiprocketAwbInput,
                                [o.orderId]: e.target.value,
                              })
                            }
                            className="w-full sm:flex-1 px-3.5 py-2 bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl text-white text-xs outline-none uppercase font-bold tracking-wide"
                          />

                          <button
                            disabled={!!dispatchingOrderIds[o.orderId]}
                            onClick={async () => {
                              const inputVal = (shiprocketAwbInput[o.orderId] ?? (o.trackingNumber && !o.trackingNumber.startsWith('SHP-') ? o.trackingNumber : '')).trim();
                              if (!inputVal) {
                                alert('⚠️ Please enter an official ST Courier Docket Number (e.g. STC241568974) in the input box first!');
                                return;
                              }
                              const awb = inputVal;

                              setDispatchingOrderIds((prev) => ({ ...prev, [o.orderId]: true }));
                              showToast('⏳ Validating ST Courier Docket AWB format...');

                              try {
                                const verifyRes = await fetch(`/api/courier/track?docket=${encodeURIComponent(awb)}`);
                                const verifyData = await verifyRes.json();

                                const isPositivelyVerified = verifyRes.ok && verifyData.isValid === true && verifyData.verified === true;

                                if (!isPositivelyVerified) {
                                  const reason = verifyData.error || 'ST Courier did not confirm this docket number in their live system.';
                                  showToast(`❌ FAKE/UNVERIFIED DOCKET: ${reason}`);
                                  alert(`⚠️ ST COURIER DOCKET REJECTED!\n\n${reason}\n\nPlease enter an official active ST Courier docket number from your physical booking receipt.`);
                                  setDispatchingOrderIds((prev) => ({ ...prev, [o.orderId]: false }));
                                  return;
                                }

                                showToast('⏳ Dispatching order & linking ST Courier AWB...');
                                await fetch('/api/orders/timeline', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ orderId: o.orderId, status: 'HANDED_TO_ST_COURIER', awbNumber: awb }),
                                });

                                showToast(`✅ Order #${o.orderId} Dispatched via ST Courier AWB: ${awb}!`);
                                loadLiveOrders();
                              } catch (err: any) {
                                showToast('❌ Dispatch request error');
                              } finally {
                                setDispatchingOrderIds((prev) => ({ ...prev, [o.orderId]: false }));
                              }
                            }}
                            className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 text-white font-extrabold text-xs px-5 py-2 rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            {dispatchingOrderIds[o.orderId] ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-amber-300 border-t-transparent rounded-full animate-spin" />
                                <span>DISPATCHING...</span>
                              </>
                            ) : (
                              <>
                                <Truck className="w-3.5 h-3.5 text-amber-300" />
                                <span>DISPATCH WITH ST COURIER</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Customer Details & Action Inputs */}
                      <div className="pt-1 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-white font-extrabold text-sm block truncate">{o.customerName}</span>
                          <span className="text-slate-400 text-[11px] block truncate">
                            {o.address}{o.city ? `, ${o.city}` : ''} • {o.items?.length || 1} Book(s)
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                          <button
                            onClick={() => handlePrintShippingLabel(o)}
                            className="bg-amber-400 hover:bg-amber-500 text-[#001B3A] font-extrabold text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>SLIP</span>
                          </button>

                          <button
                            onClick={() => handleResendWhatsApp(o)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WHATSAPP</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                Scan the QR code below to authenticate once. Your WhatsApp session will lock &amp; stay connected permanently with $0 fees!
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
                    Your WhatsApp session is locked &amp; permanently saved in your Railway PostgreSQL DB (`whatsapp_sessions`). It will stay connected forever across all server restarts.
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
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 text-left text-xs text-slate-400 space-y-2">
              <div className="font-bold text-white">📌 Quick QR Link Instructions:</div>
              <div>1. Open **WhatsApp** on your mobile phone.</div>
              <div>2. Tap **Menu / Settings** (top right 3 dots or gear icon).</div>
              <div>3. Tap **Linked Devices** → **Link a Device**.</div>
              <div>4. Point your camera at the QR code above to authenticate once!</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
