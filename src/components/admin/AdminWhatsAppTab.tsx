'use client';

import React, { FormEvent } from 'react';
import { MessageSquare, CheckCircle2 } from 'lucide-react';

type WaStatus = {
  status: string;
  connected?: boolean;
  qrImage?: string;
  pairingCode?: string;
  message?: string;
  linkedPhone?: string;
};

export default function AdminWhatsAppTab({
  waStatus,
  waPhoneInput,
  setWaPhoneInput,
  waPairingCode,
  onUnlink,
  onRequestPairing,
}: {
  waStatus: WaStatus;
  waPhoneInput: string;
  setWaPhoneInput: (v: string) => void;
  waPairingCode: string | null;
  onUnlink: () => void;
  onRequestPairing: (e: FormEvent) => void;
}) {
  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <div className="w-12 h-12 bg-[#25d366]/10 text-[#25d366] rounded-full flex items-center justify-center mx-auto mb-3">
          <MessageSquare className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-gray-900">Admin WhatsApp Number</h2>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
          Link <strong>your shop WhatsApp</strong> here. After linking, the panel sends from{' '}
          <strong>your number</strong> to each <strong>customer&apos;s number</strong>:
        </p>
        <ul className="text-left text-xs text-gray-600 mt-3 space-y-1.5 max-w-xs mx-auto">
          <li>• Order Placed → customer phone</li>
          <li>• Packed / Shipped / Delivered → customer phone</li>
          <li>• Coupon & offer broadcasts</li>
        </ul>
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
              ['Linked as', waStatus.pairingCode ? `+${waStatus.pairingCode}` : 'Admin device'],
              ['Sends to', 'Customer phone numbers'],
              ['Orders', 'Placed → Packed → Delivered'],
              ['Offers', 'Coupon broadcasts'],
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
              {waStatus.status === 'LOADING'
                ? 'Connecting...'
                : waStatus.status === 'INITIALIZING'
                  ? 'WhatsApp Engine Starting...'
                  : 'Link your WhatsApp number'}
            </p>
            <p className="text-xs text-gray-400">
              {waStatus.message || 'Use admin phone — scan QR or enter pairing code'}
            </p>
          </div>

          {waStatus.qrImage && (
            <div className="text-center">
              <img
                src={waStatus.qrImage}
                alt="WhatsApp QR"
                className="w-48 h-48 mx-auto rounded-xl border border-gray-200 shadow-sm"
              />
              <p className="text-xs text-gray-400 mt-2">
                Open WhatsApp on admin phone → Linked Devices → Scan QR
              </p>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-700 mb-3">Or link via Pairing Code (admin number)</p>
            <form onSubmit={onRequestPairing} className="flex gap-2">
              <input
                type="tel"
                placeholder="91XXXXXXXXXX (your admin WhatsApp)"
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
            {waPairingCode && (
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                <p className="text-xs text-amber-700 font-medium mb-1">
                  On admin phone: WhatsApp → Linked Devices → Link with phone number:
                </p>
                <p className="text-2xl font-black text-amber-800 tracking-[0.3em]">{waPairingCode}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
