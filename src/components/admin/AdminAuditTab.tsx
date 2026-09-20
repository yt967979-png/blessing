'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Filter, Search, Download, AlertCircle, Clock, Globe } from 'lucide-react';
import { authHeaders } from '@/lib/clientAuth';
import type { UserData } from '@/context/StoreContext';

interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, any> | string;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export default function AdminAuditTab({
  user,
  showToast,
}: {
  user: UserData;
  showToast: (msg: string) => void;
}) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [search, setSearch] = useState('');
  const [total, setTotal] = useState(0);

  const loadLogs = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const headers = authHeaders(user);
      const url = new URL('/api/admin/audit-logs', window.location.origin);
      url.searchParams.set('limit', '100');
      if (actionFilter) {
        url.searchParams.set('action', actionFilter);
      }

      const res = await fetch(url.toString(), {
        credentials: 'include',
        headers,
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data.logs) ? data.logs : []);
        setTotal(Number(data.total) || 0);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to load audit logs.');
      }
    } catch {
      showToast('Network error loading audit logs.');
    } finally {
      setLoading(false);
    }
  }, [user, actionFilter, showToast]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const filteredLogs = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      log.action?.toLowerCase().includes(q) ||
      log.actor_id?.toLowerCase().includes(q) ||
      log.target_id?.toLowerCase().includes(q) ||
      log.target_type?.toLowerCase().includes(q) ||
      (typeof log.details === 'string' ? log.details : JSON.stringify(log.details)).toLowerCase().includes(q)
    );
  });

  const exportCsv = () => {
    if (!filteredLogs.length) return;
    const headers = ['ID', 'Timestamp', 'Actor', 'Action', 'Target Type', 'Target ID', 'Details', 'IP Address'];
    const rows = filteredLogs.map((l) => [
      l.id,
      new Date(l.created_at).toISOString(),
      `"${(l.actor_id || '').replace(/"/g, '""')}"`,
      l.action,
      l.target_type,
      l.target_id,
      `"${(typeof l.details === 'string' ? l.details : JSON.stringify(l.details)).replace(/"/g, '""')}"`,
      l.ip_address || '',
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `bpg_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadgeClass = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('DELETE') || act.includes('BAN') || act.includes('CANCEL')) {
      return 'bg-red-500/10 text-red-400 border border-red-500/30';
    }
    if (act.includes('PRICE') || act.includes('STOCK') || act.includes('UPDATE')) {
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
    }
    if (act.includes('CREATE') || act.includes('SUCCESS')) {
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    }
    return 'bg-blue-500/10 text-blue-400 border border-blue-500/30';
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Security & Admin Audit Trail</h1>
              <p className="text-sm text-slate-400">
                Immutable, tamper-evident record of administrative and security events ({total} total entries)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadLogs()}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={exportCsv}
            disabled={!filteredLogs.length}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition shadow-lg shadow-emerald-950/40 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search action, actor, ID, changes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-slate-900/80 border border-slate-800 rounded-xl text-sm text-white px-3 py-2.5 focus:outline-none focus:border-emerald-500/50"
          >
            <option value="">All Actions</option>
            <option value="PRICE_CHANGED">Price Changes</option>
            <option value="STOCK_CHANGED">Stock Changes</option>
            <option value="PRODUCT_CREATED">Product Creations</option>
            <option value="PRODUCT_DELETED">Product Deletions</option>
            <option value="ORDER_CANCELLED">Order Cancellations</option>
            <option value="USER_ROLE_CHANGED">Role Changes</option>
            <option value="USER_BANNED">User Bans</option>
            <option value="USER_DELETED">User Deletions</option>
          </select>
        </div>
      </div>

      {/* Logs Table / Cards */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden backdrop-blur-xl">
        {loading ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
            <p className="text-sm">Loading verified audit events...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
            <AlertCircle className="w-8 h-8 text-slate-500" />
            <p className="text-base font-medium text-slate-300">No audit events found</p>
            <p className="text-sm text-slate-500">Events are recorded automatically upon administrative actions.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target</th>
                  <th className="py-3 px-4">Changes / Details</th>
                  <th className="py-3 px-4">Origin IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredLogs.map((log) => {
                  let parsedDetails: any = log.details;
                  if (typeof parsedDetails === 'string') {
                    try {
                      parsedDetails = JSON.parse(parsedDetails);
                    } catch {
                      // leave as string
                    }
                  }
                  return (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-400 font-mono flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {new Date(log.created_at).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-medium text-slate-200">
                        <span className="truncate max-w-[180px] block" title={log.actor_id}>
                          {log.actor_id}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${getActionBadgeClass(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-300 whitespace-nowrap">
                        <span className="capitalize font-medium text-slate-200">{log.target_type}:</span>{' '}
                        <span className="font-mono text-slate-400">{log.target_id?.slice(0, 16)}</span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-300 max-w-md">
                        <pre className="bg-slate-950/60 p-2 rounded-lg text-slate-300 font-mono text-[11px] overflow-x-auto max-h-24 whitespace-pre-wrap border border-slate-800/80">
                          {typeof parsedDetails === 'object' ? JSON.stringify(parsedDetails, null, 2) : String(parsedDetails)}
                        </pre>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-400 font-mono">
                        <div className="flex items-center gap-1.5" title={log.user_agent || ''}>
                          <Globe className="w-3.5 h-3.5 text-slate-500" />
                          <span>{log.ip_address || 'Internal'}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
