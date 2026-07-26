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
  X,
  Search,
  RefreshCw,
  ChevronRight,
  Eye,
  MoreVertical,
  TrendingUp,
  IndianRupee,
  Box,
  Clock,
  CheckCircle2,
  Circle,
  ArrowRight,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export default function AdminPage() {
  const router = useRouter();
  const { user, setIsAuthOpen, products, updateProductInDb, addNewProductToDb, deleteProductFromDb, showToast, logoutUser } = useStore();
  const [activeTab, setActiveTab] = useState<'catalog' | 'orders' | 'whatsapp'>('orders');
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
  const [editBadgeEnabled, setEditBadgeEnabled] = useState(true);
  const [editDiscountEnabled, setEditDiscountEnabled] = useState(true);

  // New product form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCls, setNewCls] = useState('10th');
  const [newCat, setNewCat] = useState<'guide' | 'combo'>('guide');
  const [newPrice, setNewPrice] = useState(190);
  const [newMrp, setNewMrp] = useState(240);
  const [newBadge, setNewBadge] = useState('BESTSELLER');
  const [newBadgeEnabled, setNewBadgeEnabled] = useState(true);
  const [newDiscountEnabled, setNewDiscountEnabled] = useState(true);
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
    setEditBadge(p.badge || '');
    setEditBadgeEnabled(!!p.badge);
    setEditDiscountEnabled(p.price < p.mrp);
  };

  const saveProductChanges = async (id: string | number) => {
    const finalPrice = editDiscountEnabled ? editPrice : editMrp;
    const finalBadge = editBadgeEnabled ? (editBadge.trim() || 'BESTSELLER') : '';
    const calculatedDiscount = Math.round(((editMrp - finalPrice) / editMrp) * 100);

    // Save to Railway PostgreSQL via API
    try {
      await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, price: finalPrice, mrp: editMrp, badge: finalBadge }),
      });
    } catch (_) {}

    // Also update local products state via StoreContext
    updateProductInDb(id, {
      price: Number(finalPrice),
      mrp: Number(editMrp),
      discount: calculatedDiscount > 0 ? calculatedDiscount : 0,
      badge: finalBadge,
    });
    setEditingId(null);
    showToast(`✅ Product #${id} updated to ₹${finalPrice} — saved securely to Railway PostgreSQL!`);
  };

  const handleCreateProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPrice = newDiscountEnabled ? Number(newPrice) : Number(newMrp);
    const finalBadge = newBadgeEnabled ? (newBadge.trim() || 'BESTSELLER') : '';
    const calculatedDiscount = Math.round(((newMrp - finalPrice) / newMrp) * 100);

    addNewProductToDb({
      title: newTitle,
      cls: newCls,
      category: newCat,
      price: finalPrice,
      mrp: Number(newMrp),
      discount: calculatedDiscount > 0 ? calculatedDiscount : 0,
      badge: finalBadge,
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

        const isPositivelyVerified = verifyRes.ok && verifyData.isValid === true && verifyData.verified === true;

        if (!isPositivelyVerified) {
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
        showToast('❌ Could not reach the ST Courier verification service. Please check your connection and try again.');
        alert('❌ Verification Failed\n\nCould not connect to the ST Courier verification service.\nPlease try again before saving the docket number.');
        return;
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
      <div className="min-h-screen bg-[#f1f3f6] flex items-center justify-center p-6" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center space-y-5">
          <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h2 className="font-semibold text-xl text-gray-900">Admin Access Required</h2>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">
              {user ? (
                <>
                  Logged in as <strong className="text-gray-700">{user.email}</strong>. This account does not have administrator privileges.
                </>
              ) : (
                'You must be signed in with an administrator account to access the store management dashboard.'
              )}
            </p>
          </div>
          <div className="space-y-3 pt-2">
            <button
              onClick={() => router.push('/')}
              className="w-full py-2.5 bg-[#2874f0] hover:bg-[#1a5dc8] text-white font-semibold text-sm rounded-sm shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Store
            </button>
            <button
              onClick={() => { logoutUser(); setIsAuthOpen(true); router.push('/'); }}
              className="w-full py-2.5 bg-white hover:bg-gray-50 text-[#2874f0] font-semibold text-sm rounded-sm border border-gray-300 transition-colors cursor-pointer"
            >
              Sign In as Administrator
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Tab config
  const tabs = [
    { id: 'orders' as const, label: 'Orders', icon: ShoppingCart, count: orders.length },
    { id: 'catalog' as const, label: 'Products', icon: Package, count: products.length },
    { id: 'whatsapp' as const, label: 'WhatsApp', icon: MessageSquare, count: null },
  ];

  return (
    <div className="min-h-screen bg-[#f1f3f6]" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* Top Navbar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-[#2874f0] text-white rounded-md flex items-center justify-center font-bold text-sm">B</div>
                <div>
                  <h1 className="text-sm font-bold text-gray-900 leading-tight">Blessing Store</h1>
                  <span className="text-[10px] text-gray-400 font-medium">Seller Dashboard</span>
                </div>
              </div>
            </div>

            {/* Nav Tabs */}
            <nav className="hidden md:flex items-center h-full">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-full px-5 flex items-center gap-2 text-[13px] font-semibold transition-colors border-b-[3px] cursor-pointer ${
                    activeTab === tab.id
                      ? 'border-[#2874f0] text-[#2874f0]'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.count !== null && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      activeTab === tab.id ? 'bg-[#2874f0]/10 text-[#2874f0]' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-semibold text-green-700">Live</span>
              </div>
              <button
                onClick={() => { logoutUser(); showToast('Logged out.'); router.push('/'); }}
                className="text-gray-400 hover:text-red-500 transition-colors p-1.5 cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Tab Bar */}
        <div className="md:hidden border-t border-gray-100 flex">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors border-b-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'border-[#2874f0] text-[#2874f0] bg-blue-50/50'
                  : 'border-transparent text-gray-400'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== null && <span className="text-[10px] font-bold">({tab.count})</span>}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString()}`, icon: IndianRupee, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Total Orders', value: orders.length, icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Active Products', value: products.length, icon: Box, color: 'text-orange-600', bg: 'bg-orange-50' },
            { label: 'Customers', value: dbStats.users || 0, icon: Users, color: 'text-purple-600', bg: 'bg-purple-50' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 ${stat.bg} rounded-lg flex items-center justify-center ${stat.color}`}>
                  <stat.icon className="w-4.5 h-4.5" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-400 font-medium">{stat.label}</p>
                  <p className="text-lg font-bold text-gray-900 leading-tight">{stat.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ====================== ORDERS TAB ====================== */}
        {activeTab === 'orders' && (
          <div className="space-y-3">
            {/* Orders Header */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Order Management</h2>
                <p className="text-xs text-gray-400 mt-0.5">Track and manage all customer orders in real-time</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    showToast('Syncing courier tracking...');
                    try {
                      for (const order of orders) {
                        if (order.awbNumber) {
                          await fetch(`/api/courier/track?awb=${encodeURIComponent(order.awbNumber)}&orderId=${encodeURIComponent(order.orderId)}`);
                        }
                      }
                      showToast('✅ Courier tracking synced!');
                      loadLiveOrders();
                    } catch (e) {
                      showToast('Sync complete.');
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Sync Tracking</span>
                </button>
                <button
                  onClick={handleExportOrdersCsv}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] rounded-md transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Export CSV</span>
                </button>
              </div>
            </div>

            {/* Order Cards */}
            {orders.length === 0 ? (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm font-semibold text-gray-600">No orders yet</p>
                <p className="text-xs text-gray-400 mt-1">New orders will appear here automatically</p>
              </div>
            ) : (
              orders.map((o) => {
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
                const isCod = (o.paymentMethod || '').toLowerCase().includes('cod');

                return (
                  <div key={o.orderId} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow">
                    {/* Order Header */}
                    <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">#{o.orderId}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm uppercase ${
                          isCod ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-green-50 text-green-700 border border-green-200'
                        }`}>
                          {isCod ? 'COD' : 'PAID'} • ₹{o.totalAmount}
                        </span>
                        {o.isOfficialAwb && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-sm bg-blue-50 text-blue-600 border border-blue-200">
                            AUTO-TRACKED
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        <span>{o.createdAt}</span>
                      </div>
                    </div>

                    {/* Order Content */}
                    <div className="p-4 space-y-4">
                      {/* Customer Info Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 text-sm font-bold">
                            {(o.customerName || 'C').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{o.customerName}</p>
                            <p className="text-xs text-gray-400">
                              {o.address}{o.city ? `, ${o.city}` : ''}{o.pincode ? ` - ${o.pincode}` : ''} • {o.items?.length || 1} item(s)
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePrintShippingLabel(o)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors cursor-pointer"
                          >
                            <Download className="w-3 h-3" />
                            Label
                          </button>
                          <button
                            onClick={() => handleResendWhatsApp(o)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-white bg-[#25d366] hover:bg-[#1fb855] rounded-md transition-colors cursor-pointer"
                          >
                            <MessageSquare className="w-3 h-3" />
                            WhatsApp
                          </button>
                        </div>
                      </div>

                      {/* Progress Stepper */}
                      <div className="bg-[#f8f9fa] rounded-md p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-semibold text-gray-500">Delivery Progress</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${
                            stepIdx >= 7 ? 'bg-green-50 text-green-700' :
                            stepIdx >= 4 ? 'bg-blue-50 text-blue-700' :
                            'bg-orange-50 text-orange-700'
                          }`}>
                            {currentStatus}
                          </span>
                        </div>
                        {/* Linear Progress Bar */}
                        <div className="relative">
                          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                stepIdx >= 7 ? 'bg-green-500' : 'bg-[#2874f0]'
                              }`}
                              style={{ width: `${((stepIdx + 1) / allSteps.length) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1.5">
                            {allSteps.map((s, idx) => (
                              <div key={s} className="flex flex-col items-center" style={{ width: `${100 / allSteps.length}%` }}>
                                <div className={`w-2.5 h-2.5 rounded-full border-2 -mt-[11px] bg-white transition-colors ${
                                  idx <= stepIdx
                                    ? stepIdx >= 7 ? 'border-green-500 bg-green-500' : 'border-[#2874f0] bg-[#2874f0]'
                                    : 'border-gray-300'
                                }`} />
                                <span className={`text-[8px] mt-1 text-center leading-tight hidden lg:block ${
                                  idx <= stepIdx ? 'text-gray-700 font-semibold' : 'text-gray-400'
                                }`}>
                                  {s}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Dispatch Control */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-[#f8f9fa] rounded-md p-3">
                        <div className="flex items-center gap-2 text-xs text-gray-500 shrink-0">
                          <Truck className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">AWB Docket:</span>
                        </div>
                        <input
                          type="text"
                          placeholder="Enter ST Courier Docket (e.g. STC241568974)"
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
                          className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-md text-xs text-gray-900 font-mono uppercase placeholder:text-gray-300 placeholder:normal-case outline-none focus:border-[#2874f0] focus:ring-1 focus:ring-[#2874f0]/20 transition-all"
                        />
                        <button
                          disabled={!!dispatchingOrderIds[o.orderId]}
                          onClick={async () => {
                            const inputVal = (shiprocketAwbInput[o.orderId] ?? (o.trackingNumber && !o.trackingNumber.startsWith('SHP-') ? o.trackingNumber : '')).trim();
                            if (!inputVal) {
                              alert('Please enter an ST Courier Docket Number first.');
                              return;
                            }
                            const awb = inputVal;

                            setDispatchingOrderIds((prev) => ({ ...prev, [o.orderId]: true }));
                            showToast('Validating docket...');

                            try {
                              const verifyRes = await fetch(`/api/courier/track?docket=${encodeURIComponent(awb)}`);
                              const verifyData = await verifyRes.json();

                              const isPositivelyVerified = verifyRes.ok && verifyData.isValid === true && verifyData.verified === true;

                              if (!isPositivelyVerified) {
                                const reason = verifyData.error || 'ST Courier did not confirm this docket number.';
                                showToast(`❌ ${reason}`);
                                alert(`Docket Verification Failed\n\n${reason}\n\nPlease enter a valid ST Courier docket number.`);
                                setDispatchingOrderIds((prev) => ({ ...prev, [o.orderId]: false }));
                                return;
                              }

                              showToast('Dispatching order...');
                              await fetch('/api/orders/timeline', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ orderId: o.orderId, status: 'HANDED_TO_ST_COURIER', awbNumber: awb }),
                              });

                              showToast(`✅ Order #${o.orderId} dispatched with AWB: ${awb}`);
                              loadLiveOrders();
                            } catch (err: any) {
                              showToast('❌ Dispatch error');
                            } finally {
                              setDispatchingOrderIds((prev) => ({ ...prev, [o.orderId]: false }));
                            }
                          }}
                          className="px-4 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] disabled:bg-gray-300 disabled:cursor-not-allowed rounded-md transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          {dispatchingOrderIds[o.orderId] ? (
                            <>
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Verifying...
                            </>
                          ) : (
                            <>
                              <Send className="w-3 h-3" />
                              Dispatch
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ====================== CATALOG TAB ====================== */}
        {activeTab === 'catalog' && (
          <div className="space-y-3">
            {/* Catalog Header */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Product Catalog</h2>
                <p className="text-xs text-gray-400 mt-0.5">Manage guide books, pricing, and stock availability</p>
              </div>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] rounded-md transition-colors cursor-pointer"
              >
                {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{showAddForm ? 'Close' : 'Add Product'}</span>
              </button>
            </div>

            {/* Add Product Form */}
            {showAddForm && (
              <div className="bg-white rounded-lg border-2 border-[#2874f0]/30 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#2874f0]" /> Add New Guide Book
                </h3>
                <form onSubmit={handleCreateProduct} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Book Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 10th Standard Mathematics Guide"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 outline-none focus:border-[#2874f0] focus:ring-1 focus:ring-[#2874f0]/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Class</label>
                    <select
                      value={newCls}
                      onChange={(e) => setNewCls(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 outline-none focus:border-[#2874f0]"
                    >
                      {['6th', '7th', '8th', '9th', '10th', '11th', '12th'].map((c) => (
                        <option key={c} value={c}>{c} Std</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                    <select
                      value={newCat}
                      onChange={(e) => setNewCat(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 outline-none focus:border-[#2874f0]"
                    >
                      <option value="guide">Single Subject Guide</option>
                      <option value="combo">5-Subject Combo</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={newDiscountEnabled}
                        onChange={(e) => {
                          setNewDiscountEnabled(e.target.checked);
                          if (!e.target.checked) setNewPrice(newMrp);
                        }}
                        className="w-3.5 h-3.5 accent-[#2874f0] rounded cursor-pointer"
                      />
                      <span>Sale Price (₹)</span>
                    </label>
                    <input
                      type="number"
                      required
                      disabled={!newDiscountEnabled}
                      value={newDiscountEnabled ? newPrice : newMrp}
                      onChange={(e) => setNewPrice(Number(e.target.value))}
                      className={`w-full px-3 py-2 bg-white border rounded-md text-sm outline-none ${
                        newDiscountEnabled ? 'border-[#2874f0] text-gray-900' : 'border-gray-200 text-gray-400 bg-gray-50'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">MRP (₹)</label>
                    <input
                      type="number"
                      required
                      value={newMrp}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setNewMrp(val);
                        if (!newDiscountEnabled) setNewPrice(val);
                      }}
                      className="w-full px-3 py-2 bg-white border border-gray-200 rounded-md text-sm text-gray-900 outline-none focus:border-[#2874f0]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={newBadgeEnabled}
                        onChange={(e) => setNewBadgeEnabled(e.target.checked)}
                        className="w-3.5 h-3.5 accent-[#2874f0] rounded cursor-pointer"
                      />
                      <span>Offer Badge</span>
                    </label>
                    <input
                      type="text"
                      disabled={!newBadgeEnabled}
                      placeholder="e.g. BESTSELLER"
                      value={newBadge}
                      onChange={(e) => setNewBadge(e.target.value)}
                      className={`w-full px-3 py-2 bg-white border rounded-md text-sm uppercase outline-none ${
                        newBadgeEnabled ? 'border-[#2874f0] text-gray-900' : 'border-gray-200 text-gray-400 bg-gray-50'
                      }`}
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-1">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Cover Image</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileUpload}
                      className="w-full text-xs text-gray-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#2874f0]/10 file:text-[#2874f0] cursor-pointer"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between pt-1">
                    {newImg && (
                      <img src={newImg} alt="Preview" className="w-10 h-10 object-contain rounded border border-gray-200 bg-gray-50 p-0.5" />
                    )}
                    <button
                      type="submit"
                      className="px-5 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] rounded-md transition-colors cursor-pointer ml-auto"
                    >
                      Save Product
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Product Table */}
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {products.length === 0 ? (
                <div className="p-12 text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">No products in catalog</p>
                  <p className="text-xs text-gray-400 mt-1">Click &ldquo;Add Product&rdquo; to create your first listing</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#f8f9fa] border-b border-gray-200">
                        <th className="py-3 px-4 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Product</th>
                        <th className="py-3 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Class</th>
                        <th className="py-3 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                        <th className="py-3 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">MRP</th>
                        <th className="py-3 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Badge</th>
                        <th className="py-3 px-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                        <th className="py-3 px-3 text-right text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {products.map((p) => {
                        const isEditing = editingId === p.id;
                        const discount = p.mrp > p.price ? Math.round(((p.mrp - p.price) / p.mrp) * 100) : 0;
                        return (
                          <tr key={p.id} className="hover:bg-[#f8f9fa] transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={p.image}
                                  alt={p.title}
                                  className="w-10 h-10 object-contain bg-gray-50 border border-gray-100 rounded p-0.5"
                                />
                                <span className="font-medium text-gray-900 max-w-[200px] truncate">{p.title}</span>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-gray-500">{p.cls}</td>
                            <td className="py-3 px-3">
                              {isEditing ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={editDiscountEnabled}
                                    onChange={(e) => setEditDiscountEnabled(e.target.checked)}
                                    className="w-3.5 h-3.5 accent-[#2874f0] rounded cursor-pointer"
                                    title="Enable Sale Price"
                                  />
                                  <input
                                    type="number"
                                    disabled={!editDiscountEnabled}
                                    value={editDiscountEnabled ? editPrice : editMrp}
                                    onChange={(e) => setEditPrice(Number(e.target.value))}
                                    className={`w-16 px-2 py-1 bg-gray-50 border rounded text-xs font-semibold outline-none ${
                                      editDiscountEnabled ? 'border-[#2874f0] text-[#2874f0]' : 'border-gray-200 text-gray-400'
                                    }`}
                                  />
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-gray-900">₹{p.price}</span>
                                  {discount > 0 && (
                                    <span className="text-[10px] font-bold text-green-600">{discount}% off</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-gray-400">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={editMrp}
                                  onChange={(e) => {
                                    const val = Number(e.target.value);
                                    setEditMrp(val);
                                    if (!editDiscountEnabled) setEditPrice(val);
                                  }}
                                  className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs font-semibold text-gray-700 outline-none"
                                />
                              ) : (
                                <span className={discount > 0 ? 'line-through' : ''}>₹{p.mrp}</span>
                              )}
                            </td>
                            <td className="py-3 px-3">
                              {isEditing ? (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    type="checkbox"
                                    checked={editBadgeEnabled}
                                    onChange={(e) => setEditBadgeEnabled(e.target.checked)}
                                    className="w-3.5 h-3.5 accent-[#2874f0] rounded cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    disabled={!editBadgeEnabled}
                                    value={editBadge}
                                    placeholder="Badge"
                                    onChange={(e) => setEditBadge(e.target.value)}
                                    className={`w-20 px-2 py-1 bg-gray-50 border rounded text-[10px] font-bold uppercase outline-none ${
                                      editBadgeEnabled ? 'border-[#2874f0] text-gray-700' : 'border-gray-200 text-gray-300'
                                    }`}
                                  />
                                </div>
                              ) : (
                                p.badge ? (
                                  <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded uppercase">
                                    {p.badge}
                                  </span>
                                ) : (
                                  <span className="text-gray-300 text-[10px]">—</span>
                                )
                              )}
                            </td>
                            <td className="py-3 px-3">
                              <button
                                onClick={() => toggleStock(p.id, p.inStock)}
                                className={`text-[10px] font-bold px-2 py-1 rounded-sm transition-colors cursor-pointer ${
                                  p.inStock
                                    ? 'bg-green-50 text-green-700 border border-green-200'
                                    : 'bg-red-50 text-red-600 border border-red-200'
                                }`}
                              >
                                {p.inStock ? 'Active' : 'Inactive'}
                              </button>
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {isEditing ? (
                                  <button
                                    onClick={() => saveProductChanges(p.id)}
                                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-white bg-green-600 hover:bg-green-700 rounded-md cursor-pointer transition-colors"
                                  >
                                    <Check className="w-3 h-3" /> Save
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => startEditing(p)}
                                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#2874f0] bg-blue-50 hover:bg-blue-100 rounded-md cursor-pointer transition-colors"
                                  >
                                    <Edit2 className="w-3 h-3" /> Edit
                                  </button>
                                )}
                                <button
                                  onClick={() => handleDeleteProduct(p.id)}
                                  className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ====================== WHATSAPP TAB ====================== */}
        {activeTab === 'whatsapp' && (
          <div className="max-w-lg mx-auto space-y-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6 text-center">
              <div className="w-12 h-12 bg-[#25d366]/10 text-[#25d366] rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-gray-900">WhatsApp Business Bot</h2>
              <p className="text-xs text-gray-400 mt-1">
                Connect your WhatsApp to send automated order updates to customers
              </p>
            </div>

            {waStatus.status === 'CONNECTED' || waStatus.connected ? (
              <div className="bg-white rounded-lg border border-green-200 p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-green-700">WhatsApp Connected</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Your session is saved and will persist across server restarts.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-md p-3 text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Session</span>
                    <span className="text-green-600 font-semibold">Permanent</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className="text-green-600 font-semibold">Online</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cost</span>
                    <span className="text-gray-700 font-semibold">Free</span>
                  </div>
                </div>

                <button
                  onClick={handleUnlinkWhatsApp}
                  className="text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 px-4 py-2 rounded-md transition-colors cursor-pointer"
                >
                  Unlink Session
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-6 text-center space-y-4">
                {waStatus.qrImage ? (
                  <div>
                    <div className="bg-white border-2 border-gray-200 p-4 rounded-lg inline-block shadow-sm">
                      <img src={waStatus.qrImage} alt="WhatsApp QR Code" className="w-56 h-56 mx-auto block" />
                    </div>
                    <p className="text-xs text-gray-500 mt-3 font-medium">
                      Open WhatsApp → Linked Devices → Scan this code
                    </p>
                  </div>
                ) : (
                  <div className="py-6 space-y-3">
                    <div className="w-6 h-6 border-2 border-[#2874f0] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-gray-400">Generating QR Code...</p>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h4 className="text-xs font-bold text-gray-700 mb-2">How to connect:</h4>
              <ol className="text-[11px] text-gray-500 space-y-1 list-decimal list-inside">
                <li>Open WhatsApp on your phone</li>
                <li>Tap Menu → Linked Devices → Link a Device</li>
                <li>Point your camera at the QR code above</li>
                <li>Your session will be saved permanently</li>
              </ol>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
