'use client';

import React from 'react';
import {
  Truck,
  Package,
  BookOpen,
  Gift,
  CreditCard,
  RefreshCw,
  Edit3,
  Building2,
  Headphones,
} from 'lucide-react';

interface QuickAction {
  id: string;
  label: string;
  query?: string;
  action?: 'escalate';
  icon: React.ReactNode;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'track',
    label: 'Track Order',
    query: 'Where is my order?',
    icon: <Truck className="w-3.5 h-3.5 text-emerald-600" />,
  },
  {
    id: 'moq',
    label: 'Minimum Order (4 Books)',
    query: 'What is the minimum order quantity?',
    icon: <Package className="w-3.5 h-3.5 text-amber-600" />,
  },
  {
    id: 'guides',
    label: '10th Guides & Prices',
    query: 'What guides are available for 10th standard and what are the prices?',
    icon: <BookOpen className="w-3.5 h-3.5 text-blue-600" />,
  },
  {
    id: 'free-shipping',
    label: 'Free Delivery (5+ Books)',
    query: 'How can I get free shipping on my order?',
    icon: <Gift className="w-3.5 h-3.5 text-indigo-600" />,
  },
  {
    id: 'payment',
    label: 'Payment & COD Policy',
    query: 'What payment methods do you support and is cash on delivery available?',
    icon: <CreditCard className="w-3.5 h-3.5 text-purple-600" />,
  },
  {
    id: 'replace',
    label: 'Damaged Book Replacement',
    query: 'How do I get a free replacement for a damaged or misprinted guide?',
    icon: <RefreshCw className="w-3.5 h-3.5 text-rose-600" />,
  },
  {
    id: 'address',
    label: 'Change Address / Phone',
    query: 'Can I change my delivery address or phone number?',
    icon: <Edit3 className="w-3.5 h-3.5 text-cyan-600" />,
  },
  {
    id: 'office',
    label: 'Office & Helpline',
    query: 'Where is your Chennai office and what are your working hours?',
    icon: <Building2 className="w-3.5 h-3.5 text-teal-600" />,
  },
  {
    id: 'admin',
    label: 'Talk to Admin',
    action: 'escalate',
    icon: <Headphones className="w-3.5 h-3.5 text-blue-600" />,
  },
];

interface ChatQuickMenuProps {
  onSendMessage: (query: string) => void;
  onEscalateAdmin: () => void;
  className?: string;
}

export const ChatQuickMenu: React.FC<ChatQuickMenuProps> = ({
  onSendMessage,
  onEscalateAdmin,
  className = '',
}) => {
  return (
    <div className={`flex items-center gap-1.5 overflow-x-auto scroll-chips pb-1 ${className}`}>
      {QUICK_ACTIONS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            if (item.action === 'escalate') {
              onEscalateAdmin();
            } else if (item.query) {
              onSendMessage(item.query);
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/90 hover:border-blue-300 shrink-0 transition-all cursor-pointer shadow-2xs whitespace-nowrap active:scale-95"
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
};
