'use client';

import React from 'react';
import {
  Truck,
  Headphones,
  BookOpen,
  Package,
  RefreshCw,
  PhoneCall,
  FileText,
  CreditCard,
  Sparkles,
  MapPin,
  ChevronRight,
} from 'lucide-react';

interface ChatSuggestionButtonsProps {
  suggestions: string[];
  orderId?: string;
  onSendMessage: (query: string) => void;
  onEscalateAdmin: () => void;
}

export const ChatSuggestionButtons: React.FC<ChatSuggestionButtonsProps> = ({
  suggestions,
  orderId,
  onSendMessage,
  onEscalateAdmin,
}) => {
  if (!Array.isArray(suggestions) || suggestions.length === 0) return null;

  const getButtonIcon = (text: string) => {
    const t = text.toLowerCase();
    if (t.includes('admin') || t.includes('human') || t.includes('agent')) return <Headphones className="w-3 h-3 text-blue-600" />;
    if (t.includes('track') || t.includes('courier') || t.includes('delivery days') || t.includes('timelines')) return <Truck className="w-3 h-3 text-emerald-600" />;
    if (t.includes('book') || t.includes('guide') || t.includes('set') || t.includes('subject')) return <BookOpen className="w-3 h-3 text-indigo-600" />;
    if (t.includes('moq') || t.includes('order') || t.includes('shipping') || t.includes('charge')) return <Package className="w-3 h-3 text-amber-600" />;
    if (t.includes('replac') || t.includes('damag') || t.includes('misprint')) return <RefreshCw className="w-3 h-3 text-rose-600" />;
    if (t.includes('call') || t.includes('helpline') || t.includes('office')) return <PhoneCall className="w-3 h-3 text-teal-600" />;
    if (t.includes('invoice') || t.includes('bill')) return <FileText className="w-3 h-3 text-slate-600" />;
    if (t.includes('pay') || t.includes('cod') || t.includes('upi')) return <CreditCard className="w-3 h-3 text-purple-600" />;
    if (t.includes('address') || t.includes('pincode')) return <MapPin className="w-3 h-3 text-blue-600" />;
    return <Sparkles className="w-3 h-3 text-blue-500" />;
  };

  const cleanLabel = (text: string) => {
    // Remove leading emoji if present, we provide clean Lucide icons
    return text.replace(/^[\u{1F300}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F680}-\u{1F6FF}]\s*/u, '').trim();
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-slate-100">
      {suggestions.map((sug, idx) => {
        const isEscalate = sug.includes('Connect to Admin') || sug.includes('Talk to Admin');
        const isInvoice = sug.includes('Tax Invoice') || sug.includes('Download Invoice');

        return (
          <button
            key={idx}
            type="button"
            onClick={() => {
              if (isEscalate) {
                onEscalateAdmin();
              } else if (isInvoice && orderId) {
                window.open(`/api/orders/${encodeURIComponent(orderId)}/invoice`, '_blank');
              } else {
                onSendMessage(sug);
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:scale-102 ${
              isEscalate
                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                : 'bg-white hover:bg-blue-50/80 text-slate-700 hover:text-[#2874f0] border border-slate-200 hover:border-blue-300'
            }`}
          >
            {getButtonIcon(sug)}
            <span>{cleanLabel(sug)}</span>
            <ChevronRight className="w-3 h-3 opacity-40 ml-0.5" />
          </button>
        );
      })}
    </div>
  );
};
