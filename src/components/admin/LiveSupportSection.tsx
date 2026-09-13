'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  User,
  Clock,
  CheckCheck,
  Send,
  CheckCircle2,
  AlertTriangle,
  Star,
  ExternalLink,
  Phone,
  MapPin,
  Package,
  Truck,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  Headphones,
} from 'lucide-react';
import OrderStatusStamp from './OrderStatusStamp';
import { authHeaders } from '@/lib/clientAuth';
import { shopWhatsAppChatUrl } from '@/lib/shopContact';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';

interface LiveSupportSectionProps {
  user: any;
  onShowToast: (msg: string) => void;
  playChime?: () => void;
}

interface SupportConv {
  id: string;
  customer_name?: string;
  customer_phone?: string;
  order_id?: string;
  status: 'BOT' | 'WAITING_ADMIN' | 'ACTIVE' | 'RESOLVED';
  assigned_admin_id?: string;
  assigned_admin_name?: string;
  accepted_at?: string;
  resolved_at?: string;
  last_message_at?: string;
  created_at: string;
  rating?: number;
  feedback_tags?: string;
  feedback_comment?: string;
}

interface SupportMessage {
  id: string;
  conversation_id: string;
  sender_type: 'CUSTOMER' | 'AI' | 'ADMIN' | 'SYSTEM';
  sender_name: string;
  text: string;
  created_at: string;
}

interface CustomerContextCard {
  order: {
    orderId: string;
    customerName: string;
    customerPhone: string;
    customerAltPhone?: string;
    address: string;
    city: string;
    pincode: string;
    totalAmount: number;
    status: string;
    isCancelled: boolean;
    paymentMethod: string;
    paymentStatus: string;
    awbNumber?: string;
    courierName: string;
    trackingUrl?: string;
    orderedAt: string;
    items: Array<{ title: string; qty: number; price?: number }>;
  } | null;
  pastTicketsCount: number;
  feedback?: { rating: number; tags?: string; comment?: string };
}

const CANNED_REPLIES = [
  "Hi! I'm checking your order and ST Courier dispatch details right now.",
  'Your guides have been securely packed and handed over to ST Courier.',
  'Could you please confirm your delivery pincode or full school address?',
  'A replacement copy has been approved and dispatched at no extra cost.',
  'Is there anything else I can help you with today?',
];

