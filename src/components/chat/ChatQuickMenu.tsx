'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
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
    icon: <Truck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />,
  },
  {
    id: 'moq',
    label: 'Minimum Order (4 Books)',
    query: 'What is the minimum order quantity?',
    icon: <Package className="w-3.5 h-3.5 text-amber-600 shrink-0" />,
  },
  {
    id: 'guides',
    label: '10th Guides & Prices',
    query: 'What guides are available for 10th standard and what are the prices?',
    icon: <BookOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />,
  },
  {
    id: 'free-shipping',
    label: 'Free Delivery (5+ Books)',
    query: 'How can I get free shipping on my order?',
    icon: <Gift className="w-3.5 h-3.5 text-indigo-600 shrink-0" />,
  },
  {
    id: 'payment',
    label: 'Payment & COD Policy',
    query: 'What payment methods do you support and is cash on delivery available?',
    icon: <CreditCard className="w-3.5 h-3.5 text-purple-600 shrink-0" />,
  },
  {
    id: 'replace',
    label: 'Damaged Book Replacement',
    query: 'How do I get a free replacement for a damaged or misprinted guide?',
    icon: <RefreshCw className="w-3.5 h-3.5 text-rose-600 shrink-0" />,
  },
  {
    id: 'address',
    label: 'Change Address / Phone',
    query: 'Can I change my delivery address or phone number?',
    icon: <Edit3 className="w-3.5 h-3.5 text-cyan-600 shrink-0" />,
  },
  {
    id: 'office',
    label: 'Office & Helpline',
    query: 'Where is your Chennai office and what are your working hours?',
    icon: <Building2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />,
  },
  {
    id: 'admin',
    label: 'Talk to Admin',
    action: 'escalate',
    icon: <Headphones className="w-3.5 h-3.5 text-blue-600 shrink-0" />,
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
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Mouse Drag to Scroll state
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const scrollLeftRef = useRef(0);
  const hasMovedRef = useRef(false);

  // Check scroll position to show/hide navigation chevrons
  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const el = scrollRef.current;
    if (!el) return;

    el.addEventListener('scroll', updateScrollButtons, { passive: true });
    window.addEventListener('resize', updateScrollButtons);

    // Desktop Mouse Wheel Horizontal Scroll Support
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && e.deltaY !== 0) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      el.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
      el.removeEventListener('wheel', handleWheel);
    };
  }, [updateScrollButtons]);

  // Arrow button click handlers
  const scrollByAmount = (amount: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  // Mouse Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    isDraggingRef.current = true;
    hasMovedRef.current = false;
    startXRef.current = e.pageX - el.offsetLeft;
    scrollLeftRef.current = el.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    e.preventDefault();
    const x = e.pageX - el.offsetLeft;
    const walk = (x - startXRef.current) * 1.5;
    if (Math.abs(walk) > 4) {
      hasMovedRef.current = true;
    }
    el.scrollLeft = scrollLeftRef.current - walk;
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  return (
    <div className={`relative flex items-center group ${className}`}>
      {/* Left Chevron Button */}
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll Left"
          onClick={() => scrollByAmount(-180)}
          className="absolute left-0 z-10 w-6 h-6 rounded-full bg-white/95 hover:bg-white text-slate-700 shadow-md border border-slate-200 flex items-center justify-center -translate-x-1 cursor-pointer transition-all hover:scale-105"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Left Edge Fade */}
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-slate-50 to-transparent pointer-events-none z-5" />
      )}

      {/* Horizontal Pills Scroll Container */}
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        className="flex items-center gap-1.5 overflow-x-auto scroll-chips pb-1 w-full select-none cursor-grab active:cursor-grabbing px-1"
        style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
      >
        {QUICK_ACTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={(e) => {
              // Prevent click action if user was dragging
              if (hasMovedRef.current) {
                e.preventDefault();
                return;
              }
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

      {/* Right Edge Fade */}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-slate-50 to-transparent pointer-events-none z-5" />
      )}

      {/* Right Chevron Button */}
      {canScrollRight && (
        <button
          type="button"
          aria-label="Scroll Right"
          onClick={() => scrollByAmount(180)}
          className="absolute right-0 z-10 w-6 h-6 rounded-full bg-white/95 hover:bg-white text-slate-700 shadow-md border border-slate-200 flex items-center justify-center translate-x-1 cursor-pointer transition-all hover:scale-105"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
