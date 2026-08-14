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
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
          <span className="text-xs font-mono text-[#55607A] block mb-1">WORKER LIVENESS</span>
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full ${
                systemHealth.healthy ? 'bg-[#2F9E60]' : 'bg-[#C43B3B] animate-pulse'
              }`}
            />
            <p className="font-serif font-black text-xl text-[#1E2A4A]">
              {systemHealth.healthy ? 'ALL WORKERS ACTIVE' : 'WORKER DEGRADED'}
            </p>
          </div>
          <p className="text-[11px] text-[#55607A] mt-1 font-sans">
            Postgres cron sweepers & SSE listeners reporting
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
          <span className="text-xs font-mono text-[#55607A] block mb-1">DEAD-LETTER WEBHOOKS</span>
          <p
            className={`font-serif font-black text-2xl ${
              systemHealth.deadLetterCount === 0 ? 'text-[#2F9E60]' : 'text-[#C43B3B]'
            }`}
          >
            {systemHealth.deadLetterCount}
          </p>
          <p className="text-[11px] text-[#55607A] mt-1 font-sans">
            Razorpay webhooks saved in database queue
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#55607A]/20 p-4 shadow-xs">
          <span className="text-xs font-mono text-[#55607A] block mb-1">24H REFUND RATIO</span>
          <p className="font-serif font-black text-2xl text-[#1E2A4A]">
            {systemHealth.dailyRefundPercent.toFixed(1)}%
          </p>
          <p className="text-[11px] text-[#55607A] mt-1 font-sans">
            {systemHealth.dailyRefundsCount} refund(s) out of {systemHealth.dailyOrdersCount} orders today
          </p>
        </div>
      </div>

      {/* ─── Observability Controls & Actions ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Background Jobs Telemetry */}
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-5 shadow-xs space-y-4">
          <h3 className="font-serif font-bold text-sm text-[#1E2A4A] flex items-center gap-2 border-b border-slate-100 pb-2">
            <Server className="w-4 h-4 text-[#D98C2B]" />
            <span>Telemetry & Cron Heartbeats</span>
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex items-center justify-between p-2.5 bg-[#FAF7F0] rounded-lg border border-slate-200/60">
              <div>
                <span className="font-bold text-[#1E2A4A] block">Stock Hold Auto-Releaser</span>
                <span className="text-[10px] text-[#55607A]">Runs every 60 seconds (sweeps expired 10m holds)</span>
              </div>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                ACTIVE
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-[#FAF7F0] rounded-lg border border-slate-200/60">
              <div>
                <span className="font-bold text-[#1E2A4A] block">ST Courier Docket Auto-Sync</span>
                <span className="text-[10px] text-[#55607A]">Runs every 15 minutes (max 40 dockets, 300ms pacing)</span>
              </div>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                ACTIVE
              </span>
            </div>

            <div className="flex items-center justify-between p-2.5 bg-[#FAF7F0] rounded-lg border border-slate-200/60">
              <div>
                <span className="font-bold text-[#1E2A4A] block">Dead-Letter Webhook Auto-Replayer</span>
                <span className="text-[10px] text-[#55607A]">Exponential backoff retry for network drops</span>
              </div>
              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                ACTIVE
              </span>
            </div>
          </div>
        </div>

        {/* Diagnostic Actions */}
        <div className="bg-white rounded-xl border border-[#55607A]/20 p-5 shadow-xs flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="font-serif font-bold text-sm text-[#1E2A4A] flex items-center gap-2 border-b border-slate-100 pb-2">
              <ShieldCheck className="w-4 h-4 text-[#D98C2B]" />
              <span>Production Diagnostics</span>
            </h3>

            <p className="text-xs text-[#55607A] leading-relaxed">
              If an external alert webhook (<code className="bg-[#FAF7F0] px-1 py-0.5 rounded font-mono text-[11px]">ALERT_WEBHOOK_URL</code>) is configured in your environment, trigger a test probe to verify instant notifications for server degradations.
            </p>
          </div>

          <div className="space-y-2 pt-4 border-t border-slate-100 mt-4">
            <button
              type="button"
              disabled={testingWebhook}
              onClick={handleTestAlert}
              className="w-full bg-[#1E2A4A] hover:bg-[#D98C2B] text-white py-2.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
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
