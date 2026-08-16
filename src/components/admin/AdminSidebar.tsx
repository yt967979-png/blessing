'use client';

import React from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  BookOpen,
  Users,
  Star,
  BarChart3,
  ArrowLeft,
  LogOut,
  ExternalLink,
  Activity,
} from 'lucide-react';
import { BrandLogo } from '@/components/ui/BrandLogo';

export type AdminTab =
  | 'overview'
  | 'orders'
  | 'courier'
  | 'catalog'
  | 'users'
  | 'reviews'
  | 'analytics'
  | 'health';

interface AdminSidebarProps {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  pendingOrdersCount?: number;
  lowStockCount?: number;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  onLogout?: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingOrdersCount = 0,
  lowStockCount = 0,
  isOpenMobile = false,
  onCloseMobile,
  onLogout,
}) => {
  const navItems = [
    {
      key: 'overview' as AdminTab,
      label: 'Store Overview',
      subtitle: "Today's sales & quick actions",
      icon: LayoutDashboard,
    },
    {
      key: 'orders' as AdminTab,
      label: 'Live Orders & Packing',
      subtitle: 'Dispatch queue & packing slips',
      icon: ShoppingCart,
      badge: pendingOrdersCount > 0 ? String(pendingOrdersCount) : undefined,
      badgeColor: 'bg-amber-500 text-white animate-pulse',
    },
    {
      key: 'courier' as AdminTab,
      label: 'ST Courier Tracking',
      subtitle: 'Live parcel status & AWB sync',
      icon: Truck,
    },
    {
      key: 'catalog' as AdminTab,
      label: 'Book Catalog & Stock',
      subtitle: 'Prices, MRP, stock & CSV import',
      icon: BookOpen,
      badge: lowStockCount > 0 ? `${lowStockCount} Low` : undefined,
      badgeColor: 'bg-red-500 text-white',
    },
    {
      key: 'users' as AdminTab,
      label: 'Customer Accounts',
      subtitle: 'User profiles & order history',
      icon: Users,
    },
    {
      key: 'reviews' as AdminTab,
      label: 'Reviews & FAQs',
      subtitle: 'Student feedback & help articles',
      icon: Star,
    },
    {
      key: 'analytics' as AdminTab,
      label: 'GST & Sales Reports',
      subtitle: 'Monthly trends & 1-click tax CSV',
      icon: BarChart3,
    },
    {
      key: 'health' as AdminTab,
      label: 'System Health & Telemetry',
      subtitle: 'Worker heartbeats & dead-letter queue',
      icon: Activity,
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
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-[#0a192f] text-slate-100 flex flex-col border-r border-slate-800 shadow-2xl transition-transform duration-300 lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Official Brand Header */}
        <div className="p-4 border-b border-slate-800/80 bg-[#061121] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <BrandLogo size={36} className="shadow-md group-hover:scale-105 transition-transform" />
            <div>
              <span className="font-bold text-sm text-white tracking-tight block leading-tight">
                Blessing Power Guide
              </span>
              <span className="text-[10px] text-blue-300/80 font-medium block">
                Admin Management Portal
              </span>
            </div>
          </Link>
          <Link
            href="/"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="View Live Storefront"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
          <p className="px-3 text-[10px] font-bold tracking-widest text-slate-400 mb-2 uppercase">
            Store Management
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleTabClick(item.key)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer select-none text-left ${
                  isActive
                    ? 'bg-[#2874f0] text-white shadow-md font-bold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-800/90 text-blue-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="block leading-tight text-xs">{item.label}</span>
                    <span
                      className={`text-[10px] block mt-0.5 ${
                        isActive ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {item.subtitle}
                    </span>
                  </div>
                </div>
                {item.badge && (
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full shrink-0 ${
                      isActive ? 'bg-white text-[#2874f0]' : item.badgeColor
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-800 bg-[#061121] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-medium text-slate-400">Admin Active</span>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-red-400 hover:bg-white/10 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Logout from Admin"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default AdminSidebar;
