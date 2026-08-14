'use client';

import React from 'react';
import {
  Menu,
  Bell,
  BellOff,
  RefreshCw,
  User,
  ExternalLink,
} from 'lucide-react';
import { AdminTab } from './AdminSidebar';

interface AdminHeaderProps {
  activeTab: AdminTab;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  onOpenMobileMenu: () => void;
  userEmail?: string;
}

const TAB_TITLES: Record<AdminTab, { title: string; subtitle: string }> = {
  overview: {
    title: 'Store Overview',
    subtitle: "Today's sales volume, order counts, and warehouse packing queue",
  },
  orders: {
    title: 'Live Orders & Fulfillment',
    subtitle: 'Process student orders, print packing slips, and assign ST Courier AWBs',
  },
  courier: {
    title: 'ST Courier Logistics',
    subtitle: 'Real-time parcel delivery tracking and ST Courier network synchronization',
  },
  catalog: {
    title: 'Book Catalog & Stock Inventory',
    subtitle: 'Manage standard allocations, book pricing, MRP, and stock copy levels',
  },
  users: {
    title: 'Customer Accounts',
    subtitle: 'Customer directory, order histories, and staff access permissions',
  },
  reviews: {
    title: 'Student Reviews & Store FAQs',
    subtitle: 'Moderate student book ratings and manage customer help articles',
  },
  analytics: {
    title: 'GST & Sales Reports',
    subtitle: 'Sales analytics, payment breakdowns, and 1-click GST CSV ledger export',
  },
};

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  activeTab,
  soundEnabled,
  onToggleSound,
  onRefresh,
  isRefreshing = false,
  onOpenMobileMenu,
  userEmail,
}) => {
  const meta = TAB_TITLES[activeTab] || {
    title: 'Blessing Power Guide Admin',
    subtitle: 'Store Operations Portal',
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
      {/* Left: Mobile Toggle & Page Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <h1 className="font-bold text-lg sm:text-xl text-slate-900 tracking-tight leading-none">
            {meta.title}
          </h1>
          <p className="text-xs text-slate-500 font-sans mt-0.5 hidden sm:block">
            {meta.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Store Live Pill, Audio Chime, Refresh, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Store Active Pill */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="hidden sm:inline">Store Active</span>
        </div>

        {/* Audio Chime Button */}
        <button
          type="button"
          onClick={onToggleSound}
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs ${
            soundEnabled
              ? 'bg-blue-50 border-blue-200 text-[#2874f0]'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
          }`}
          title={soundEnabled ? 'Order sound chime is ON' : 'Order sound chime is MUTED'}
        >
          {soundEnabled ? <Bell className="w-4 h-4 text-[#2874f0]" /> : <BellOff className="w-4 h-4" />}
          <span className="hidden md:inline">
            {soundEnabled ? 'Sound On' : 'Muted'}
          </span>
        </button>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-[#2874f0] disabled:opacity-50 transition-colors cursor-pointer shadow-xs"
          title="Refresh Data"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#2874f0]' : ''}`} />
        </button>

        {/* Admin User Profile */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2874f0] to-[#0044aa] text-white flex items-center justify-center font-bold text-xs shadow-xs">
            <User className="w-4 h-4" />
          </div>
          {userEmail && (
            <span className="text-xs font-medium text-slate-700 hidden lg:inline max-w-[140px] truncate">
              {userEmail.split('@')[0]}
            </span>
          )}
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
