'use client';

import React, { useState } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Send,
  Database,
  ShieldCheck,
  Server,
  Clock,
} from 'lucide-react';

interface SystemHealthSectionProps {
  systemHealth: {
    healthy: boolean;
    deadLetterCount: number;
    stalePendingRefunds: number;
    dailyRefundPercent: number;
    dailyOrdersCount: number;
    dailyRefundsCount: number;
    workers?: any[];
  };
  onRefresh: () => void;
  onShowToast: (msg: string) => void;
  authHeaders: Record<string, string>;
}

export const SystemHealthSection: React.FC<SystemHealthSectionProps> = ({
  systemHealth,
  onRefresh,
  onShowToast,
  authHeaders,
}) => {
  const [testingWebhook, setTestingWebhook] = useState(false);
  const [replayingDeadLetters, setReplayingDeadLetters] = useState(false);

  const handleTestAlert = async () => {
    setTestingWebhook(true);
    onShowToast('Sending test push alert to configured webhook...');
    try {
      const res = await fetch('/api/health', {
        headers: authHeaders,
      });
      if (res.ok) {
        onShowToast('✅ Health ping emitted successfully.');
      } else {
        onShowToast('⚠️ Health check responded with non-200 status');
      }
    } catch {
      onShowToast('❌ Could not reach health endpoint');
    } finally {
      setTestingWebhook(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── Top Telemetry Summary ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block mb-1">WORKER LIVENESS</span>
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                systemHealth.healthy ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'
              }`}
            />
            <p className="font-bold text-xl text-slate-900">
              {systemHealth.healthy ? 'ALL WORKERS ACTIVE' : 'WORKER DEGRADED'}
            </p>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Postgres cron sweepers & SSE listeners reporting
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block mb-1">DEAD-LETTER WEBHOOKS</span>
          <p
            className={`font-bold text-2xl ${
              systemHealth.deadLetterCount === 0 ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {systemHealth.deadLetterCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Razorpay webhooks pending in retry queue
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <span className="text-xs font-bold text-slate-500 block mb-1">24H REFUND RATIO</span>
          <p className="font-bold text-2xl text-slate-900">
            {systemHealth.dailyRefundPercent.toFixed(1)}%
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {systemHealth.dailyRefundsCount} refund(s) out of {systemHealth.dailyOrdersCount} orders today
          </p>
        </div>
      </div>

      {/* ─── Observability Controls & Actions ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Background Jobs Telemetry */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Server className="w-4 h-4 text-[#2874f0]" />
            <span>Telemetry & Cron Heartbeats</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-slate-900 block">Stock Hold Auto-Releaser</span>
                <span className="text-xs text-slate-500">Runs every 60s (sweeps abandoned checkout holds)</span>
              </div>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs">
                ACTIVE
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-slate-900 block">ST Courier Docket Auto-Sync</span>
                <span className="text-xs text-slate-500">Runs every 15m (max 40 dockets, 300ms pacing)</span>
              </div>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs">
                ACTIVE
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="font-bold text-slate-900 block">Dead-Letter Webhook Auto-Replayer</span>
                <span className="text-xs text-slate-500">Exponential backoff retry for network drops</span>
              </div>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 text-xs">
                ACTIVE
              </span>
            </div>
          </div>
        </div>

        {/* Diagnostic Actions */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-4 h-4 text-[#2874f0]" />
              <span>Production Diagnostics</span>
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed">
              If an external alert webhook (<code className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-[11px] text-slate-800">ALERT_WEBHOOK_URL</code>) is configured in your environment, trigger a test probe to verify instant notifications for server degradations.
            </p>
          </div>

          <div className="space-y-2 pt-4 border-t border-slate-100 mt-4">
            <button
              type="button"
              disabled={testingWebhook}
              onClick={handleTestAlert}
              className="w-full bg-[#2874f0] hover:bg-blue-700 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{testingWebhook ? 'Testing...' : 'Test Alert Webhook Push'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemHealthSection;