export const LiveSupportSection: React.FC<LiveSupportSectionProps> = ({
  user,
  onShowToast,
  playChime,
}) => {
  const [activeTab, setActiveTab] = useState<'waiting' | 'active' | 'resolved'>('waiting');
  const [waitingList, setWaitingList] = useState<SupportConv[]>([]);
  const [activeList, setActiveList] = useState<SupportConv[]>([]);
  const [resolvedList, setResolvedList] = useState<SupportConv[]>([]);
  const [stats, setStats] = useState({
    waitingCount: 0,
    activeCount: 0,
    totalFeedback: 0,
    avgRating: 5.0,
    fiveStarCount: 0,
  });

  const [selectedConv, setSelectedConv] = useState<SupportConv | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [contextCard, setContextCard] = useState<CustomerContextCard | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const adminName = user?.name || user?.email?.split('@')[0] || 'Admin';

  // Auto-scroll message feed within its container only (NEVER scroll the browser window)
  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Load support queues and stats
  const loadSupportData = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/admin/support?view=overview', {
        headers: authHeaders(user),
      });
      if (res.ok) {
        const data = await res.json();
        setWaitingList(data.waiting || []);
        setActiveList(data.active || []);
        setResolvedList(data.resolved || []);
        if (data.stats) setStats(data.stats);

        // If current selected conversation is updated
        if (selectedConv) {
          const updated =
            data.active?.find((c: SupportConv) => c.id === selectedConv.id) ||
            data.waiting?.find((c: SupportConv) => c.id === selectedConv.id) ||
            data.resolved?.find((c: SupportConv) => c.id === selectedConv.id);
          if (updated) setSelectedConv(updated);
        }
      }
    } catch (_) {}
  }, [user, selectedConv]);

  // Load message history for active conversation
  const loadMessages = useCallback(async (convId: string) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/admin/support?view=messages&conversationId=${encodeURIComponent(convId)}`, {
        headers: authHeaders(user),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (_) {}
  }, [user]);

  // Load 360 Customer Context Card
  const loadContextCard = useCallback(async (conv: SupportConv) => {
    if (!user) return;
    setLoadingContext(true);
    try {
      const q = new URLSearchParams();
      q.set('view', 'context_card');
      if (conv.order_id) q.set('orderId', conv.order_id);
      if (conv.customer_phone) q.set('phone', conv.customer_phone);
      q.set('conversationId', conv.id);

      const res = await fetch(`/api/admin/support?${q.toString()}`, {
        headers: authHeaders(user),
      });
      if (res.ok) {
        const data = await res.json();
        setContextCard(data);
      }
    } catch (_) {
    } finally {
      setLoadingContext(false);
    }
  }, [user]);

  // Initial load & periodic polling
  useEffect(() => {
    loadSupportData();
    const timer = setInterval(loadSupportData, 8000);
    return () => clearInterval(timer);
  }, [loadSupportData]);

  // Select conversation
  const handleSelectConversation = (conv: SupportConv) => {
    setSelectedConv(conv);
    loadMessages(conv.id);
    loadContextCard(conv);
  };

  // Continuous message sync for currently open conversation
  useEffect(() => {
    if (!selectedConv?.id) return;
    loadMessages(selectedConv.id);
    const timer = setInterval(() => {
      loadMessages(selectedConv.id);
    }, 2500);
    return () => clearInterval(timer);
  }, [selectedConv?.id, loadMessages]);

  // Real-time SSE listener
  useEffect(() => {
    if (!user) return;
    const tokenParam = user?.token ? `&token=${encodeURIComponent(user.token)}` : '';
    const es = new EventSource(`/api/support/stream?admin=1${tokenParam}`);

    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === 'SUPPORT_REQUESTED') {
          playChime?.();
          onShowToast(`🔔 New Support Request from ${ev.senderName || 'Customer'}!`);
          loadSupportData();
        } else if (ev.type === 'CHAT_CLAIMED' || ev.type === 'CHAT_RESOLVED' || ev.type === 'CONVERSATION_UPDATED') {
          const targetId = ev.conversationId || ev.data?.conversation?.id;
          if (ev.status === 'RESOLVED' || ev.type === 'CHAT_RESOLVED') {
            if (targetId) {
              setWaitingList((prev) => prev.filter((c) => c.id !== targetId));
              setStats((prev) => ({
                ...prev,
                waitingCount: Math.max(0, prev.waitingCount - 1),
              }));
            }
            if (selectedConv && selectedConv.id === targetId) {
              onShowToast('ℹ️ Customer ended or left the chat session.');
            }
          }
          loadSupportData();
        } else if (ev.type === 'NEW_MESSAGE') {
          const evConvId = ev.conversationId || ev.message?.conversation_id;
          if (selectedConv && evConvId === selectedConv.id) {
            const newMsg: SupportMessage = {
              id: ev.message?.id || ev.id || `msg_${Date.now()}`,
              conversation_id: evConvId,
              sender_type: ev.senderType || ev.message?.sender_type,
              sender_name: ev.senderName || ev.message?.sender_name || 'Customer',
              text: ev.text || ev.message?.text || '',
              created_at: ev.timestamp || new Date().toISOString(),
            };
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id || (m.text === newMsg.text && m.sender_type === newMsg.sender_type))) {
                return prev;
              }
              return [...prev, newMsg];
            });
            loadMessages(selectedConv.id);
          } else if (ev.senderType === 'CUSTOMER' && ev.status === 'ACTIVE') {
            // Only toast if an ongoing active conversation with admin; NEVER play sound for bot messages
            onShowToast(`💬 New message from ${ev.senderName || 'Customer'}`);
          }
          loadSupportData();
        }
      } catch (_) {}
    };

    return () => es.close();
  }, [user, selectedConv, playChime, onShowToast, loadSupportData]);

  // ── ATOMIC CLAIM HANDLER
  const handleClaimChat = async (conv: SupportConv) => {
    setClaimingId(conv.id);
    try {
      const res = await fetch('/api/support/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({ conversationId: conv.id }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        onShowToast(`✓ Accepted chat with ${conv.customer_name || 'Customer'}`);
        handleSelectConversation({ ...conv, status: 'ACTIVE', assigned_admin_name: adminName });
        setActiveTab('active');
        loadSupportData();
      } else if (res.status === 409) {
        onShowToast(`❌ ${data.error || 'Already accepted by another admin'}`);
        loadSupportData();
      } else {
        onShowToast(`❌ ${data.error || 'Failed to accept chat'}`);
      }
    } catch (_) {
      onShowToast('❌ Network error accepting chat');
    } finally {
      setClaimingId(null);
    }
  };

  // Send admin message
  const handleSendAdminReply = async (textToSend?: string) => {
    const text = (textToSend || replyText).trim();
    if (!text || !selectedConv || sendingReply) return;

    setReplyText('');
    setSendingReply(true);

    try {
      const res = await fetch('/api/support/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({
          conversationId: selectedConv.id,
          text,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: data.messageId || `msg_${Date.now()}`,
            conversation_id: selectedConv.id,
            sender_type: 'ADMIN',
            sender_name: adminName,
            text,
            created_at: data.createdAt || new Date().toISOString(),
          },
        ]);
      }
    } catch (_) {
      onShowToast('❌ Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  };

  // End & resolve chat
  const handleResolveChat = async () => {
    if (!selectedConv) return;
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders(user) },
        body: JSON.stringify({
          conversationId: selectedConv.id,
          action: 'resolve',
        }),
      });

      if (res.ok) {
        onShowToast(`✓ Chat #${selectedConv.id.slice(-6)} resolved`);
        setSelectedConv(null);
        loadSupportData();
      }
    } catch (_) {
      onShowToast('❌ Failed to resolve chat');
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── Top Stats Bar ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
            Active Staff
          </span>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-extrabold text-sm text-slate-900">{adminName}</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
            Waiting in Queue
          </span>
          <div className="flex items-center gap-2">
            <span
              className={`font-mono font-extrabold text-lg ${
                stats.waitingCount > 0 ? 'text-amber-600' : 'text-slate-900'
              }`}
            >
              {stats.waitingCount}
            </span>
            {stats.waitingCount > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full animate-bounce">
                Needs Attention
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
            Active Chats
          </span>
          <div className="font-mono font-extrabold text-lg text-[#2874f0]">
            {stats.activeCount}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-1">
          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">
            Customer CSAT
          </span>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-lg text-amber-500 flex items-center">
              ⭐ {stats.avgRating.toFixed(1)}
            </span>
            <span className="text-[10px] text-slate-400 font-bold">
              ({stats.totalFeedback} ratings)
            </span>
          </div>
        </div>
      </div>

      {/* ─── 3-Column Split Workspace ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[640px]">
        {/* COLUMN 1: Queues & Conversation List (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
          {/* Queue Tab Header */}
          <div className="p-3 border-b border-slate-200 bg-slate-50/70 flex gap-1">
            {[
              { key: 'waiting', label: 'Waiting Queue', count: stats.waitingCount, color: 'text-amber-600' },
              { key: 'active', label: 'My Active', count: stats.activeCount, color: 'text-blue-600' },
              { key: 'resolved', label: 'History', count: resolvedList.length, color: 'text-slate-500' },
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key as any)}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  activeTab === t.key
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>{t.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeTab === t.key ? 'bg-slate-100 text-slate-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
            {activeTab === 'waiting' && (
              <>
                {waitingList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 space-y-2">
                    <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-400" />
                    <p className="font-bold text-xs">Waiting queue is empty!</p>
                    <p className="text-[11px]">All customer tickets are assigned or answered.</p>
                  </div>
                ) : (
                  waitingList.map((conv) => (
                    <div
                      key={conv.id}
                      className="p-3 bg-amber-50/70 hover:bg-amber-50 rounded-xl border border-amber-200 space-y-2.5 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                            {conv.customer_name || 'Student / Parent'}
                          </h4>
                          <p className="text-[11px] text-slate-500">
                            {conv.customer_phone ? `☎ +91 ${conv.customer_phone}` : 'Store Guest'}
                          </p>
                        </div>
                        <span className="text-[10px] font-mono text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-bold">
                          Waiting
                        </span>
                      </div>

                      {conv.order_id && (
                        <div className="text-[11px] font-bold text-blue-700 bg-white/80 px-2 py-1 rounded-lg border border-blue-100">
                          📦 Order #{conv.order_id}
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={claimingId === conv.id}
                        onClick={() => handleClaimChat(conv)}
                        className="w-full py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white rounded-xl text-xs font-black shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Headphones className="w-3.5 h-3.5" />
                        <span>{claimingId === conv.id ? 'Connecting...' : 'Accept Chat'}</span>
                      </button>
                    </div>
                  ))
                )}
              </>
            )}

            {activeTab === 'active' && (
              <>
                {activeList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 space-y-1">
                    <p className="font-bold text-xs">No active chats right now.</p>
                    <p className="text-[11px]">Accept an incoming request from the queue.</p>
                  </div>
                ) : (
                  activeList.map((conv) => {
                    const isSelected = selectedConv?.id === conv.id;
                    return (
                      <div
                        key={conv.id}
                        onClick={() => handleSelectConversation(conv)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                          isSelected
                            ? 'bg-blue-50/80 border-[#2874f0] shadow-xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            {conv.customer_name || 'Customer'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {conv.last_message_at
                              ? new Date(conv.last_message_at).toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : ''}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center justify-between">
                          <span>Admin: {conv.assigned_admin_name || 'Staff'}</span>
                          {conv.order_id && <span className="text-blue-600 font-bold">#{conv.order_id}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </>
            )}

            {activeTab === 'resolved' && (
              <>
                {resolvedList.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">No past tickets recorded.</div>
                ) : (
                  resolvedList.map((conv) => (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv)}
                      className="p-3 bg-white hover:bg-slate-50 rounded-xl border border-slate-200 space-y-1 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-800">
                          {conv.customer_name || 'Customer'}
                        </span>
                        {conv.rating ? (
                          <span className="text-[10px] text-amber-600 font-extrabold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            ⭐ {conv.rating}/5
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Resolved</span>
                        )}
                      </div>
                      {conv.feedback_tags && (
                        <div className="pt-0.5">
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            {conv.feedback_tags}
                          </span>
                        </div>
                      )}
                      {conv.feedback_comment && (
                        <p className="text-[10.5px] text-slate-500 italic line-clamp-2">
                          &quot;{conv.feedback_comment}&quot;
                        </p>
                      )}
                      <p className="text-[10.5px] text-slate-400">
                        {conv.resolved_at
                          ? new Date(conv.resolved_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : ''}
                      </p>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </div>

        {/* COLUMN 2: Live Chat Stream (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
          {!selectedConv ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-[#2874f0]">
                <MessageSquare className="w-7 h-7" />
              </div>
              <p className="font-extrabold text-sm text-slate-700">Select a conversation</p>
              <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                Click on any waiting request or active ticket on the left to start chatting in real-time.
              </p>
            </div>
          ) : (
            <>
              {/* Chat Header */}
              <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-xs text-slate-900 flex items-center gap-2">
                    <span>
                      {contextCard?.order?.customerName && contextCard.order.customerName !== 'Customer'
                        ? contextCard.order.customerName
                        : selectedConv.customer_name && selectedConv.customer_name !== 'Student/Parent'
                          ? selectedConv.customer_name
                          : 'Store Customer'}
                    </span>
                    <span
                      className={`text-[9.5px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        selectedConv.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : selectedConv.status === 'WAITING_ADMIN'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {selectedConv.status}
                    </span>
                  </h3>
                  <p className="text-[10.5px] text-slate-500">
                    {contextCard?.order?.customerPhone
                      ? `☎ +91 ${contextCard.order.customerPhone}`
                      : selectedConv.customer_phone
                        ? `☎ +91 ${selectedConv.customer_phone}`
                        : 'Store Guest'}
                  </p>
                </div>

                {selectedConv.status === 'ACTIVE' && (
                  <button
                    type="button"
                    onClick={handleResolveChat}
                    className="px-3 py-1.5 bg-slate-200 hover:bg-red-50 hover:text-red-700 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    End Chat
                  </button>
                )}
              </div>

              {/* Messages Feed */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40 text-xs custom-scrollbar">
                {messages.map((m, idx) => {
                  const isAdmin = m.sender_type === 'ADMIN';
                  const isSys = m.sender_type === 'SYSTEM';

                  if (isSys) {
                    return (
                      <div key={m.id || idx} className="text-center my-2">
                        <span className="inline-block px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold rounded-full">
                          {m.text}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id || idx}
                      className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'} space-y-1`}
                    >
                      <span className="text-[9.5px] font-bold text-slate-400 px-1">
                        {m.sender_name}
                      </span>
                      <div
                        className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl leading-relaxed break-words ${
                          isAdmin
                            ? 'bg-[#001b3a] text-white rounded-br-xs shadow-xs'
                            : 'bg-white text-slate-900 border border-slate-200 rounded-bl-xs shadow-xs'
                        }`}
                      >
                        <ChatMarkdown content={m.text} isCustomer={isAdmin} />
                        <div
                          className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
                            isAdmin ? 'text-blue-300' : 'text-slate-400'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5" />
                          <span>
                            {new Date(m.created_at).toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {isAdmin && <CheckCheck className="w-3 h-3 text-emerald-400" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Canned Responses Toolbar */}
              {selectedConv.status === 'ACTIVE' && (
                <div className="p-2 bg-slate-50 border-t border-slate-100 flex gap-1.5 overflow-x-auto no-scrollbar">
                  {CANNED_REPLIES.map((c, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSendAdminReply(c)}
                      className="whitespace-nowrap px-2.5 py-1 bg-white hover:bg-blue-50 hover:text-[#2874f0] text-slate-600 rounded-lg text-[10px] font-bold border border-slate-200 transition-colors cursor-pointer shrink-0"
                    >
                      {c.slice(0, 32)}...
                    </button>
                  ))}
                </div>
              )}

              {/* Reply Input Bar */}
              <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
                <input
                  type="text"
                  placeholder={
                    selectedConv.status === 'ACTIVE'
                      ? 'Reply to customer...'
                      : 'Chat is resolved'
                  }
                  disabled={selectedConv.status !== 'ACTIVE' || sendingReply}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendAdminReply();
                    }
                  }}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:border-[#2874f0] text-slate-800"
                />
                <button
                  type="button"
                  disabled={selectedConv.status !== 'ACTIVE' || sendingReply || !replyText.trim()}
                  onClick={() => handleSendAdminReply()}
                  className="p-2.5 bg-[#2874f0] hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* COLUMN 3: 360° Customer & Order Context Card (3 cols) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 flex flex-col space-y-4 overflow-y-auto custom-scrollbar">
          <div className="border-b border-slate-100 pb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Customer Intelligence
            </span>
            <h4 className="font-extrabold text-sm text-slate-900">360° Context Card</h4>
          </div>

          {!selectedConv ? (
            <div className="text-center text-slate-400 text-xs py-8">
              Select a conversation to see live order and delivery telemetry.
            </div>
          ) : loadingContext ? (
            <div className="text-center text-slate-400 text-xs py-8">Loading context...</div>
          ) : (
            <>
              {/* Student Details */}
              <div className="space-y-1.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Student</span>
                <p className="font-bold text-slate-900">
                  {contextCard?.order?.customerName && contextCard.order.customerName !== 'Customer'
                    ? contextCard.order.customerName
                    : selectedConv.customer_name && selectedConv.customer_name !== 'Student/Parent'
                      ? selectedConv.customer_name
                      : 'Store Guest'}
                </p>
                {Boolean(contextCard?.order?.customerPhone || selectedConv.customer_phone) && (
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-slate-600 font-mono">
                      ☎ +91 {contextCard?.order?.customerPhone || selectedConv.customer_phone}
                    </span>
                    <a
                      href={`https://wa.me/91${String(contextCard?.order?.customerPhone || selectedConv.customer_phone || '').replace(/\D/g, '').slice(-10)}?text=Hello%20${encodeURIComponent(contextCard?.order?.customerName || 'Customer')},%20regarding%20your%20Blessing%20Power%20Guide%20order`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-600 hover:text-emerald-700 font-bold text-[11px]"
                    >
                      wa.me ↗
                    </a>
                  </div>
                )}
              </div>

              {/* Linked Order Card */}
              {contextCard?.order ? (
                <div className="space-y-2.5 text-xs bg-blue-50/50 p-3.5 rounded-xl border border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-extrabold text-[#2874f0]">
                      #{contextCard.order.orderId}
                    </span>
                    <OrderStatusStamp status={contextCard.order.status} size="sm" />
                  </div>

                  <div className="space-y-1 text-slate-600 text-[11px]">
                    <p>
                      <strong>Destination:</strong> {contextCard.order.city} ({contextCard.order.pincode})
                    </p>
                    <p>
                      <strong>Total:</strong> ₹{contextCard.order.totalAmount} ({contextCard.order.paymentStatus})
                    </p>
                    {contextCard.order.awbNumber && (
                      <p className="font-mono text-emerald-800 bg-emerald-50 p-1.5 rounded-lg border border-emerald-200">
                        <strong>ST Docket:</strong> {contextCard.order.awbNumber}
                      </p>
                    )}
                  </div>

                  {/* Order Items */}
                  <div className="border-t border-blue-100 pt-2 space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Guides Ordered:</span>
                    {contextCard.order.items?.map((it, i) => (
                      <div key={i} className="text-[11px] text-slate-800 flex justify-between">
                        <span className="truncate pr-1">• {it.title}</span>
                        <span className="font-mono font-bold">×{it.qty}</span>
                      </div>
                    ))}
                  </div>

                  <a
                    href={`/track?orderId=${encodeURIComponent(contextCard.order.orderId)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-center font-bold text-[10.5px] flex items-center justify-center gap-1 block transition-colors"
                  >
                    <span>View Public Tracking</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <div className="p-4 bg-slate-50 rounded-xl text-center text-slate-400 text-xs">
                  No linked order found for this phone number.
                </div>
              )}

              {/* Past CSAT Feedback if available */}
              {contextCard?.feedback && (
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-xs space-y-1">
                  <span className="text-[10px] font-bold text-amber-800 uppercase">Customer Feedback</span>
                  <div className="text-amber-500 font-extrabold text-sm">
                    ⭐ {contextCard.feedback.rating}/5
                  </div>
                  {contextCard.feedback.tags && (
                    <p className="text-[10.5px] text-amber-900 font-medium">{contextCard.feedback.tags}</p>
                  )}
                  {contextCard.feedback.comment && (
                    <p className="text-[11px] text-slate-700 italic">&quot;{contextCard.feedback.comment}&quot;</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
