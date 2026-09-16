'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  MessageSquare,
  X,
  Send,
  User,
  Bot,
  Star,
  CheckCheck,
  Headphones,
  ChevronDown,
  Clock,
  Sparkles,
  ArrowRight,
  Maximize2,
  RefreshCw,
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { authHeaders } from '@/lib/clientAuth';
import { ChatMarkdown } from './ChatMarkdown';
import { ChatInteractiveCard } from './ChatInteractiveCard';
import { ChatSuggestionButtons } from './ChatSuggestionButtons';
import { ChatQuickMenu } from './ChatQuickMenu';

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
}

const QUICK_SUGGESTIONS = [
  '🚚 Where is my order?',
  '📚 10th Standard Guides',
  '📦 What are the shipping charges?',
  '👨‍💼 Talk to Admin',
];

const FEEDBACK_TAGS = ['⚡ Quick Solution', '🤝 Friendly Staff', '📦 Order Tracked', '📚 Helpful Details'];

export const BlessingChatWidget: React.FC = () => {
  const pathname = usePathname();
  const { user } = useStore();

  const [isOpen, setIsOpen] = useState(false);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [rating, setRating] = useState(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showFeedbackPrompt, setShowFeedbackPrompt] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const prevPathnameRef = useRef(pathname);

  const isStorefront = !pathname?.startsWith('/admin') && pathname !== '/help' && pathname !== '/support';

  // Auto-close chat widget window when user navigates to another page
  // (Window minimizes to not block the new page, but session and conversation history are preserved)
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setIsOpen(false);
    }
  }, [pathname]);

  // Auto-scroll to latest message inside chat widget only
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
    if (isOpen) {
      scrollToBottom('auto');
      setUnreadCount(0);
    }
  }, [isOpen, messages]);

  // Load conversation & messages
  const loadConversation = useCallback(async () => {
    try {
      const savedConvId = typeof window !== 'undefined' ? localStorage.getItem('bpg_support_conv_id') : null;
      const convUrl = savedConvId
        ? `/api/support/conversation?id=${encodeURIComponent(savedConvId)}`
        : '/api/support/conversation';

      const res = await fetch(convUrl, {
        headers: authHeaders(user),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.conversation) {
          setConversation(data.conversation);
          setMessages(data.messages || []);
          if (data.feedbackSubmitted) {
            setFeedbackSubmitted(true);
          }
          if (typeof window !== 'undefined' && data.conversation.id) {
            localStorage.setItem('bpg_support_conv_id', data.conversation.id);
          }
        } else {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('bpg_support_conv_id');
          }
        }
      }
    } catch (_) {}
  }, [user]);

  useEffect(() => {
    if (isStorefront) {
      loadConversation();
    }
  }, [isStorefront, loadConversation]);

  // Connect SSE for real-time messages & updates
  useEffect(() => {
    if (!isStorefront || !conversation?.id) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/support/stream?conversationId=${encodeURIComponent(conversation.id)}`);
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
            if (prev.some((m) => m.id === newMsg.id || (m.text === newMsg.text && m.sender_type === newMsg.sender_type))) {
              return prev;
            }
            return [...prev, newMsg];
          });
          if (!isOpen && newMsg.sender_type !== 'CUSTOMER') {
            setUnreadCount((c) => c + 1);
          }
        } else if (data.type === 'CHAT_CLAIMED') {
          setConversation((prev) =>
            prev ? { ...prev, status: 'ACTIVE', assigned_admin_name: data.assignedAdminName } : null
          );
        } else if (data.type === 'CHAT_RESOLVED') {
          setConversation((prev) => (prev ? { ...prev, status: 'RESOLVED' } : null));
        } else if (data.type === 'TYPING' && data.senderType === 'ADMIN') {
          setIsTyping(true);
          setTimeout(() => setIsTyping(false), 3000);
        }
      } catch (_) {}
    };

    let reconnectTimer: NodeJS.Timeout | null = null;
    let reconnectDelay = 1000;

    es.onerror = () => {
      es.close();
      // Incremental catch-up after disconnection
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(async () => {
          try {
            const lastMsg = messages[messages.length - 1];
            const afterParam = lastMsg?.id ? `&afterId=${encodeURIComponent(lastMsg.id)}` : '';
            const res = await fetch(`/api/support/conversation?id=${encodeURIComponent(conversation.id)}${afterParam}`, {
              headers: authHeaders(user),
            });
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data.messages) && data.messages.length > 0) {
                setMessages((prev) => {
                  const existingIds = new Set(prev.map((m) => m.id));
                  const newItems = data.messages.filter((m: any) => !existingIds.has(m.id));
                  return newItems.length > 0 ? [...prev, ...newItems] : prev;
                });
              }
            }
          } catch (_) {}
          reconnectDelay = Math.min(reconnectDelay * 1.5, 10000);
          reconnectTimer = null;
        }, reconnectDelay);
      }
    };

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es.close();
      eventSourceRef.current = null;
    };
  }, [isStorefront, conversation?.id, isOpen, messages, user]);

  // Send message handler
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    setInputText('');
    setLoading(true);

    const isEscalation = text.toLowerCase().includes('talk to admin') || text.toLowerCase().includes('human');

    // Client-side unique message ID for idempotency and de-duplication
    const clientMessageId = `msg_c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const optimisticMsg: Message = {
      id: clientMessageId,
      sender_type: 'CUSTOMER',
      sender_name: user?.name || 'Me',
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
          conversationId: conversation?.id,
          clientMessageId,
          text,
          action: isEscalation ? 'escalate_human' : undefined,
          name: user?.name || 'Customer',
          phone: user?.phone || '',
          customerId: user?.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.conversationId) {
          setConversation((prev) => ({
            id: data.conversationId,
            status: data.status || prev?.status || 'BOT',
          }));
          if (typeof window !== 'undefined') {
            localStorage.setItem('bpg_support_conv_id', data.conversationId);
          }
        } else if (data.conversation?.id) {
          setConversation(data.conversation);
          if (typeof window !== 'undefined') {
            localStorage.setItem('bpg_support_conv_id', data.conversation.id);
          }
        } else if (data.status) {
          setConversation((prev) => (prev ? { ...prev, status: data.status } : null));
        }

        // If system message returned (e.g. connecting staff)
        if (data.systemMessage) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.systemMessage.id)) return prev;
            return [...prev, data.systemMessage];
          });
        }

        // If RAG returned rich aiMessage or text reply
        if (data.aiMessage) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === data.aiMessage.id)) return prev;
            return [...prev, data.aiMessage];
          });
        } else if (data.reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: `ai_${Date.now()}`,
              sender_type: 'AI',
              sender_name: 'Blessing AI Assistant',
              text: data.reply,
              suggestions: data.suggestions || [],
              created_at: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  // Start a Clean, Brand-New Help Session with a Fresh Unique ID
  const handleStartFreshSession = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/support/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(user),
        },
        body: JSON.stringify({
          action: 'start_fresh',
          name: user?.name || 'Customer',
          phone: user?.phone || '',
          customerId: user?.id,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.conversation) {
          setConversation(data.conversation);
          setMessages(data.messages || []);
          if (typeof window !== 'undefined' && data.conversation.id) {
            localStorage.setItem('bpg_support_conv_id', data.conversation.id);
          }
        }
      }
    } catch (_) {
    } finally {
      setShowFeedbackPrompt(false);
      setFeedbackSubmitted(false);
      setInputText('');
      setLoading(false);
    }
  };

  // Close / End Chat handler
  const handleCloseChat = async (forceClose: boolean = false) => {
    // If user chatted (messages.length >= 2) and hasn't submitted feedback, prompt CSAT first!
    if (!forceClose && !feedbackSubmitted && messages.length >= 2 && !showFeedbackPrompt) {
      setShowFeedbackPrompt(true);
      if (conversation?.id) {
        fetch('/api/support/conversation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(user),
          },
          body: JSON.stringify({
            action: 'resolve_for_feedback',
            conversationId: conversation.id,
          }),
        }).catch(() => {});
        setConversation((prev) => prev ? { ...prev, status: 'RESOLVED' } : null);
      }
      setTimeout(() => scrollToBottom('smooth'), 100);
      return;
    }

    await handleStartFreshSession();
  };

  // Minimize or close widget window without destroying session
  const handleMinimize = () => {
    setIsOpen(false);
  };

  // 1-Click Human Escalation
  const handleEscalateToHuman = async () => {
    if (loading || conversation?.status === 'WAITING_ADMIN' || conversation?.status === 'ACTIVE') {
      return;
    }

    if (!conversation?.id) {
      await handleSendMessage('I want to talk to an admin.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/support/conversation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(user),
        },
        body: JSON.stringify({
          conversationId: conversation.id,
          action: 'escalate_human',
          name: user?.name || 'Customer',
          phone: user?.phone || '',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversation((prev) => (prev ? { ...prev, status: 'WAITING_ADMIN' } : null));
        setMessages((prev) => [
          ...prev,
          {
            id: `sys_${Date.now()}`,
            sender_type: 'SYSTEM',
            sender_name: 'System',
            text: '⏳ Connecting you to our support team... Your request is in the admin queue.',
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Submit CSAT Feedback
  const handleSubmitFeedback = async () => {
    if (!conversation?.id) return;
    try {
      const res = await fetch('/api/support/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation.id,
          rating,
          tags: selectedTags,
          comment: feedbackComment,
        }),
      });
      if (res.ok) {
        setFeedbackSubmitted(true);
        setShowFeedbackPrompt(false);

        // Automatically start fresh session with brand-new unique ID after 1.2s
        setTimeout(() => {
          handleStartFreshSession();
        }, 1200);
      }
    } catch (_) {}
  };

  if (!isStorefront) return null;

  const isPDP = pathname?.startsWith('/products/');

  return (
    <>
      {/* ─── Floating Chat Trigger Button ──────────────────────────────────── */}
      {!isOpen && (
        <div
          className={`fixed ${
            isPDP
              ? 'bottom-[calc(8.5rem+env(safe-area-inset-bottom))]'
              : 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'
          } left-3 sm:bottom-6 sm:left-6 z-40`}
        >
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center gap-2 sm:gap-2.5 px-3.5 py-2.5 sm:px-4.5 sm:py-3 rounded-full bg-gradient-to-r from-[#001b3a] via-[#002855] to-[#001b3a] text-white shadow-[0_8px_30px_rgba(0,27,58,0.4)] hover:shadow-[0_12px_35px_rgba(0,27,58,0.5)] hover:scale-105 active:scale-95 transition-all duration-200 border border-amber-400/30 cursor-pointer"
            aria-label="Open Live Support Chat"
          >
            <span className="relative flex items-center justify-center">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 fill-amber-400/20" />
              {/* Online pulse indicator */}
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 ring-2 ring-[#001b3a]"></span>
              </span>
            </span>
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[9px] sm:text-[10px] uppercase font-black tracking-wider text-amber-300 flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                Live Support
              </span>
              <span className="text-[11px] sm:text-xs font-extrabold text-white flex items-center gap-1">
                Chat with Us
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full ml-1 animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ─── Live Chat Window / Mobile Drawer ───────────────────────────────── */}
      {isOpen && (
        <>
          {/* Mobile Backdrop overlay (tap to minimize) */}
          <div
            onClick={handleMinimize}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] z-50 sm:hidden transition-opacity"
            aria-hidden="true"
          />

          <div className="fixed inset-x-0 bottom-0 top-10 sm:top-auto sm:right-auto sm:bottom-6 sm:left-6 sm:w-[420px] sm:h-[640px] sm:max-h-[calc(100vh-2.5rem)] z-50 flex flex-col bg-white rounded-t-[28px] sm:rounded-3xl shadow-[0_25px_70px_-15px_rgba(0,27,58,0.4)] border border-slate-200/80 overflow-hidden transition-all duration-300">
            {/* Header */}
            <div className="bg-gradient-to-r from-[#001b3a] via-[#002855] to-[#001b3a] text-white p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] flex flex-col border-b border-white/10 shrink-0">
              {/* Mobile pull handle */}
              <div
                onClick={handleMinimize}
                className="w-12 h-1 rounded-full bg-white/30 hover:bg-white/50 mx-auto mb-2.5 sm:hidden cursor-pointer"
                title="Swipe down or tap to close"
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20 text-amber-300 shrink-0 shadow-inner">
                    {conversation?.status === 'ACTIVE' ? (
                      <User className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Bot className="w-5 h-5 text-amber-300" />
                    )}
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#001b3a] shadow-xs"></span>
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm sm:text-[15px] flex items-center gap-1.5 text-white tracking-tight">
                      {conversation?.status === 'ACTIVE'
                        ? `${conversation.assigned_admin_name || 'Staff'} (Blessing Support)`
                        : 'Blessing Help Desk'}
                    </h3>
                    <p className="text-[10.5px] sm:text-[11px] text-slate-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                      {conversation?.status === 'ACTIVE'
                        ? '🟢 Staff Online (Direct Support)'
                        : conversation?.status === 'WAITING_ADMIN'
                        ? '⏳ Connecting you to Staff...'
                        : '⚡ Instant AI · 24/7 Support'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {conversation && messages.length >= 2 && !feedbackSubmitted && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowFeedbackPrompt(true);
                        setTimeout(() => scrollToBottom('smooth'), 100);
                      }}
                      className="px-2 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-extrabold rounded-lg flex items-center gap-1 border border-amber-400/30 transition-colors"
                      title="Rate support experience"
                    >
                      <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
                      <span className="hidden xs:inline">Rate</span>
                    </button>
                  )}
                  {conversation && (
                    <button
                      type="button"
                      onClick={() => handleCloseChat(false)}
                      disabled={loading}
                      className="p-2 text-slate-300 hover:text-amber-300 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                      title="Start fresh conversation"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  <Link
                    href="/help"
                    onClick={() => setIsOpen(false)}
                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer hidden xs:flex items-center justify-center"
                    title="Open in full screen"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={handleMinimize}
                    className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                    title="Minimize chat"
                  >
                    <ChevronDown className="w-5 h-5 sm:hidden" />
                    <X className="w-5 h-5 hidden sm:block" />
                  </button>
                </div>
              </div>
            </div>

            {/* Messages Stream */}
            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-3.5 sm:p-4 space-y-3 bg-slate-50/60 text-xs custom-scrollbar"
            >
              {/* Warm Welcome Greeting Card */}
              <div className="bg-gradient-to-br from-blue-50/90 to-indigo-50/80 border border-blue-100/90 rounded-2xl p-3.5 sm:p-4 text-slate-700 space-y-2.5 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-6 h-6 rounded-lg bg-[#001b3a] text-amber-400 flex items-center justify-center text-xs font-black">
                      👑
                    </span>
                    <span className="font-extrabold text-xs text-[#001b3a]">
                      Blessing Power Guide
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                    ⚡ Online 24/7
                  </span>
                </div>

                <p className="text-[11.5px] sm:text-xs text-slate-600 leading-relaxed">
                  Vanakkam! 🙏 How can we help you today? Ask about 10th guides, real-time ST Courier tracking, or click below for instant help:
                </p>

                {/* Instant 1-Tap Quick Action Cards */}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSendMessage('Where is my order?')}
                    className="flex items-center gap-1.5 p-2 rounded-xl bg-white hover:bg-blue-50 border border-slate-200/90 hover:border-blue-300 text-left transition-all group cursor-pointer shadow-2xs"
                  >
                    <span className="text-sm">🚚</span>
                    <div className="leading-tight">
                      <span className="text-[11px] font-extrabold text-slate-800 group-hover:text-blue-700 block">
                        Track Order
                      </span>
                      <span className="text-[9.5px] text-slate-400 block">Live status</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendMessage('What guides are available for 10th standard?')}
                    className="flex items-center gap-1.5 p-2 rounded-xl bg-white hover:bg-blue-50 border border-slate-200/90 hover:border-blue-300 text-left transition-all group cursor-pointer shadow-2xs"
                  >
                    <span className="text-sm">📚</span>
                    <div className="leading-tight">
                      <span className="text-[11px] font-extrabold text-slate-800 group-hover:text-blue-700 block">
                        10th Guides
                      </span>
                      <span className="text-[9.5px] text-slate-400 block">Books & prices</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendMessage('What are the payment options and discounts?')}
                    className="flex items-center gap-1.5 p-2 rounded-xl bg-white hover:bg-blue-50 border border-slate-200/90 hover:border-blue-300 text-left transition-all group cursor-pointer shadow-2xs"
                  >
                    <span className="text-sm">💳</span>
                    <div className="leading-tight">
                      <span className="text-[11px] font-extrabold text-slate-800 group-hover:text-blue-700 block">
                        Payments
                      </span>
                      <span className="text-[9.5px] text-slate-400 block">UPI / Offers</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={handleEscalateToHuman}
                    className="flex items-center gap-1.5 p-2 rounded-xl bg-white hover:bg-blue-50 border border-slate-200/90 hover:border-blue-300 text-left transition-all group cursor-pointer shadow-2xs"
                  >
                    <span className="text-sm">👨‍💼</span>
                    <div className="leading-tight">
                      <span className="text-[11px] font-extrabold text-slate-800 group-hover:text-blue-700 block">
                        Talk to Staff
                      </span>
                      <span className="text-[9.5px] text-slate-400 block">Direct help</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Render conversation messages */}
              {messages.map((msg, index) => {
                const isCust = msg.sender_type === 'CUSTOMER';
                const isSys = msg.sender_type === 'SYSTEM';

                if (isSys) {
                  return (
                    <div key={msg.id || index} className="text-center my-2">
                      <span className="inline-block px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold rounded-full shadow-2xs">
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
                    <span className="text-[9.5px] font-bold text-slate-400 px-1">
                      {msg.sender_name}
                    </span>
                    <div
                      className={`max-w-[88%] sm:max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                        isCust
                          ? 'bg-[#1a5dc7] text-white rounded-br-xs shadow-xs'
                          : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-xs shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                      }`}
                    >
                      <ChatMarkdown content={msg.text} isCustomer={isCust} />

                      {/* Interactive Action Card */}
                      {!isCust && (msg.linkedOrderData || msg.cardType) && (
                        <ChatInteractiveCard
                          cardType={msg.cardType}
                          linkedOrderData={msg.linkedOrderData}
                          cardData={msg.cardData}
                          onSendMessage={handleSendMessage}
                          onEscalateAdmin={handleEscalateToHuman}
                        />
                      )}

                      {/* Interactive Action Buttons */}
                      {!isCust && Array.isArray(msg.suggestions) && msg.suggestions.length > 0 && (
                        <ChatSuggestionButtons
                          suggestions={msg.suggestions}
                          orderId={msg.linkedOrderData?.orderId}
                          onSendMessage={handleSendMessage}
                          onEscalateAdmin={handleEscalateToHuman}
                        />
                      )}

                      <div
                        className={`flex items-center justify-end gap-1 mt-1 text-[9px] ${
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

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-bold p-1 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce"></span>
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]"></span>
                  <span className="ml-1 text-[10px]">Staff is typing...</span>
                </div>
              )}

              {/* ─── In-Chat 1-Tap CSAT Feedback Card ─────────────────────────── */}
              {(conversation?.status === 'RESOLVED' || showFeedbackPrompt) && !feedbackSubmitted && (
                <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 space-y-3 mt-4 animate-fade-slide-up shadow-sm">
                  <div className="text-center space-y-1">
                    <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-amber-800 bg-amber-200/60 px-2.5 py-0.5 rounded-full">
                      ⭐ Support Feedback
                    </span>
                    <h4 className="font-extrabold text-xs text-amber-950">How was your support experience?</h4>
                    <p className="text-[10.5px] text-amber-800/90">
                      Your rating helps us keep delivery and customer care top-notch.
                    </p>
                  </div>

                  <div className="flex justify-center gap-1.5 py-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="p-1 hover:scale-115 transition-transform cursor-pointer"
                      >
                        <Star
                          className={`w-6 h-6 ${
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
                          onClick={() =>
                            setSelectedTags((prev) =>
                              active ? prev.filter((t) => t !== tag) : [...prev, tag]
                            )
                          }
                          className={`text-[10px] px-2.5 py-1 rounded-full font-bold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                              : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    placeholder="Optional comment or praise..."
                    value={feedbackComment}
                    onChange={(e) => setFeedbackComment(e.target.value)}
                    className="w-full text-xs p-2 bg-white border border-amber-200 rounded-xl outline-none text-slate-800"
                  />

                  <button
                    type="button"
                    onClick={handleSubmitFeedback}
                    className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Submit Feedback ⭐
                  </button>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={handleStartFreshSession}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline cursor-pointer"
                    >
                      Skip & Start Fresh Session
                    </button>
                  </div>
                </div>
              )}

              {feedbackSubmitted && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-2xl text-center text-xs font-bold space-y-2">
                  <div>✓ Thank you for your feedback! We look forward to serving you again.</div>
                  <div className="text-[10.5px] text-emerald-600 font-medium">
                    Starting your new help session...
                  </div>
                  <button
                    type="button"
                    onClick={handleStartFreshSession}
                    className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-[10.5px] font-extrabold rounded-lg cursor-pointer transition-all shadow-2xs"
                  >
                    Start Fresh Session Now
                  </button>
                </div>
              )}

              {conversation?.status === 'RESOLVED' && !showFeedbackPrompt && !feedbackSubmitted && (
                <div className="text-center pt-2 pb-1">
                  <button
                    type="button"
                    onClick={handleStartFreshSession}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#001B3A] text-white hover:bg-blue-900 transition-all shadow-sm cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Start New Conversation</span>
                  </button>
                </div>
              )}
            </div>

            {/* Quick Suggestions Bar */}
            {conversation?.status !== 'RESOLVED' && (
              <div className="px-2 sm:px-2.5 py-1.5 bg-slate-50 border-t border-slate-100 shrink-0">
                <ChatQuickMenu
                  onSendMessage={handleSendMessage}
                  onEscalateAdmin={handleEscalateToHuman}
                />
              </div>
            )}

            {/* Input Footer */}
            <div className="p-2.5 sm:p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex-1 flex items-center bg-slate-100/90 hover:bg-slate-100 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#2874f0]/30 border border-slate-200 rounded-full pl-3.5 pr-1.5 py-1 transition-all">
                <input
                  type="text"
                  placeholder={
                    conversation?.status === 'ACTIVE'
                      ? 'Type your message to support...'
                      : 'Ask question or type order #...'
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onFocus={() => {
                    setTimeout(() => scrollToBottom('smooth'), 200);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  disabled={loading}
                  className="flex-1 bg-transparent border-0 outline-none text-[16px] sm:text-xs text-slate-800 placeholder:text-slate-400 py-1"
                />
                {inputText.trim() && (
                  <button
                    type="button"
                    onClick={() => setInputText('')}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer mr-1"
                    title="Clear"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSendMessage()}
                  disabled={loading || !inputText.trim()}
                  className="w-8 h-8 rounded-full bg-[#1a5dc7] hover:bg-blue-700 active:scale-95 disabled:opacity-35 text-white transition-all shadow-xs cursor-pointer flex items-center justify-center shrink-0"
                  title="Send message"
                >
                  <Send className="w-3.5 h-3.5 ml-0.5" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};
