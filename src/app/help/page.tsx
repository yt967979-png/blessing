'use client';

import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  Headphones,
  Send,
  Sparkles,
  User,
  Clock,
  CheckCheck,
  Star,
  Truck,
  Package,
  MapPin,
  ExternalLink,
  ChevronRight,
  PhoneCall,
  MessageCircle,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AnnouncementBar } from '@/components/layout/AnnouncementBar';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { ChatInteractiveCard } from '@/components/chat/ChatInteractiveCard';
import { ChatSuggestionButtons } from '@/components/chat/ChatSuggestionButtons';
import { ChatQuickMenu } from '@/components/chat/ChatQuickMenu';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import { customerCourierHeadline, isParcelDelivered, isDeliveryAttempted } from '@/lib/orderStatus';

interface Message {
  id: string;
  sender_type: 'CUSTOMER' | 'AI' | 'ADMIN' | 'SYSTEM';
  sender_name: string;
  text: string;
  suggestions?: string[];
  linkedOrderData?: any;
  cardType?: 'order' | 'books' | 'contact' | 'policy';
  cardData?: any;
  created_at: string;
}

interface Conversation {
  id: string;
  status: 'BOT' | 'WAITING_ADMIN' | 'ACTIVE' | 'RESOLVED';
  assigned_admin_name?: string;
  customer_name?: string;
  order_id?: string;
}

const COMMON_QUERIES = [
  '🚚 Where is my order right now?',
  '👨‍💼 Talk to an admin',
  '📦 Replacement for damaged or misprinted guide',
  '📍 Can I update my delivery phone number?',
  '📚 What guides are available for 10th standard?',
];

const FEEDBACK_TAGS = ['⚡ Quick Solution', '🤝 Friendly Staff', '📦 Order Tracked', '💡 Helpful Advice'];

function HelpCenterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, showToast } = useStore();

  const queryOrderId = searchParams.get('orderId') || '';
  const queryPhone = searchParams.get('phone') || user?.phone || '';

  // Order Details State
  const [selectedOrderId, setSelectedOrderId] = useState<string>(queryOrderId);
  const [orderData, setOrderData] = useState<any>(null);
  const [loadingOrder, setLoadingOrder] = useState(false);
  const [userOrders, setUserOrders] = useState<any[]>([]);

  // Support & Chat State
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // CSAT Feedback State
  const [rating, setRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Scroll ONLY the inner chat messages container — NEVER scrolls the browser window!
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = chatContainerRef.current;
    if (!el) return;
    if (behavior === 'auto') {
      el.scrollTop = el.scrollHeight;
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [messages, isTyping]);

  // Load user's recent orders for the selector
  useEffect(() => {
    if (user?.token) {
      fetch('/api/orders', { headers: authHeaders(user) })
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            setUserOrders(data);
            if (!selectedOrderId && data.length > 0) {
              setSelectedOrderId(data[0].orderId || data[0].id);
            }
          }
        })
        .catch(() => {});
    }
  }, [user, selectedOrderId]);

  // Load Order Details for the selected Order ID
  const fetchOrderDetails = useCallback(async (oid: string) => {
    if (!oid) return;
    setLoadingOrder(true);
    try {
      const res = await fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: oid, phone: queryPhone }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrderData(data.order);
      } else {
        setOrderData(null);
      }
    } catch {
      setOrderData(null);
    } finally {
      setLoadingOrder(false);
    }
  }, [queryPhone]);

  useEffect(() => {
    if (selectedOrderId) {
      fetchOrderDetails(selectedOrderId);
    }
  }, [selectedOrderId, fetchOrderDetails]);

  // Load or Initialize Support Conversation
  const loadConversation = useCallback(async () => {
    try {
      const res = await fetch('/api/support/conversation', {
        headers: authHeaders(user),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.conversation) {
          setConversation(data.conversation);
          setMessages(data.messages || []);
        }
      }
    } catch (_) {}
  }, [user]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  // Real-time SSE Connection
  useEffect(() => {
    if (!conversation?.id) return;

    let active = true;
    try {
      const streamUrl = `/api/support/stream?conversationId=${encodeURIComponent(conversation.id)}`;
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'NEW_MESSAGE') {
            const newMsg = data.message || {
              id: data.id || `msg_${Date.now()}_${Math.random()}`,
              sender_type: data.senderType,
              sender_name: data.senderName,
              text: data.text,
              suggestions: data.data?.suggestions || [],
              linkedOrderData: data.data?.linkedOrderData || null,
              cardType: data.data?.cardType || null,
              cardData: data.data?.cardData || null,
              created_at: data.timestamp || new Date().toISOString(),
            };
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id || (m.text === newMsg.text && m.sender_type === newMsg.sender_type))) return prev;
              return [...prev, newMsg];
            });
            setIsTyping(false);
          } else if (data.type === 'TYPING') {
            setIsTyping(data.isTyping);
          } else if (data.type === 'CONVERSATION_UPDATED' && data.conversation) {
            setConversation(data.conversation);
          }
        } catch (_) {}
      };

      es.onerror = () => {
        es.close();
      };
    } catch (_) {}

    // Polling safety net every 4 seconds
    const interval = setInterval(() => {
      if (active) {
        fetch('/api/support/conversation', { headers: authHeaders(user) })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.conversation && active) {
              setConversation(data.conversation);
              if (Array.isArray(data.messages)) {
                setMessages(data.messages);
              }
            }
          })
          .catch(() => {});
      }
    }, 4000);

    return () => {
      active = false;
      clearInterval(interval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [conversation?.id]);

  // Send Message Handler
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || sending) return;

    setInputText('');
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      sender_type: 'CUSTOMER',
      sender_name: user?.name || 'You',
      text,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch('/api/support/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(user),
        },
        body: JSON.stringify({
          text,
          name: user?.name || 'Customer',
          phone: user?.phone || queryPhone || '',
          customerId: user?.id,
          orderId: selectedOrderId || orderData?.orderId || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.conversation) {
          setConversation(data.conversation);
        }
        if (Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      }
    } catch (_) {
      showToast('❌ Network issue sending message');
    } finally {
      setSending(false);
    }
  };

  // Request Human Escalation (Connect to Admin)
  const handleConnectToAdmin = async () => {
    await handleSendMessage('I would like to speak directly with an admin / support agent.');
  };

  // CSAT Feedback Submission
  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conversation?.id || submittingFeedback) return;

    setSubmittingFeedback(true);
    try {
      const res = await fetch('/api/support/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(user),
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          rating,
          tags: selectedTags,
          comment: feedbackComment.trim(),
        }),
      });

      if (res.ok) {
        setFeedbackSubmitted(true);
        showToast('⭐ Thank you for your feedback!');
      }
    } catch {
      showToast('❌ Failed to record feedback');
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-4">
      {/* ── Top Header & Breadcrumbs ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Support Online
              </span>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">· 24/7 AI & Team</span>
            </div>
            <h1 className="text-lg sm:text-2xl font-black text-[#001B3A] tracking-tight mt-0.5">
              Blessing Help Center & Live Chat
            </h1>
          </div>
        </div>

        {/* Action Pills */}
        <div className="flex items-center gap-2">
          <a
            href="tel:+919840418228"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all"
          >
            <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">+91 98404 18228</span>
            <span className="sm:hidden">Call</span>
          </a>
          <a
            href="https://wa.me/919840418228?text=Hello%20Blessing%20Power%20Guide%20Support,%20I%20need%20help%20with%20an%20order"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all shadow-2xs"
          >
            <MessageCircle className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
            <span>WhatsApp</span>
          </a>
        </div>
      </div>

      {/* ── Main 2-Column Flipkart Layout ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ── LEFT COLUMN: Selected Order Context & Shortcuts (4 cols) ──────── */}
        <div className="lg:col-span-4 space-y-4">
          {/* Order Selector (if user has orders) */}
          {userOrders.length > 1 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Select Order for Assistance
              </label>
              <select
                value={selectedOrderId}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="w-full text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl p-2.5 outline-none focus:border-blue-600"
              >
                {userOrders.map((o) => (
                  <option key={o.orderId || o.id} value={o.orderId || o.id}>
                    #{o.orderId || o.id} — ₹{o.totalAmount} ({o.orderStatus || o.status || 'Active'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Active Order Card */}
          {selectedOrderId ? (
            <div className="bg-white border border-blue-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5 relative overflow-hidden bg-gradient-to-b from-blue-50/40 via-white to-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider">
                    Linked Order
                  </span>
                  <h3 className="text-lg font-black text-[#001B3A]">#{selectedOrderId}</h3>
                </div>
                {orderData && (
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1 rounded-full border ${
                      orderData.cancelled
                        ? 'bg-red-50 text-red-800 border-red-200'
                        : isParcelDelivered(orderData.status)
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : isDeliveryAttempted(orderData.status)
                            ? 'bg-amber-50 text-amber-900 border-amber-200'
                            : 'bg-blue-50 text-blue-800 border-blue-200'
                    }`}
                  >
                    <Truck className="w-3 h-3" />
                    {orderData.statusHeadline || customerCourierHeadline(orderData.status)}
                  </span>
                )}
              </div>

              {loadingOrder ? (
                <div className="py-4 text-center text-xs text-slate-400 animate-pulse">
                  Loading order details…
                </div>
              ) : orderData ? (
                <div className="space-y-3 pt-1 border-t border-slate-100 text-xs text-slate-600">
                  {orderData.customer?.city && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        Destination: {orderData.customer.city}
                        {orderData.customer.pincode ? ` - ${orderData.customer.pincode}` : ''}
                      </span>
                    </div>
                  )}

                  {orderData.trackingNumber && (
                    <div className="flex items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-700">
                      <div className="truncate">
                        <span className="text-[10px] font-bold text-slate-400 block uppercase">
                          ST Courier AWB
                        </span>
                        <span className="font-mono font-bold text-xs">{orderData.trackingNumber}</span>
                      </div>
                      <Link
                        href={`/track?orderId=${encodeURIComponent(selectedOrderId)}`}
                        className="text-[11px] font-extrabold text-[#2874f0] hover:underline shrink-0 flex items-center gap-1"
                      >
                        Track <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  )}

                  {Array.isArray(orderData.items) && orderData.items.length > 0 && (
                    <div>
                      <p className="text-[10.5px] font-bold text-slate-400 uppercase mb-1.5">
                        Items ({orderData.items.length})
                      </p>
                      <ul className="space-y-1">
                        {orderData.items.map((it: any, i: number) => (
                          <li key={i} className="flex justify-between items-center text-[11.5px] text-slate-700 font-medium">
                            <span className="truncate">{it.title}</span>
                            <span className="text-slate-400 font-bold ml-2 shrink-0">×{it.qty}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Link
                    href={`/track?orderId=${encodeURIComponent(selectedOrderId)}`}
                    className="block text-center w-full py-2.5 rounded-xl text-xs font-extrabold bg-[#001B3A] text-white hover:bg-blue-900 transition-colors shadow-2xs mt-2"
                  >
                    View Full Tracking Timeline
                  </Link>
                </div>
              ) : (
                <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl">
                  Order status will be dynamically verified by our AI Assistant in the chat.
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-2">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <HelpCircle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Tracking an Order?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Type your Order ID (e.g. <strong>BPG-1048</strong>) or 10-digit phone number in the chat window to get instant real-time shipment updates.
              </p>
            </div>
          )}

          {/* Quick Issue Questions */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-2.5">
            <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Quick Questions
            </h4>
            <div className="space-y-1.5">
              {COMMON_QUERIES.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(q)}
                  className="w-full text-left p-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200/80 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <span className="truncate">{q}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 ml-1" />
                </button>
              ))}
            </div>
          </div>

          {/* Store Guarantees Card */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-bold text-slate-800">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Blessing Guarantee</span>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Free immediate replacement for misprinted or transit-damaged books. All shipments handled via priority ST Courier Express from Chennai.
            </p>
          </div>
        </div>

        {/* ── RIGHT COLUMN: Main Chat & Real-Time Interaction Canvas (8 cols) ─ */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col h-[750px] max-h-[85vh] overflow-hidden">
          {/* ── Chat Header ─────────────────────────────────────────────────── */}
          <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-2xl bg-[#001B3A] text-white flex items-center justify-center shadow-xs">
                  {conversation?.status === 'ACTIVE' ? (
                    <Headphones className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Bot className="w-5 h-5 text-blue-300" />
                  )}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-[#001B3A]">
                    {conversation?.status === 'ACTIVE' && conversation.assigned_admin_name
                      ? `Staff: ${conversation.assigned_admin_name}`
                      : 'Blessing AI Support Assistant'}
                  </h3>
                  <span
                    className={`text-[9.5px] font-extrabold px-2 py-0.5 rounded-full ${
                      conversation?.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : conversation?.status === 'WAITING_ADMIN'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                    }`}
                  >
                    {conversation?.status === 'ACTIVE'
                      ? 'Live Chatting'
                      : conversation?.status === 'WAITING_ADMIN'
                        ? 'Connecting Staff…'
                        : 'Instant AI Answers'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  {conversation?.status === 'ACTIVE'
                    ? 'Connected directly with store staff'
                    : 'Grounded in Tamil Nadu syllabus, order tracking, and delivery rules'}
                </p>
              </div>
            </div>

            {/* Handoff to Human Button (If in BOT mode) */}
            {conversation?.status === 'BOT' && (
              <button
                onClick={handleConnectToAdmin}
                className="text-[11px] font-extrabold px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <Headphones className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Talk to Admin</span>
                <span className="sm:hidden">Admin</span>
              </button>
            )}
          </div>

          {/* ── Waiting on Admin Banner ─────────────────────────────────────── */}
          {conversation?.status === 'WAITING_ADMIN' && (
            <div className="bg-amber-50 border-b border-amber-200 p-2.5 px-4 text-xs text-amber-900 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                <span className="font-bold">
                  Connecting to support staff… Available admins have been alerted.
                </span>
              </div>
              <span className="text-[10px] text-amber-700 font-semibold hidden sm:inline">
                Please stay on this page
              </span>
            </div>
          )}

          {/* ── Message Stream ──────────────────────────────────────────────── */}
          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-slate-50/40 text-xs custom-scrollbar"
          >
            {/* Greeting welcome banner */}
            <div className="bg-white border border-blue-100 rounded-2xl p-4 text-slate-700 space-y-1.5 shadow-2xs">
              <div className="flex items-center gap-2 text-[#2874f0] font-black text-xs">
                <Sparkles className="w-4 h-4" />
                <span>Welcome to Blessing Customer Support!</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                I can check real-time courier tracking, provide syllabus information, handle damaged book replacements, or immediately connect you with our Chennai office team.
              </p>
            </div>

            {/* Conversation Messages */}
            {messages.map((msg, index) => {
              const isCust = msg.sender_type === 'CUSTOMER';
              const isSys = msg.sender_type === 'SYSTEM';

              if (isSys) {
                return (
                  <div key={msg.id || index} className="text-center my-3">
                    <span className="inline-block px-3.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-[10.5px] font-bold rounded-full shadow-2xs">
                      {msg.text}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id || index}
                  className={`flex flex-col ${isCust ? 'items-end' : 'items-start'} space-y-1`}
                >
                  <span className="text-[10px] font-bold text-slate-400 px-1">
                    {msg.sender_name}
                  </span>
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                      isCust
                        ? 'bg-[#2874f0] text-white rounded-br-xs'
                        : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs'
                    }`}
                  >
                    <ChatMarkdown content={msg.text} isCustomer={isCust} />

                    {/* Interactive Action Card (e.g. Order Tracking Card, Books Showcase, Contact) */}
                    {!isCust && (msg.linkedOrderData || msg.cardType) && (
                      <ChatInteractiveCard
                        cardType={msg.cardType}
                        linkedOrderData={msg.linkedOrderData}
                        cardData={msg.cardData}
                        onSendMessage={handleSendMessage}
                        onEscalateAdmin={handleConnectToAdmin}
                      />
                    )}

                    {/* Interactive Action Buttons attached to this message */}
                    {!isCust && Array.isArray(msg.suggestions) && msg.suggestions.length > 0 && (
                      <ChatSuggestionButtons
                        suggestions={msg.suggestions}
                        orderId={msg.linkedOrderData?.orderId || conversation?.order_id || selectedOrderId}
                        onSendMessage={handleSendMessage}
                        onEscalateAdmin={handleConnectToAdmin}
                      />
                    )}

                    <div
                      className={`flex items-center justify-end gap-1 mt-1.5 text-[9.5px] ${
                        isCust ? 'text-blue-200' : 'text-slate-400'
                      }`}
                    >
                      <Clock className="w-2.5 h-2.5" />
                      <span>
                        {new Date(msg.created_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {isCust && <CheckCheck className="w-3 h-3 text-emerald-300" />}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Staff or AI typing indicator */}
            {isTyping && (
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold p-1 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
                <span className="ml-1 text-[10.5px]">Typing response…</span>
              </div>
            )}

            {/* ── In-Chat 1-Tap CSAT Feedback Card (When Resolved) ──────────── */}
            {conversation?.status === 'RESOLVED' && !feedbackSubmitted && (
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3 mt-4 animate-fade-slide-up shadow-xs">
                <div className="text-center space-y-1">
                  <h4 className="font-black text-sm text-amber-900">How was your support experience?</h4>
                  <p className="text-xs text-amber-700">
                    Your quick rating helps us maintain top-tier service across Tamil Nadu.
                  </p>
                </div>

                <div className="flex justify-center gap-2 py-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 hover:scale-120 transition-transform cursor-pointer"
                    >
                      <Star
                        className={`w-7 h-7 ${
                          star <= rating
                            ? 'text-amber-500 fill-amber-400'
                            : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-1.5 justify-center">
                  {FEEDBACK_TAGS.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className={`text-[11px] font-bold px-3 py-1 rounded-full border transition-all cursor-pointer ${
                          active
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    placeholder="Optional message or praise…"
                    className="flex-1 px-3 py-2 text-xs border border-amber-200 rounded-xl bg-white outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleFeedbackSubmit}
                    disabled={submittingFeedback}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl transition-all disabled:opacity-60 cursor-pointer shadow-2xs"
                  >
                    {submittingFeedback ? 'Saving…' : 'Submit'}
                  </button>
                </div>
              </div>
            )}

            {feedbackSubmitted && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-center text-xs font-bold text-emerald-800 animate-fade-slide-up shadow-2xs">
                ✅ Thank you! Your rating has been recorded.
              </div>
            )}
          </div>

          {/* ── Quick Action Chips & Input Box ─────────────────────────────── */}
          <div className="p-3 sm:p-4 border-t border-slate-200 bg-white shrink-0 space-y-2.5">
            {/* Quick 1-Tap Action Pills */}
            <ChatQuickMenu
              onSendMessage={handleSendMessage}
              onEscalateAdmin={handleConnectToAdmin}
            />

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask a question or type your order ID (e.g. BPG-1048)…"
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm outline-none focus:border-blue-600 focus:bg-white transition-all shadow-inner"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || sending}
                className="p-3 bg-[#001B3A] hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-md"
                title="Send message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HelpCenterPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans page-mobile-nav">
      <AnnouncementBar />
      <Header />
      <main className="flex-1">
        <Suspense fallback={<div className="text-center py-16 text-slate-400 text-sm">Loading Help Center…</div>}>
          <HelpCenterContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
