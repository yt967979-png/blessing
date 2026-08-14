'use client';

import React from 'react';

export type StampStatus =
  | 'Order Placed'
  | 'Confirmed'
  | 'Packed'
  | 'Handed to ST Courier'
  | 'In Transit'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Cancelled'
  | 'Refunded'
  | 'Payment Failed'
  | string;

interface OrderStatusStampProps {
  status: StampStatus;
  size?: 'sm' | 'md' | 'lg';
  animate?: boolean;
  className?: string;
}

export const OrderStatusStamp: React.FC<OrderStatusStampProps> = ({
  status,
  size = 'md',
  animate = false,
  className = '',
}) => {
  const normalized = String(status || '').trim().toLowerCase();

  let colorClass = 'text-[#55607A] border-[#55607A]/40 bg-[#FAF7F0]';
  let label = String(status || 'UNKNOWN').toUpperCase();

  if (normalized.includes('deliver') && !normalized.includes('attempt') && !normalized.includes('fail')) {
    colorClass = 'text-[#2F9E60] border-[#2F9E60]/80 bg-[#2F9E60]/5 ring-1 ring-[#2F9E60]/30 shadow-xs';
    label = 'DELIVERED';
  } else if (normalized.includes('packed')) {
    colorClass = 'text-[#D98C2B] border-[#D98C2B]/80 bg-[#D98C2B]/5 ring-1 ring-[#D98C2B]/30';
    label = 'PACKED';
  } else if (normalized.includes('transit') || normalized.includes('handed') || normalized.includes('out for delivery')) {
    colorClass = 'text-[#1E2A4A] border-[#1E2A4A]/80 bg-[#1E2A4A]/5 ring-1 ring-[#1E2A4A]/30';
    label = normalized.includes('out') ? 'OUT FOR DELIVERY' : normalized.includes('handed') ? 'DISPATCHED' : 'IN TRANSIT';
  } else if (normalized.includes('confirm') || normalized.includes('placed') || normalized.includes('paid')) {
    colorClass = 'text-[#0284c7] border-[#0284c7]/80 bg-[#0284c7]/5 ring-1 ring-[#0284c7]/30';
    label = 'CONFIRMED';
  } else if (normalized.includes('cancel') || normalized.includes('refund') || normalized.includes('fail')) {
    colorClass = 'text-[#C43B3B] border-[#C43B3B]/80 bg-[#C43B3B]/5 ring-1 ring-[#C43B3B]/30';
    label = normalized.includes('refund') ? 'REFUNDED' : 'CANCELLED';
  }

  const sizeClasses = {
    sm: 'text-[9px] px-2 py-0.5 border tracking-wider font-extrabold',
    md: 'text-[10px] sm:text-[11px] px-2.5 py-1 border-1.5 tracking-wider font-black',
    lg: 'text-xs px-3.5 py-1.5 border-2 tracking-widest font-black',
  };

  return (
    <span
      className={`inline-flex items-center justify-center select-none uppercase rounded-md font-mono transition-transform duration-300 ${
        sizeClasses[size]
      } ${colorClass} ${animate ? 'animate-stamp' : 'rotate-[-2deg]'} ${className}`}
      style={{
        textShadow: '0 0.5px 0 rgba(0,0,0,0.05)',
        letterSpacing: '0.08em',
      }}
    >
      <span className="opacity-90">{label}</span>
    </span>
  );
};

export default OrderStatusStamp;
