'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  Ban,
  CheckCircle2,
  Download,
  AlertTriangle,
  Package,
  Shield,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { authHeaders } from '@/lib/clientAuth';
import type { UserData } from '@/context/StoreContext';

type Customer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  orderCount: number;
  totalSpent: number;
  createdAt: string;
};

type LowStockBook = {
  id: string;
  title: string;
  stock: number;
  status: string;
  price: number;
};

export default function AdminUsersTab({
  user,
  showToast,
}: {
  user: UserData;
  showToast: (msg: string) => void;
}) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lowStock, setLowStock] = useState<LowStockBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | 'all'>(25);
  const [currentPage, setCurrentPage] = useState(1);

  const isSuperAdmin = user?.role === 'super_admin';

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const headers = authHeaders(user);
      const usersRes = await fetch('/api/admin/users?limit=10000', {
        credentials: 'include',
        headers,
        signal: AbortSignal.timeout(20000),
      });
      if (usersRes.ok) {
        const data = await usersRes.json();
        if (Array.isArray(data)) setCustomers(data);
      } else {
        const err = await usersRes.json().catch(() => ({}));
        showToast(`❌ ${err.error || 'Could not load users'}`);
        setCustomers([]);
      }

      void fetch('/api/admin/users?view=low_stock', {
        credentials: 'include',
        headers,
        signal: AbortSignal.timeout(15000),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && Array.isArray(data.alerts)) setLowStock(data.alerts);
        })
        .catch(() => {});
    } catch {
      showToast('❌ Could not load users');
      setCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleSubAdminRole = async (userId: string, currentRole: string) => {
    if (!isSuperAdmin) {
      showToast('Only Super Admin can make or remove admins.');
      return;
    }
    const targetRole = currentRole === 'admin' ? 'customer' : 'admin';
    setUpdatingId(userId);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(user),
        body: JSON.stringify({ userId, role: targetRole }),
      });
      if (r.ok) {
        showToast(targetRole === 'admin' ? '🛡️ User granted Admin privileges' : '👤 Admin privileges removed');
        setCustomers((prev) => prev.map((c) => (c.id === userId ? { ...c, role: targetRole } : c)));
      } else {
        const d = await r.json();
        showToast(`❌ ${d.error || 'Role update failed'}`);
      }
    } catch {
      showToast('❌ Role update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  const setStatus = async (userId: string, status: 'active' | 'banned') => {
    if (!isSuperAdmin) {
      showToast('Only Super Admin can ban or unban users.');
      return;
    }
    setUpdatingId(userId);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(user),
        body: JSON.stringify({ userId, status }),
      });
      if (r.ok) {
        showToast(status === 'banned' ? '🚫 User banned' : '✅ User reactivated');
        setCustomers((prev) => prev.map((c) => (c.id === userId ? { ...c, status } : c)));
      } else {
        const d = await r.json();
        showToast(`❌ ${d.error || 'Update failed'}`);
      }
    } catch {
      showToast('❌ Update failed');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteUser = async (userId: string, userName: string) => {
    if (!isSuperAdmin) {
      showToast('Only Super Admin can delete users.');
      return;
    }
    if (!confirm(`Are you sure you want to permanently delete user "${userName}"? This will clear their record from the database.`)) return;
    setUpdatingId(userId);
    try {
      const r = await fetch(`/api/admin/users?userId=${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: authHeaders(user),
      });
      if (r.ok) {
        showToast('🗑️ User permanently deleted from database');
        setCustomers((prev) => prev.filter((c) => c.id !== userId));
      } else {
        const d = await r.json();
        showToast(`❌ ${d.error || 'Delete failed'}`);
      }
    } catch {
      showToast('❌ Delete user error');
    } finally {
      setUpdatingId(null);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Name', 'Email', 'Phone', 'Role', 'Status', 'Orders', 'Total Spent', 'Joined'],
      ...filtered.map((c) => [
        c.name,
        c.email,
        c.phone,
        c.role || 'customer',
        c.status,
        String(c.orderCount),
        String(c.totalSpent),
        c.createdAt,
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('📥 Users CSV downloaded');
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, pageSize]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      c.role.toLowerCase().includes(q)
    );
  });

  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedCustomers =
    pageSize === 'all'
      ? filtered
      : filtered.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize);
  const startItem =
    filtered.length === 0
      ? 0
      : (safeCurrentPage - 1) * (typeof pageSize === 'number' ? pageSize : filtered.length) + 1;
  const endItem =
    pageSize === 'all' ? filtered.length : Math.min(safeCurrentPage * pageSize, filtered.length);

  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safeCurrentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (safeCurrentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', safeCurrentPage - 1, safeCurrentPage, safeCurrentPage + 1, '...', totalPages];
  };

  return (
    <div className="space-y-4">
      {lowStock.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-bold text-amber-900">Low stock alert — {lowStock.length} book(s) ≤ 5 left</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((b) => (
              <span
                key={b.id}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white border border-amber-200 text-amber-800 px-2.5 py-1 rounded-lg"
              >
                <Package className="w-3 h-3" />
                {b.title} — <strong>{b.stock}</strong> left
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-[#2874f0]" />
            User Management
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {search.trim()
              ? `Found ${filtered.length} of ${customers.length} users matching "${search}"`
              : `${customers.length} total customer accounts registered`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:border-[#2874f0]"
          />
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-12">Loading users…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-12">No users found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#f8f9fa] border-b border-gray-200">
                  {['User Details', 'Phone', 'Role', 'Orders / Spent', 'Status', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className={`py-3 px-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wide ${
                        h === 'Actions' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedCustomers.map((c) => (
                  <tr key={c.id} className="hover:bg-[#f8f9fa]">
                    <td className="py-3 px-3">
                      <p className="font-semibold text-gray-900">{c.name}</p>
                      <p className="text-[10px] text-gray-400">{c.email}</p>
                      {c.createdAt && c.createdAt !== '—' && (
                        <p className="text-[10px] text-emerald-700 font-mono mt-0.5">
                          Joined: {c.createdAt}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3 text-gray-600 whitespace-nowrap">{c.phone}</td>
                    <td className="py-3 px-3">
                      {c.role === 'admin' || c.role === 'super_admin' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md">
                          🛡️ Admin
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                          Customer
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-semibold">
                      {c.orderCount} orders <span className="text-gray-400 font-normal">|</span> ₹{c.totalSpent.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          c.status === 'banned'
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : 'bg-green-50 text-green-700 border border-green-200'
                        }`}
                      >
                        {c.status || 'active'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                      {isSuperAdmin && c.role !== 'super_admin' && (
                        <button
                          type="button"
                          disabled={updatingId === c.id}
                          onClick={() => {
                            if (
                              !confirm(
                                c.role === 'admin'
                                  ? `Remove admin access for ${c.name}?`
                                  : `Make ${c.name} an admin? Only Super Admin can do this.`
                              )
                            ) {
                              return;
                            }
                            void toggleSubAdminRole(c.id, c.role);
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg cursor-pointer disabled:opacity-50 ${
                            c.role === 'admin'
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200'
                              : 'text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200'
                          }`}
                        >
                          <Shield className="w-3 h-3" />
                          {c.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                        </button>
                      )}

                      {isSuperAdmin &&
                        c.role !== 'super_admin' &&
                        (c.status === 'banned' ? (
                        <button
                          type="button"
                          disabled={updatingId === c.id}
                          onClick={() => setStatus(c.id, 'active')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Unban
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={updatingId === c.id}
                          onClick={() => {
                            if (!confirm(`Ban ${c.name}? They cannot log in.`)) return;
                            void setStatus(c.id, 'banned');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg cursor-pointer disabled:opacity-50"
                        >
                          <Ban className="w-3 h-3" />
                          Ban
                        </button>
                      ))}

                      {isSuperAdmin && c.role !== 'super_admin' && (
                        <button
                          type="button"
                          disabled={updatingId === c.id}
                          onClick={() => deleteUser(c.id, c.name)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg cursor-pointer disabled:opacity-50"
                          title="Delete user permanently"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Users Pagination Footer */}
      {!loading && filtered.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          {/* Left: Summary & Per Page Selector */}
          <div className="flex flex-wrap items-center gap-3 text-slate-600">
            <span>
              Showing <strong className="text-slate-900 font-bold">{startItem}–{endItem}</strong> of{' '}
              <strong className="text-slate-900 font-bold">{filtered.length}</strong> users
            </span>

            <div className="flex items-center gap-1.5 pl-2 sm:border-l sm:border-slate-200">
              <span className="text-[11px] text-slate-400 font-semibold">Per page:</span>
              {([25, 50, 100, 'all'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setPageSize(size)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    pageSize === size
                      ? 'bg-[#2874f0] text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {size === 'all' ? 'All' : size}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Page Numbers & Navigation */}
          {pageSize !== 'all' && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage(1)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                title="First Page"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={safeCurrentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center gap-1"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden md:inline font-semibold">Prev</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                {getPageNumbers().map((p, idx) =>
                  p === '...' ? (
                    <span key={`dots-${idx}`} className="px-1 text-slate-400 font-bold select-none">
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setCurrentPage(p as number)}
                      className={`min-w-8 h-8 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        safeCurrentPage === p
                          ? 'bg-[#2874f0] text-white shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer flex items-center gap-1"
                title="Next Page"
              >
                <span className="hidden md:inline font-semibold">Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                disabled={safeCurrentPage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                title="Last Page"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
