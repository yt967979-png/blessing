'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  RefreshCw,
  TrendingUp,
  Server,
  Users,
  ShieldCheck,
  Package,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  MessageSquare,
  Bot,
  ExternalLink,
  Calendar,
  BookOpen,
  ArrowRight,
  UploadCloud,
  Trash2,
  Paperclip,
  RotateCcw,
  FileText,
} from 'lucide-react';
import { authHeaders } from '@/lib/clientAuth';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';

interface CoFounderSectionProps {
  user: any;
  onShowToast: (msg: string) => void;
}

interface CoFounderChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export const CoFounderSection: React.FC<CoFounderSectionProps> = ({ user, onShowToast }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [storeContext, setStoreContext] = useState<any>(null);
  const [customTimetableText, setCustomTimetableText] = useState('');
  const [showTimetableInput, setShowTimetableInput] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [chatMessages, setChatMessages] = useState<CoFounderChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Hey Yogesh! 👋 I am your AI Co-Founder. You can give me operational commands (e.g. *"Create coupon EXAM15 with 15% discount up to ₹150"*), manage book stock, coordinate school bulk orders, activate festive themes, deploy exam timetables, upload files/spreadsheets, or ask for sales analysis.',
      timestamp: 'Active Now',
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [dispatchingDigest, setDispatchingDigest] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const loadStorefrontContext = async () => {
    try {
      const res = await fetch('/api/cofounder/storefront-context', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const json = await res.json();
        setStoreContext(json);
      }
    } catch (_) {}
  };

  const loadStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/cofounder/status', {
        headers: authHeaders(user),
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
      await loadStorefrontContext();
    } catch (_) {
      onShowToast('❌ Failed to load Co-Founder telemetry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  // Auto-scroll inside chat container only — NEVER hijack or scroll the whole browser page
  useEffect(() => {
    const el = chatContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendChatMessage = async (msgText?: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const textToSend = (msgText || chatInput).trim();
    if (!textToSend || sendingChat) return;

    const userMsg: CoFounderChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setSendingChat(true);

    try {
      const res = await fetch('/api/cofounder/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ action: 'investigate', query: textToSend }),
      });
      const json = await res.json();
      if (res.ok && json.answer) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `ai-${Date.now()}`,
            role: 'assistant',
            content: json.answer,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        // Silently reload status cards in background in case stock/theme/coupons changed
        loadStatus();
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: '⚠️ Failed to complete the action. Please try again.',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
      }
    } catch (_) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: '⚠️ Network error connecting to Co-Founder reasoner.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setSendingChat(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingFile(true);
    const userMsg: CoFounderChatMessage = {
      id: `usr-file-${Date.now()}`,
      role: 'user',
      content: `📎 Uploaded: **${file.name}** (${file.type || 'file'}) ${chatInput.trim() ? `— "${chatInput.trim()}"` : ''}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setChatMessages((prev) => [...prev, userMsg]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (chatInput.trim()) {
        formData.append('caption', chatInput.trim());
        setChatInput('');
      }

      const res = await fetch('/api/cofounder/upload', {
        method: 'POST',
        headers: authHeaders(user),
        body: formData,
      });

      const json = await res.json();
      if (res.ok && json.replyText) {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `ai-doc-${Date.now()}`,
            role: 'assistant',
            content: json.replyText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);
        onShowToast(`✓ Processed ${file.name}`);
        loadStatus();
      } else {
        onShowToast('❌ Failed to process uploaded document');
      }
    } catch (_) {
      onShowToast('❌ Network error uploading file');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRollbackTask = async (taskId: string) => {
    try {
      const res = await fetch('/api/cofounder/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ action: 'rollback_task', taskId }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onShowToast(`✓ Task ${taskId} rolled back successfully`);
        loadStatus();
      } else {
        onShowToast(`❌ Rollback failed: ${json.message || 'Unknown error'}`);
      }
    } catch (_) {
      onShowToast('❌ Network error during rollback');
    }
  };

  const handleDispatchDigest = async () => {
    setDispatchingDigest(true);
    try {
      const res = await fetch('/api/cofounder/digest', {
        method: 'POST',
        headers: authHeaders(user),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        onShowToast(
          json.deliveredTelegram
            ? '🚀 Daily Briefing dispatched directly to your Telegram!'
            : '✓ Daily Briefing generated and saved to persistent memory.'
        );
        loadStatus();
      } else {
        onShowToast('❌ Error generating digest');
      }
    } catch (_) {
      onShowToast('❌ Network error generating digest');
    } finally {
      setDispatchingDigest(false);
    }
  };

  const handleUpdateTask = async (taskId: string, status: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch('/api/cofounder/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ action: 'update_task', taskId, status }),
      });
      if (res.ok) {
        onShowToast(`✓ Task ${status === 'APPROVED' ? 'Approved' : 'Rejected'}`);
        loadStatus();
      }
    } catch (_) {
      onShowToast('❌ Failed to update task');
    }
  };

  const handleCompleteAllTasks = async () => {
    try {
      const res = await fetch('/api/cofounder/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ action: 'complete_all_tasks' }),
      });
      if (res.ok) {
        onShowToast('✓ All operational tasks marked as completed');
        loadStatus();
      }
    } catch (_) {
      onShowToast('❌ Failed to update tasks');
    }
  };

  const metrics = data?.metrics;
  const b = metrics?.business;
  const t = metrics?.technical;
  const c = metrics?.customer;
  const l = metrics?.logistics;
  const inv = metrics?.inventory;

  return (
    <div className="space-y-6">
      {/* ─── Top Co-Founder Banner ─────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[#001B3A] via-[#002D5E] to-[#001B3A] text-white p-5 rounded-3xl shadow-sm border border-amber-400/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black shadow-md shrink-0">
            👑
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black tracking-tight text-white">Blessing AI Co-Founder</h2>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                ● 24/7 Operational Core
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Autonomous monitoring, root-cause investigation, memory, and executive briefings.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDispatchDigest}
            disabled={dispatchingDigest}
            className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{dispatchingDigest ? 'Dispatching...' : 'Dispatch Daily Briefing'}</span>
          </button>
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading}
            className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all cursor-pointer"
            title="Refresh telemetry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ─── 360° Live Telemetry Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Business */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider">Business & Sales</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl font-black text-slate-900">
            ₹{b?.todayRevenue?.toLocaleString('en-IN') || 0}
          </div>
          <div className="text-[11px] text-slate-500 flex justify-between">
            <span>Orders Today: <strong>{b?.todayOrders || 0}</strong></span>
            <span>AOV: <strong>₹{b?.avgOrderValue || 0}</strong></span>
          </div>
          <div className="text-[10px] text-slate-400 truncate pt-1 border-t border-slate-100">
            Top Seller: <span className="text-slate-700 font-bold">{b?.topBookToday || '10th Combo'}</span>
          </div>
        </div>

        {/* Card 2: Technical Health */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider">Technical Health</span>
            <Server className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black text-slate-900">{t?.uptimeFormatted || '0m'}</span>
            <span className="text-[10px] text-emerald-700 bg-emerald-100 font-bold px-1.5 py-0.5 rounded">100% Uptime</span>
          </div>
          <div className="text-[11px] text-slate-500 flex justify-between">
            <span>RAM: <strong>{t?.memoryPercent || 0}%</strong></span>
            <span>5xx Errors: <strong>{t?.recentErrorsCount || 0}</strong></span>
          </div>
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 flex items-center gap-2">
            <span>DB: {t?.dbHealthy ? '🟢 Connected' : '🔴 Degraded'}</span>
            <span>Redis: {t?.redisHealthy ? '🟢 Active' : '🟡 Offline'}</span>
          </div>
        </div>

        {/* Card 3: Customers & Traffic */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider">Customer Experience</span>
            <Users className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {c?.activeVisitorsNow || 1} <span className="text-xs font-semibold text-slate-500">active shoppers</span>
          </div>
          <div className="text-[11px] text-slate-500 flex justify-between">
            <span>Abandoned (24h): <strong>{c?.abandonedCarts24h || 0}</strong></span>
            <span>Open Tickets: <strong>{c?.openSupportTickets || 0}</strong></span>
          </div>
          <div className="text-[10px] text-amber-700 font-bold pt-1 border-t border-slate-100">
            ⭐ CSAT Rating: {c?.avgCsatRating || 5.0} / 5.0
          </div>
        </div>

        {/* Card 4: Inventory & Logistics */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[10.5px] font-extrabold uppercase tracking-wider">Fulfillment & Stock</span>
            <Package className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-xl font-black text-slate-900">
            {inv?.lowStockCount || 0} <span className="text-xs font-semibold text-slate-500">low stock titles</span>
          </div>
          <div className="text-[11px] text-slate-500 flex justify-between">
            <span>Awaiting AWB: <strong>{l?.ordersAwaitingAwb || 0}</strong></span>
            <span>In-Transit: <strong>{l?.inTransitCount || 0}</strong></span>
          </div>
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
            Courier: <span className="text-slate-700 font-bold">ST Courier Express</span>
          </div>
        </div>
      </div>

      {/* ─── Interactive AI Co-Founder Conversational Console (Telegram-Style) ── */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black text-sm shadow-xs">
              👑
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">AI Co-Founder Conversational Console</h3>
              <p className="text-[11px] text-slate-500">
                Command your business in plain English or Tanglish — create coupons, update stock, arrange bulk orders, or monitor sales.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Connected to PostgreSQL & Tools
          </span>
        </div>

        {/* Scrollable Conversation Stream */}
        <div
          ref={chatContainerRef}
          className="max-h-[380px] min-h-[160px] overflow-y-auto space-y-3 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100/90 text-xs custom-scrollbar"
        >
          {chatMessages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} className="flex justify-end">
                <div className="bg-[#001B3A] text-white px-4 py-2.5 rounded-2xl rounded-br-xs max-w-[85%] shadow-xs space-y-1">
                  <div className="font-medium">{m.content}</div>
                  <span className="block text-[9.5px] text-slate-300 text-right font-normal">{m.timestamp}</span>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black text-xs shrink-0 mt-0.5 shadow-2xs">
                  👑
                </div>
                <div className="bg-white border border-slate-200/80 px-4 py-3 rounded-2xl rounded-tl-xs max-w-[85%] text-slate-800 shadow-2xs space-y-1.5">
                  <ChatMarkdown content={m.content} isCustomer={false} />
                  <span className="block text-[9.5px] text-slate-400 font-medium">{m.timestamp}</span>
                </div>
              </div>
            )
          )}
          {sendingChat && (
            <div className="flex items-center gap-2 text-xs text-slate-500 italic py-1 px-2 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-spin" />
              <span>Co-Founder is inspecting database & executing action...</span>
            </div>
          )}
        </div>


        {/* Message Input Form with File Attachment */}
        <form onSubmit={(e) => handleSendChatMessage(undefined, e)} className="flex items-center gap-2 pt-1">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept="image/*,.pdf,.csv,.txt"
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile || sendingChat}
            title="Upload file or screenshot for multimodal analysis"
            className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all cursor-pointer shrink-0 disabled:opacity-40"
          >
            {uploadingFile ? (
              <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
            ) : (
              <Paperclip className="w-4 h-4 text-slate-600" />
            )}
          </button>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder={uploadingFile ? 'Analyzing attachment...' : "Tell your Co-Founder what to do (e.g. 'Create coupon EXAM15 with 15% discount up to ₹150')..."}
            disabled={sendingChat || uploadingFile}
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 outline-none focus:bg-white focus:border-blue-600 transition-all shadow-inner"
          />
          <button
            type="submit"
            disabled={sendingChat || uploadingFile || !chatInput.trim()}
            className="px-5 py-2.5 bg-[#001B3A] hover:bg-blue-900 text-white font-extrabold text-xs rounded-xl flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-40 cursor-pointer shrink-0"
          >
            {sendingChat ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            <span>{sendingChat ? 'Executing...' : 'Send'}</span>
          </button>
        </form>
      </div>

      {/* ─── Exam Timetable Hub & Custom Ingestion Manager ────────────────────── */}
      <div className="bg-gradient-to-br from-[#071321] via-[#0b1c30] to-[#040c17] rounded-3xl border border-sky-500/30 shadow-lg p-5 sm:p-6 text-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-sky-500/15 border border-sky-400/30 text-sky-400">
                <Calendar className="w-4 h-4" />
              </span>
              <h3 className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                🎓 TN Board Examination Hub & Timetable Manager
              </h3>
            </div>
            <p className="text-[11px] text-sky-200/80">
              Autonomous DGE timetable publisher, live countdown timer, and student centum guide companion.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {storeContext?.examCampaign?.isActive ? (
              <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>🟢 Live on Storefront</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-slate-500/20 border border-slate-400/30 text-slate-300 text-xs font-bold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span>⚪ Hidden / Draft</span>
              </span>
            )}
            <a
              href="/exam-timetable"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-sky-200 hover:text-white border border-white/20 text-xs font-semibold flex items-center gap-1 transition-all"
            >
              <span>View Live Hub</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Status Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Academic Year</span>
            <span className="font-bold text-sm text-sky-300">
              {storeContext?.examCampaign?.academicYear || '2026–2027'}
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Loaded Papers</span>
            <span className="font-bold text-sm text-emerald-400">
              {storeContext?.examCampaign?.schedule?.length || 0} Subjects
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Standard / Medium</span>
            <span className="font-bold text-sm text-amber-300">10th SSLC & 12th HSC</span>
          </div>
          <div className="p-3 rounded-2xl bg-white/[0.04] border border-white/10">
            <span className="text-[10px] text-slate-400 uppercase font-bold block">Companion Guide</span>
            <span className="font-bold text-sm text-sky-300 truncate block">10th 5-in-1 Combo (₹1,300)</span>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() =>
              handleSendChatMessage(
                'Deploy official Tamil Nadu 10th and 12th board exam timetable to website'
              )
            }
            disabled={sendingChat}
            className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Deploy Official TN DGE Schedule</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTimetableInput(!showTimetableInput)}
            className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/20 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95"
          >
            <UploadCloud className="w-3.5 h-3.5 text-sky-300" />
            <span>{showTimetableInput ? 'Close Custom Ingestion' : 'Paste Custom Timetable / WhatsApp Forward'}</span>
          </button>

          {storeContext?.examCampaign?.isActive && (
            <button
              type="button"
              onClick={() => handleSendChatMessage('remove exam timetable from website')}
              disabled={sendingChat}
              className="px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 ml-auto"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hide from Storefront</span>
            </button>
          )}
        </div>

        {/* Custom Timetable Ingestion Drawer */}
        {showTimetableInput && (
          <div className="p-4 rounded-2xl bg-black/40 border border-sky-400/20 space-y-3 mt-3 animate-fadeIn">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                <span>⚡ AI Timetable Extractor</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  (Paste raw WhatsApp text, official circular text, or revised dates)
                </span>
              </span>
              <button
                type="button"
                onClick={() => setShowTimetableInput(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
            <textarea
              rows={4}
              value={customTimetableText}
              onChange={(e) => setCustomTimetableText(e.target.value)}
              placeholder={`Example:
10th Public Exam Schedule:
27.03.2026 Tamil
31.03.2026 English
06.04.2026 Mathematics
09.04.2026 Science
14.04.2026 Social Science`}
              className="w-full p-3 rounded-xl bg-white/[0.06] border border-white/15 text-white placeholder-slate-400 text-xs font-mono focus:outline-none focus:border-sky-400 transition-colors"
            />
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400">
                AI will automatically extract subjects, dates, times, and link 5-in-1 combo books.
              </span>
              <button
                type="button"
                onClick={() => {
                  if (customTimetableText.trim()) {
                    handleSendChatMessage(customTimetableText.trim());
                    setCustomTimetableText('');
                    setShowTimetableInput(false);
                  }
                }}
                disabled={sendingChat || !customTimetableText.trim()}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-40"
              >
                {sendingChat ? 'Parsing & Deploying...' : '⚡ AI Parse & Deploy Live'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ─── Two-Column: Approval Queue & Telegram Bot Status ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column A (2 cols): Operational Tasks & Approvals */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900">Operational Tasks & Approval Queue</h3>
              <p className="text-[11px] text-slate-500">
                Level 1 actions execute autonomously. Level 3 actions require your explicit approval.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {(() => {
                const pendingCount = (data?.tasks || []).filter((t: any) => t.status === 'PENDING').length;
                if (pendingCount > 0) {
                  return (
                    <>
                      <span className="text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                        {pendingCount} pending approval
                      </span>
                      <button
                        type="button"
                        onClick={handleCompleteAllTasks}
                        className="text-[10px] font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        ✓ Mark All Done
                      </button>
                    </>
                  );
                }
                return (
                  <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                    All clear (0 pending)
                  </span>
                );
              })()}
            </div>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
            {(!data?.managedTasks || data.managedTasks.length === 0) && (!data?.tasks || data.tasks.length === 0) ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                ✓ No active tasks in queue. All systems operating smoothly.
              </div>
            ) : (
              (data.managedTasks && data.managedTasks.length > 0 ? data.managedTasks : data.tasks).map((task: any) => {
                const checks = task.verification_checks || [];
                const passedChecks = checks.filter((c: any) => c.passed).length;
                const hasRollback = Boolean(task.rollback_action || task.execution_result?.rollback_action);

                return (
                  <div
                    key={task.id}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-2xl flex items-center justify-between gap-3 text-xs transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900 text-[11px] truncate">{task.title}</span>
                        <span
                          className={`text-[9.5px] font-black px-2 py-0.5 rounded-full ${
                            task.status === 'COMPLETED' || task.status === 'APPROVED' || task.status === 'EXECUTED'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : task.status === 'RUNNING'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300 animate-pulse'
                              : task.status === 'VERIFYING'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : task.status === 'WAITING_FOR_APPROVAL' || task.status === 'PENDING'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : task.status === 'ROLLED_BACK'
                              ? 'bg-slate-200 text-slate-700'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          ● {task.status}
                        </span>
                        <span className="text-[9.5px] font-mono text-slate-400 uppercase">{task.department}</span>
                        {checks.length > 0 && (
                          <span className="text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60">
                            ✓ {passedChecks}/{checks.length} checks
                          </span>
                        )}
                      </div>
                      {task.description && <p className="text-[10.5px] text-slate-600 truncate">{task.description}</p>}
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {task.status === 'PENDING' || task.status === 'WAITING_FOR_APPROVAL' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleUpdateTask(task.id, 'APPROVED')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10.5px] font-bold cursor-pointer transition-all"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateTask(task.id, 'REJECTED')}
                            className="px-2.5 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded-lg text-[10.5px] font-bold cursor-pointer transition-all"
                          >
                            Reject
                          </button>
                        </>
                      ) : task.status === 'COMPLETED' && hasRollback ? (
                        <button
                          type="button"
                          onClick={() => handleRollbackTask(task.id)}
                          title="Undo this action and restore previous database state"
                          className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[10.5px] font-bold cursor-pointer transition-all flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Rollback</span>
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-500 uppercase px-2 py-0.5 bg-white rounded border border-slate-200">
                          {task.status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column B (1 col): Telegram Bot & Morning Digest Status */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
              <span>✈️ Telegram Bot Channel</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Receive daily briefings and command your store on the go.
            </p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 text-[11px]">Integration Status:</span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  data?.telegramConfigured
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-900'
                }`}
              >
                {data?.telegramConfigured ? '🟢 Connected' : '🟡 Setup Required'}
              </span>
            </div>

            <p className="text-[10.5px] text-slate-500 leading-relaxed">
              Create a free bot via Telegram&apos;s <strong>@BotFather</strong>, then add your bot credentials to <code className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">.env</code>:
            </p>
            <div className="bg-slate-900 text-emerald-400 p-2.5 rounded-xl font-mono text-[10px] space-y-0.5 overflow-x-auto">
              <div>TELEGRAM_BOT_TOKEN=&quot;your_token&quot;</div>
              <div>TELEGRAM_CHAT_ID=&quot;your_chat_id&quot;</div>
            </div>
          </div>

          {/* Latest Morning Digest preview */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
              Latest Morning Executive Digest
            </span>
            {data?.latestDigest ? (
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-[10.5px] text-slate-700 max-h-36 overflow-y-auto custom-scrollbar whitespace-pre-wrap font-mono">
                {data.latestDigest.ai_synthesis}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center text-slate-400 text-xs">
                No digest recorded yet. Tap &ldquo;Dispatch Daily Briefing&rdquo; to generate today&apos;s report.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoFounderSection;
