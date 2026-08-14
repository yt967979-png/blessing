'use client';

import React from 'react';
import {
  Menu,
  Bell,
  BellOff,
  RefreshCw,
  Activity,
  CheckCircle2,
  AlertTriangle,
  User,
} from 'lucide-react';
import { AdminTab } from './AdminSidebar';

interface AdminHeaderProps {
  activeTab: AdminTab;
  systemHealthy?: boolean;
  deadLetterCount?: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onOpenMobileMenu: () => void;
  userEmail?: string;
}

const TAB_TITLES: Record<AdminTab, { title: string; subtitle: string }> = {
  overview: {
    title: 'Operations Overview',
    subtitle: "Today's ledger, revenue metrics, and pending dispatch queue",
  },
  orders: {
    title: 'Live Order Management',
    subtitle: 'Real-time order fulfillment, batch packing, and AWB assignment',
  },
  courier: {
    title: 'Logistics & ST Courier',
    subtitle: 'Live parcel tracking, docket sync, and delivery performance',
  },
  catalog: {
    title: 'Book Catalog & Pricing',
    subtitle: 'Manage editions, prices, discounts, and bulk CSV uploads',
  },
  inventory: {
    title: 'Inventory & Stock Holds',
    subtitle: 'Live stock quantities, atomic holds, and low-inventory alerts',
  },
  users: {
    title: 'Customer Directory & Roles',
    subtitle: 'Customer accounts, order history, and admin access control',
  },
  reviews: {
    title: 'Reviews & Feedback Moderation',
    subtitle: 'Verified student reviews and photo moderation',
  },
  content: {
    title: 'FAQs & Content Management',
    subtitle: 'Help center articles, student guides, and store notices',
  },
  analytics: {
    title: 'Revenue & GST Tax Ledger',
    subtitle: 'Sales analytics, financial year reports, and GST compliance logs',
  },
  system: {
    title: 'System Health & Telemetry',
    subtitle: 'Background worker heartbeats, dead-letter queue, and database status',
  },
};

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  activeTab,
  systemHealthy = true,
  deadLetterCount = 0,
  soundEnabled,
  onToggleSound,
  onRefresh,
  isRefreshing = false,
  onOpenMobileMenu,
  userEmail,
}) => {
  const meta = TAB_TITLES[activeTab] || {
    title: 'Admin Dashboard',
    subtitle: 'Blessing Power Guide Operations',
  };

  return (
    <header className="sticky top-0 z-30 bg-[#FAF7F0] border-b border-[#55607A]/20 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg bg-white border border-[#55607A]/20 text-[#1E2A4A] hover:bg-slate-100 transition-colors"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="font-serif font-black text-lg sm:text-xl text-[#1E2A4A] tracking-tight leading-none">
            {meta.title}
          </h1>
          <p className="text-[11px] sm:text-xs text-[#55607A] font-sans mt-0.5 hidden sm:block">
            {meta.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Health Pill, Audio Chime, Refresh, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* System Health Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-bold border ${
            systemHealthy && deadLetterCount === 0
              ? 'bg-[#2F9E60]/10 text-[#2F9E60] border-[#2F9E60]/30'
              : 'bg-[#C43B3B]/10 text-[#C43B3B] border-[#C43B3B]/30'
          }`}
          title={
            systemHealthy && deadLetterCount === 0
              ? 'All background workers healthy, 0 dead-letter events'
              : `Warning: ${deadLetterCount} dead-letter webhooks or degraded worker`
          }
        >
          <span
            className={`w-2 h-2 rounded-full ${
              systemHealthy && deadLetterCount === 0
                ? 'bg-[#2F9E60]'
                : 'bg-[#C43B3B] animate-pulse'
            }`}
          />
          <span className="hidden sm:inline">
            {systemHealthy && deadLetterCount === 0 ? 'SYSTEM HEALTHY' : 'HEALTH ALERT'}
          </span>
        </div>

        {/* Audio Chime Button */}
        <button
          type="button"
          onClick={onToggleSound}
          className={`p-2 rounded-lg border text-xs font-mono transition-colors flex items-center gap-1.5 cursor-pointer ${
            soundEnabled
              ? 'bg-[#D98C2B]/10 border-[#D98C2B]/40 text-[#D98C2B]'
              : 'bg-white border-[#55607A]/20 text-[#55607A] hover:bg-slate-100'
          }`}
          title={soundEnabled ? 'Order sound chime is ON' : 'Order sound chime is MUTED'}
        >
          {soundEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          <span className="text-[10px] hidden md:inline font-bold">
            {soundEnabled ? 'SOUND ON' : 'MUTED'}
          </span>
        </button>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg bg-white border border-[#55607A]/20 text-[#1E2A4A] hover:bg-slate-100 disabled:opacity-50 transition-colors cursor-pointer"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>

        {/* Admin Profile Pill */}
        <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-[#55607A]/20">
          <div className="w-7 h-7 rounded-full bg-[#1E2A4A] text-white flex items-center justify-center text-xs font-bold font-mono">
            <User className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-mono font-bold text-[#1E2A4A] max-w-[120px] truncate">
            {userEmail?.split('@')[0] || 'Admin'}
          </span>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
