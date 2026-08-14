'use client';

import React from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  BookOpen,
  Boxes,
  Users,
  Star,
  FileText,
  BarChart3,
  Activity,
  ArrowLeft,
  LogOut,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';

export type AdminTab =
  | 'overview'
  | 'orders'
  | 'courier'
  | 'catalog'
  | 'inventory'
  | 'users'
  | 'reviews'
  | 'content'
  | 'analytics'
  | 'system';

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  pendingOrdersCount?: number;
  lowStockCount?: number;
  systemDegraded?: boolean;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onLogout?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingOrdersCount = 0,
  lowStockCount = 0,
  systemDegraded = false,
  isOpenMobile = false,
  onCloseMobile,
  onLogout,
}) => {
  const navGroups = [
    {
      label: 'OPERATIONS',
      items: [
        {
          key: 'overview' as AdminTab,
          label: 'Overview Ledger',
          icon: LayoutDashboard,
        },
        {
          key: 'orders' as AdminTab,
          label: 'Live Orders',
          icon: ShoppingCart,
          badge: pendingOrdersCount > 0 ? String(pendingOrdersCount) : undefined,
          badgeColor: 'bg-[#D98C2B] text-white',
        },
        {
          key: 'courier' as AdminTab,
          label: 'Logistics & ST Courier',
          icon: Truck,
        },
      ],
    },
    {
      label: 'CATALOG & STOCK',
      items: [
        {
          key: 'catalog' as AdminTab,
          label: 'Book Catalog & Pricing',
          icon: BookOpen,
        },
        {
          key: 'inventory' as AdminTab,
          label: 'Stock Holds & Alerts',
          icon: Boxes,
          badge: lowStockCount > 0 ? String(lowStockCount) : undefined,
          badgeColor: 'bg-[#C43B3B] text-white animate-pulse',
        },
      ],
    },
    {
      label: 'COMMUNITY & INBOX',
      items: [
        {
          key: 'users' as AdminTab,
          label: 'Customers & Roles',
          icon: Users,
        },
        {
          key: 'reviews' as AdminTab,
          label: 'Reviews & Feedback',
          icon: Star,
        },
        {
          key: 'content' as AdminTab,
          label: 'FAQs & Content',
          icon: FileText,
        },
      ],
    },
    {
      label: 'FINANCE & OBSERVABILITY',
      items: [
        {
          key: 'analytics' as AdminTab,
          label: 'Revenue & GST Ledger',
          icon: BarChart3,
        },
        {
          key: 'system' as AdminTab,
          label: 'System Health & Logs',
          icon: Activity,
          badge: systemDegraded ? 'ALERT' : 'OK',
          badgeColor: systemDegraded ? 'bg-[#C43B3B] text-white' : 'bg-[#2F9E60] text-white',
        },
      ],
    },
  ];

  const handleTabClick = (tab: AdminTab) => {
    setActiveTab(tab);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-xs"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-[#1E2A4A] text-slate-100 flex flex-col border-r border-[#1E2A4A]/80 shadow-2xl transition-transform duration-300 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Sidebar Brand Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-[#D98C2B] flex items-center justify-center text-[#1E2A4A] font-black shadow-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-serif font-black text-sm text-white tracking-wide block leading-tight">
                THE LEDGER
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider block">
                Blessing Operations
              </span>
            </div>
          </Link>
          <Link
            href="/"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Return to Storefront"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto py-3 px-2.5 space-y-5 custom-scrollbar">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 text-[10px] font-mono font-bold tracking-widest text-slate-400 mb-1.5 uppercase opacity-80">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleTabClick(item.key)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer select-none ${
                        isActive
                          ? 'bg-[#D98C2B] text-[#1E2A4A] font-extrabold shadow-sm translate-x-0.5'
                          : 'text-slate-300 hover:text-white hover:bg-white/8'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className={`w-4 h-4 ${isActive ? 'text-[#1E2A4A]' : 'text-slate-400'}`} />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span
                          className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full ${
                            isActive ? 'bg-[#1E2A4A] text-white' : item.badgeColor
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-white/10 flex items-center justify-between bg-black/15">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#2F9E60] animate-pulse" />
            <span className="text-[11px] font-mono text-slate-300">Live SSE Stream</span>
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
              title="Logout from Admin"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
