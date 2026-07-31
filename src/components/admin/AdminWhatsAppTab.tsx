'use client';

import React, { FormEvent, useEffect, useState } from 'react';
import { MessageSquare, CheckCircle2, RefreshCw } from 'lucide-react';

type WaStatus = {
  status: string;
  connected?: boolean;
  qrImage?: string;
  pairingCode?: string;
  message?: string;
  linkedPhone?: string;
  leader?: boolean;
};

function isRealPairingCode(code: string | null | undefined): boolean {
  const c = String(code || '').replace(/\s/g, '');
  if (!c) return false;
  if (/^\d{10,15}$/.test(c.replace(/-/g, ''))) return false;
  return c.replace(/-/g, '').length >= 8;
}

export default function AdminWhatsAppTab({
  waStatus,
  waPhoneInput,
  setWaPhoneInput,
  waPairingCode,
  onUnlink,
  onRequestPairing,
  onRefreshQr,
  authHeaders,
}: {
  waStatus: WaStatus;
  waPhoneInput: string;
  setWaPhoneInput: (v: string) => void;
  waPairingCode: string | null;
  onUnlink: () => void;
  onRequestPairing: (e: FormEvent) => void;
  onRefreshQr?: () => void;
  authHeaders?: HeadersInit;
}) {
  const showCode = isRealPairingCode(waPairingCode);
  const [alertPhones, setAlertPhones] = useState('');
  const [alertSaving, setAlertSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authHeaders) return;
    void (async () => {
      try {
        const r = await fetch('/api/admin/alert-phones', { headers: authHeaders });
        const d = await r.json();
        if (r.ok) setAlertPhones(String(d.raw || d.phones?.join(', ') || ''));
      } catch {
        /* ignore */
      }
    })();
  }, [authHeaders]);

  const saveAlertPhones = async () => {
    if (!authHeaders) return;
    setAlertSaving(true);
    setAlertMsg(null);
    try {
      const r = await fetch('/api/admin/alert-phones', {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
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
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="w-12 h-12 bg-[#25d366]/10 text-[#25d366] rounded-full flex items-center justify-center mx-auto mb-3">
          <MessageSquare className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-gray-900">Admin WhatsApp Number</h2>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Link <strong>your shop WhatsApp</strong> here. Customers get a YES/NO confirm ask; after{' '}
          <strong>YES</strong> you get an &quot;order received&quot; alert on the phones below.
        </p>
        <ul className="text-left text-xs text-gray-600 mt-3 space-y-1.5 max-w-xs mx-auto">
          <li>• Order placed → customer: reply YES / NO</li>
          <li>• YES → customer confirm reply + admin alert</li>
          <li>• Then pack / add ST Courier AWB in Orders</li>
        </ul>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 text-left">
        <h3 className="text-sm font-bold text-gray-900">Alert phones (after customer YES)</h3>
        <p className="text-[11px] text-gray-500">
          Extra numbers that get &quot;Order received&quot; WhatsApp when a customer confirms. Comma-separated 10-digit mobiles.
        </p>
        <input
          type="text"
          value={alertPhones}
          onChange={(e) => setAlertPhones(e.target.value)}
          placeholder="9840418228, 98XXXXXXXX"
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0] font-mono"
        />
        <button
          type="button"
          disabled={alertSaving || !authHeaders}
          onClick={() => void saveAlertPhones()}
          className="px-3 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] disabled:opacity-50 rounded-lg cursor-pointer"
        >
          {alertSaving ? 'Saving…' : 'Save alert phones'}
        </button>
        {alertMsg && <p className="text-[11px] text-gray-600">{alertMsg}</p>}
      </div>

      {waStatus.status === 'CONNECTED' || waStatus.connected ? (
        <div className="bg-white rounded-xl border border-green-200 p-6 text-center space-y-4">
          <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-green-700">Admin WhatsApp Linked</h3>
            <p className="text-xs text-gray-500 mt-1">{waStatus.message || 'Ready to send order updates & offers.'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1.5">
            {[
              ['Linked as', waStatus.linkedPhone ? `+${waStatus.linkedPhone}` : 'Admin device'],
              ['Sends to', 'Customer phone numbers'],
              ['Orders', 'YES/NO confirm → pack → AWB'],
              ['Cost', 'Free (your WhatsApp)'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <span className="text-gray-500">{k}</span>
                <span className="font-semibold text-gray-700 text-right">{v}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onUnlink}
            className="text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Unlink Session
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div className="text-center space-y-1">
            <p className="text-sm font-bold text-gray-700">
              {waStatus.status === 'LOADING' || waStatus.status === 'INITIALIZING'
                ? 'Preparing QR…'
                : 'Connect WhatsApp'}
            </p>
            <p className="text-xs text-gray-400">
              {waStatus.message || 'Scan the QR with your shop WhatsApp phone'}
            </p>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <p className="text-xs font-bold text-gray-800 text-center">Step 1 — Scan QR (easiest)</p>
            {waStatus.qrImage ? (
              <div className="text-center">
                <img
                  src={waStatus.qrImage}
                  alt="WhatsApp QR"
                  className="w-52 h-52 mx-auto rounded-xl border border-gray-200 bg-white shadow-sm"
                />
                <ol className="text-left text-[11px] text-gray-600 mt-3 space-y-1 max-w-xs mx-auto list-decimal list-inside">
                  <li>Open <strong>WhatsApp</strong> on your phone</li>
                  <li>Tap <strong>⋮</strong> or <strong>Settings → Linked devices</strong></li>
                  <li>Tap <strong>Link a device</strong></li>
                  <li>Scan this QR code</li>
                </ol>
              </div>
            ) : (
              <div className="text-center space-y-2 py-4">
                <p className="text-xs text-gray-500">QR not ready yet — keep this tab open (refreshes every few seconds).</p>
                {onRefreshQr && (
                  <button
                    type="button"
                    onClick={onRefreshQr}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#25d366] hover:bg-[#1da851] rounded-lg cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Show new QR
                  </button>
                )}
              </div>
            )}
            {waStatus.qrImage && onRefreshQr && (
              <div className="text-center">
                <button
                  type="button"
                  onClick={onRefreshQr}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 hover:text-[#2874f0] cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  QR expired? Generate new one
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-700 mb-1">Step 2 — Or use pairing code (no camera)</p>
            <p className="text-[11px] text-gray-400 mb-3">
              Phone → Linked devices → Link with phone number → enter the <strong>8-digit code</strong> (not your phone number).
            </p>
            <form onSubmit={onRequestPairing} className="flex gap-2">
              <input
                type="tel"
                placeholder="91XXXXXXXXXX (your WhatsApp)"
                value={waPhoneInput}
                onChange={(e) => setWaPhoneInput(e.target.value)}
                required
                className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#2874f0] focus:ring-1 focus:ring-[#2874f0]/20"
              />
              <button
                type="submit"
                className="px-3 py-2 text-xs font-semibold text-white bg-[#2874f0] hover:bg-[#1a5dc8] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                Get Code
              </button>
            </form>
            {showCode && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                <p className="text-xs text-amber-700 font-medium mb-1">Enter this code in WhatsApp:</p>
                <p className="text-2xl font-black text-amber-800 tracking-[0.3em]">{waPairingCode}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
