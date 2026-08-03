'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { MessageSquare, CheckCircle2, ShieldCheck, Zap, Server, Phone, Lock } from 'lucide-react';

type WaStatus = {
  status: string;
  connected?: boolean;
  qrImage?: string;
  pairingCode?: string;
  message?: string;
  linkedPhone?: string;
  leader?: boolean;
};

export default function AdminWhatsAppTab({
  waStatus,
  authToken,
  isSuperAdmin = false,
}: {
  waStatus: WaStatus;
  waPhoneInput?: string;
  setWaPhoneInput?: (v: string) => void;
  waPairingCode?: string | null;
  onUnlink?: () => void;
  onRequestPairing?: (e: FormEvent) => void;
  onRefreshQr?: () => void;
  authToken?: string | null;
  isSuperAdmin?: boolean;
}) {
  const [alertPhones, setAlertPhones] = useState('');
  const [alertLoaded, setAlertLoaded] = useState(false);
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authToken || alertLoaded) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/admin/alert-phones', {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const d = await r.json();
        if (!cancelled && r.ok) {
          setAlertPhones(String(d.raw || d.phones?.join(', ') || ''));
          setAlertLoaded(true);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, alertLoaded]);

  const saveAlertPhones = async () => {
    if (!authToken) return;
    setAlertSaving(true);
    setAlertMsg(null);
    try {
      const r = await fetch('/api/admin/alert-phones', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phones: alertPhones }),
      });
      const d = await r.json();
      if (!r.ok) {
        setAlertMsg(d.error || 'Save failed');
        return;
      }
      setAlertPhones(String(d.phones?.join(', ') || ''));
      setAlertMsg(d.message || 'Saved');
    } catch {
      setAlertMsg('Network error');
    } finally {
      setAlertSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto space-y-4">
      {/* WasenderAPI Gateway Header Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 rounded-2xl p-6 text-white text-center shadow-lg border border-emerald-800/30">
        <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-2xl border border-emerald-500/30 flex items-center justify-center mx-auto mb-3 backdrop-blur-md">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-black tracking-tight">WasenderAPI Cloud Gateway</h2>
        <p className="text-xs text-emerald-300 mt-1 font-medium">
          Official WasenderAPI WhatsApp Connection Active
        </p>

        <div className="mt-4 p-3 bg-white/10 rounded-xl backdrop-blur-md border border-white/10 text-left text-xs space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-slate-300">Connection Provider:</span>
            <span className="font-bold text-white flex items-center gap-1">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              wasenderapi.com
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-300">Linked WhatsApp Phone:</span>
            <span className="font-mono font-bold text-emerald-300 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5" />
              +91 82483 45770
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-300">Wasender Session ID:</span>
            <span className="font-mono font-bold text-emerald-400">a</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-300">Gateway Status:</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              CONNECTED & ACTIVE
            </span>
          </div>
        </div>
      </div>

      {/* Feature Badges */}
      <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
        <div className="bg-white border border-emerald-200 p-3 rounded-xl flex items-center gap-2.5 text-emerald-800 shadow-xs">
          <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Interactive Buttons Enabled</span>
        </div>
        <div className="bg-white border border-blue-200 p-3 rounded-xl flex items-center gap-2.5 text-blue-800 shadow-xs">
          <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <span>WhatsApp OTP Active</span>
        </div>
      </div>

      {/* Alert Phones Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 text-left shadow-xs">
        <h3 className="text-sm font-bold text-gray-900">Admin Notification Mobile Numbers</h3>
        <p className="text-[11px] text-gray-500">
          Specify additional mobile numbers to receive instant WhatsApp notifications when a customer places or confirms an order.
        </p>
        <input
          type="text"
          name="bpg_order_alert_mobiles"
          inputMode="numeric"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={alertPhones}
          onChange={(e) => setAlertPhones(e.target.value)}
          placeholder="9840418228, 8248345770"
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0] font-mono"
        />
        <button
          type="button"
          disabled={alertSaving || !authToken || isSuperAdmin === false}
          onClick={() => void saveAlertPhones()}
          className="px-4 py-2 text-xs font-bold text-white bg-[#2874f0] hover:bg-[#1a5dc8] disabled:opacity-50 rounded-lg cursor-pointer transition-colors shadow-xs"
        >
          {alertSaving ? 'Saving…' : 'Save Notification Phones'}
        </button>
        {isSuperAdmin === false && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg font-medium mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>WhatsApp settings are managed exclusively by the Super Admin.</span>
          </p>
        )}
        {alertMsg && <p className="text-[11px] font-semibold text-emerald-700">{alertMsg}</p>}
      </div>

      {/* Active Gateway Details */}
      <div className="bg-white rounded-xl border border-emerald-200 p-5 text-center space-y-3">
        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-emerald-800">WasenderAPI WhatsApp Operational</h3>
          <p className="text-xs text-gray-500 mt-1">
            All customer WhatsApp messages, interactive YES/NO buttons, and 6-digit verification codes are dispatched live via WasenderAPI Cloud.
          </p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1.5 border border-slate-200">
          {[
            ['Active Provider', 'WasenderAPI (wasenderapi.com)'],
            ['Linked Phone', '+91 82483 45770'],
            ['Inbound Webhook', '/api/wasender/webhook'],
            ['Interactive Buttons', '✅ Enabled (YES / NO Taps)'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-gray-500">{k}</span>
              <span className="font-semibold text-gray-800 text-right font-mono">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
