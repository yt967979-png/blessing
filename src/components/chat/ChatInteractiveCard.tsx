'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Truck,
  ExternalLink,
  FileText,
  RefreshCw,
  Headphones,
  Check,
  Copy,
  BookOpen,
  PhoneCall,
  MessageCircle,
  MapPin,
  Sparkles,
} from 'lucide-react';

interface OrderItem {
  title: string;
  qty: number;
  price?: number;
}

export interface LinkedOrderData {
  orderId: string;
  status: string;
  totalAmount: number;
  trackingNumber?: string;
  courierName?: string;
  city?: string;
  pincode?: string;
  trackingUrl?: string;
  items?: OrderItem[];
}

interface ChatInteractiveCardProps {
  cardType?: 'order' | 'books' | 'contact' | 'policy' | null;
  linkedOrderData?: LinkedOrderData | null;
  cardData?: any;
  onSendMessage: (query: string) => void;
  onEscalateAdmin: () => void;
}

export const ChatInteractiveCard: React.FC<ChatInteractiveCardProps> = ({
  cardType,
  linkedOrderData,
  cardData,
  onSendMessage,
  onEscalateAdmin,
}) => {
  const [copiedAwb, setCopiedAwb] = useState(false);

  // ── 1. Render Linked Order Card ───────────────────────────────────────────
  if (cardType === 'order' || linkedOrderData) {
    const o = linkedOrderData;
    if (!o) return null;

    const copyAwb = (awb: string) => {
      navigator.clipboard.writeText(awb);
      setCopiedAwb(true);
      setTimeout(() => setCopiedAwb(false), 2000);
    };

    return (
      <div className="my-2.5 bg-gradient-to-b from-blue-50/70 to-white border border-blue-200 rounded-2xl p-3 sm:p-4 text-xs text-slate-800 space-y-3 shadow-xs">
        {/* Header with Order ID & Status */}
        <div className="flex items-center justify-between gap-2 border-b border-blue-100 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#001B3A] text-white flex items-center justify-center font-black text-[10px]">
              #
            </span>
            <div>
              <span className="font-extrabold text-sm text-[#001B3A]">#{o.orderId}</span>
              <span className="text-[10px] text-slate-400 font-medium block">Prepaid ₹{o.totalAmount}</span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-extrabold bg-blue-600 text-white shadow-2xs">
            <Truck className="w-3 h-3" />
            {o.status.toUpperCase()}
          </span>
        </div>

        {/* Courier & AWB Docket info */}
        {o.trackingNumber && !o.trackingNumber.startsWith('SHP-') && !o.trackingNumber.includes('Pending') ? (
          <div className="flex items-center justify-between gap-2 bg-white p-2.5 rounded-xl border border-blue-100">
            <div>
              <span className="text-[10px] font-bold text-slate-400 block uppercase">
                {o.courierName || 'ST Courier Express'} AWB
              </span>
              <span className="font-mono font-bold text-xs text-slate-900 tracking-wider">
                {o.trackingNumber}
              </span>
            </div>
            <button
              type="button"
              onClick={() => copyAwb(o.trackingNumber!)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10.5px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
            >
              {copiedAwb ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              <span>{copiedAwb ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        ) : null}

        {/* Destination Location */}
        {o.city && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              Destination: <strong>{o.city}</strong> {o.pincode ? `(${o.pincode})` : ''}
            </span>
          </div>
        )}

        {/* Items in Parcel */}
        {Array.isArray(o.items) && o.items.length > 0 && (
          <div className="space-y-1 pt-1 border-t border-slate-100">
            <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Guides in Package ({o.items.length}):
            </p>
            <div className="space-y-1">
              {o.items.map((it, idx) => (
                <div key={idx} className="flex justify-between items-center text-[11px] text-slate-700 font-medium">
                  <span className="truncate pr-2">• {it.title}</span>
                  <span className="font-bold text-slate-500 shrink-0">×{it.qty}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 1-Tap Action Buttons */}
        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-blue-100">
          <Link
            href={`/track?orderId=${encodeURIComponent(o.orderId)}`}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-extrabold bg-[#001B3A] text-white hover:bg-blue-900 transition-all text-center shadow-2xs cursor-pointer"
          >
            <Truck className="w-3.5 h-3.5 text-blue-300" />
            <span>Live Tracking</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>

          <Link
            href={`/api/orders/${encodeURIComponent(o.orderId)}/invoice`}
            target="_blank"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-extrabold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 transition-all text-center cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>Tax Invoice</span>
            <ExternalLink className="w-2.5 h-2.5" />
          </Link>

          <button
            type="button"
            onClick={() => onSendMessage(`I received order #${o.orderId} and need help with a damaged or misprinted book.`)}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition-all text-center cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
            <span>Report Damaged</span>
          </button>

          <button
            type="button"
            onClick={onEscalateAdmin}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 transition-all text-center cursor-pointer"
          >
            <Headphones className="w-3.5 h-3.5 text-blue-600" />
            <span>Talk to Admin</span>
          </button>
        </div>
      </div>
    );
  }

  // ── 2. Render Books Catalog Card ───────────────────────────────────────────
  if (cardType === 'books' && Array.isArray(cardData) && cardData.length > 0) {
    return (
      <div className="my-2.5 bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 space-y-2.5 shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold text-[#001B3A] uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-blue-600" /> Available 10th Guides
          </span>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            2026–2027 Edition
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {cardData.slice(0, 6).map((b: any, idx: number) => {
            const mrp = Number(b.price || 0);
            const sale = Number(b.discount_price || 0);
            const price = sale > 0 && sale < mrp ? sale : mrp;
            return (
              <div
                key={b.id || idx}
                className="p-2.5 rounded-xl border border-slate-100 bg-slate-50 hover:bg-blue-50/50 hover:border-blue-200 transition-all flex flex-col justify-between"
              >
                <div>
                  <h4 className="font-bold text-xs text-slate-800 line-clamp-1">{b.title}</h4>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="font-extrabold text-xs text-[#001B3A]">₹{price}</span>
                    {sale > 0 && sale < mrp && (
                      <span className="text-[10px] text-slate-400 line-through">₹{mrp}</span>
                    )}
                    <span className="text-[9.5px] font-bold text-emerald-600">✓ In Stock</span>
                  </div>
                </div>
                <Link
                  href={`/products/${b.slug || b.id}`}
                  className="mt-2 text-[10.5px] font-extrabold text-blue-600 hover:text-blue-800 text-left cursor-pointer flex items-center gap-1"
                >
                  <span>View Details</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </Link>
              </div>
            );
          })}
        </div>

        <div className="pt-1">
          <Link
            href="/search"
            className="w-full py-2.5 px-3 bg-[#001B3A] hover:bg-blue-900 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-xs text-center"
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Browse Full Bookstore Catalog →</span>
          </Link>
        </div>
      </div>
    );
  }

  // ── 3. Render Direct Office Contact Card ───────────────────────────────────
  if (cardType === 'contact') {
    return (
      <div className="my-2.5 bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <span className="text-xs font-black text-[#001B3A] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" /> Chennai Office Helpline
          </span>
          <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            Mon-Sat 9AM–8PM
          </span>
        </div>

        <p className="text-[11px] text-slate-600 leading-relaxed">
          Trust Square, Ayanavaram, Chennai - 600012, Tamil Nadu. Direct daily ST Courier pickup for all districts.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <a
            href="tel:+919840418228"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 transition-colors"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>+91 98404 18228</span>
          </a>

          <a
            href="https://wa.me/919840418228?text=Hello%20Blessing%20Power%20Guide,%20I%20need%20help"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600" />
            <span>WhatsApp Chat</span>
          </a>
        </div>
      </div>
    );
  }

  return null;
};
