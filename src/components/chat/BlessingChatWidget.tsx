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
} from 'lucide-react';
import { useStore } from '@/context/StoreContext';
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

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const isStorefront = !pathname?.startsWith('/admin');

  // Auto-scroll to latest message
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
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
      const res = await fetch('/api/support/conversation');
      if (res.ok) {
        const data = await res.json();
        if (data.conversation) {
          setConversation(data.conversation);
          setMessages(data.messages || []);
        }
      }
    } catch (_) {}
  }, []);

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

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isStorefront, conversation?.id, isOpen]);

  // Send message handler
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text || loading) return;

    setInputText('');
    setLoading(true);

    const isEscalation = text.toLowerCase().includes('talk to admin') || text.toLowerCase().includes('human');

    // Optimistic UI for customer message
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      sender_type: 'CUSTOMER',
      sender_name: user?.name || 'Me',
      text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await fetch('/api/support/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: conversation?.id,
          text,
          action: isEscalation ? 'escalate_human' : undefined,
          name: user?.name || 'Customer',
          phone: user?.phone || '',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (!conversation && data.conversationId) {
          setConversation({
            id: data.conversationId,
            status: data.status || 'BOT',
          });
        } else if (data.status) {
          setConversation((prev) => (prev ? { ...prev, status: data.status } : null));
        }

        // If RAG returned immediate reply in BOT mode
        if (data.reply) {
          setMessages((prev) => [
            ...prev,
            {
              id: `ai_${Date.now()}`,
              sender_type: 'AI',
              sender_name: 'Blessing AI Assistant',
              text: data.reply,
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

  // 1-Click Human Escalation
  const handleEscalateToHuman = async () => {
    if (!conversation?.id) {
      await handleSendMessage('I want to talk to an admin.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/support/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      }
    } catch (_) {}
  };

  if (!isStorefront) return null;

  return (
    <>
      {/* ─── Floating Chat Trigger Button ──────────────────────────────────── */}
      {!isOpen && (
        <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-3.5 md:bottom-6 md:left-6 z-40">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center gap-2.5 px-4 py-3 rounded-full bg-[#001b3a] text-white shadow-[0_8px_25px_rgba(0,27,58,0.35)] hover:bg-[#002855] hover:scale-105 active:scale-95 transition-all duration-200 border border-white/20 cursor-pointer"
            aria-label="Open Live Support Chat"
          >
            <span className="relative flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-[#fbbf24] fill-current" />
              {/* Online indicator */}
              <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
            </span>
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[10px] uppercase font-black tracking-wider text-amber-400">
                Live Support
              </span>
              <span className="text-xs font-bold text-white flex items-center gap-1">
                Chat with Us
                {unreadCount > 0 && (
                  <span className="bg-red-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full ml-1">
                    {unreadCount}
                  </span>
                )}
              </span>
            </div>
          </button>
        </div>
      )}

      {/* ─── Live Chat Window / Drawer ─────────────────────────────────────── */}
      {isOpen && (
        <div className="fixed inset-0 sm:inset-auto sm:bottom-6 sm:left-6 z-50 sm:w-[390px] sm:h-[580px] flex flex-col bg-white sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-fade-slide-up">
          {/* Header */}
          <div className="bg-[#001b3a] text-white p-4 flex items-center justify-between border-b border-white/10 shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20 text-[#fbbf24]">
                {conversation?.status === 'ACTIVE' ? (
                  <User className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Bot className="w-5 h-5" />
                )}
                <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#001b3a]"></span>
              </div>
              <div>
                <h3 className="font-extrabold text-sm flex items-center gap-1.5 text-white">
                  {conversation?.status === 'ACTIVE'
                    ? `${conversation.assigned_admin_name || 'Staff'} (Blessing Support)`
                    : 'Blessing AI Assistant'}
                </h3>
                <p className="text-[11px] text-slate-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse"></span>
                  {conversation?.status === 'ACTIVE'
                    ? '🟢 Active with support agent'
                    : conversation?.status === 'WAITING_ADMIN'
                    ? '⏳ Connecting you to an agent...'
                    : '⚡ Instant AI answers · 24/7'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Link
                href="/help"
                onClick={() => setIsOpen(false)}
                className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                title="Open in full screen"
              >
                <Maximize2 className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                title="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50 text-xs custom-scrollbar">
            {/* Greeting card */}
            <div className="bg-blue-50/80 border border-blue-100 rounded-2xl p-3 text-slate-700 space-y-1">
              <p className="font-bold text-xs text-[#2874f0] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Welcome to Blessing Power Guide!
              </p>
              <p className="text-[11px] text-slate-600 leading-relaxed">
                Ask anything about 10th guides, real-time tracking, or click below to speak directly with an admin.
              </p>
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
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
                      isCust
                        ? 'bg-[#2874f0] text-white rounded-br-xs shadow-xs'
                        : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs shadow-xs'
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
                        onEscalateAdmin={handleEscalateToHuman}
                      />
                    )}

                    {/* Interactive Action Buttons attached to this message */}
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

            {/* ─── In-Chat 1-Tap CSAT Feedback Card (When Resolved) ───────────── */}
            {conversation?.status === 'RESOLVED' && !feedbackSubmitted && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3 mt-4 animate-fade-slide-up">
                <div className="text-center space-y-1">
                  <h4 className="font-extrabold text-xs text-amber-900">How was your support experience?</h4>
                  <p className="text-[10.5px] text-amber-700">
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
                            ? 'bg-amber-500 text-white border-amber-600'
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
                  placeholder="Optional comment..."
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
              </div>
            )}

            {feedbackSubmitted && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-2xl text-center text-xs font-bold">
                ✓ Thank you for your feedback! We look forward to serving you again.
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions Bar */}
          {conversation?.status !== 'RESOLVED' && (
            <div className="px-2.5 py-2 bg-slate-50 border-t border-slate-100 shrink-0">
              <ChatQuickMenu
                onSendMessage={handleSendMessage}
                onEscalateAdmin={handleEscalateToHuman}
              />
            </div>
          )}

          {/* Input Footer */}
          <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0">
            <input
              type="text"
              placeholder={
                conversation?.status === 'ACTIVE'
                  ? 'Type your message to support...'
                  : 'Ask question or type order #...'
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={loading}
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:bg-white focus:border-[#2874f0] text-slate-800 placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => handleSendMessage()}
              disabled={loading || !inputText.trim()}
              className="p-2.5 bg-[#2874f0] hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center shrink-0"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
