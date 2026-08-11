'use client';

import React, { useState } from 'react';
import {
  MapPin,
  Truck,
  Clock,
  ExternalLink,
  RefreshCw,
  Package,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';

export type TrackingScan = {
  activity?: string;
  location?: string;
  time?: string;
  at?: string;
  status?: string;
  remarks?: string;
};

function formatScanTime(raw: string | undefined): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
  return String(raw);
}

function formatRelativeUpdated(raw: string | undefined): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return formatScanTime(raw);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  return formatScanTime(raw);
}

function normalizeScans(scans: TrackingScan[] | undefined): Array<{
  activity: string;
  location: string;
  timeLabel: string;
  timeRaw: string;
}> {
  if (!Array.isArray(scans) || scans.length === 0) return [];
  return scans.map((s) => ({
    activity: String(s.activity || s.status || s.remarks || 'Update').trim() || 'Update',
    location: String(s.location || '').trim(),
    timeLabel: formatScanTime(s.time || s.at),
    timeRaw: String(s.time || s.at || ''),
  }));
}

type Props = {
  orderId: string;
  status?: string;
  cancelled?: boolean;
  awb?: string | null;
  trackingUrl?: string | null;
  courierName?: string;
  destinationCity?: string;
  destinationPincode?: string;
  scans?: TrackingScan[];
  liveSynced?: boolean;
  /** Shop estimate only — never claim official ST ETA */
  estimatedArrival?: string;
  estimatedArrivalHint?: string | null;
  lastUpdatedAt?: string | null;
  onRefresh?: () => void;
  refreshing?: boolean;
};

/**
 * Customer shipment card powered by ST Courier scans.
 * Never invents hubs, GPS, or fake AWBs.
 */
export function ShipmentTrackingCard({
  orderId,
  status,
  cancelled,
  awb,
  trackingUrl,
  courierName = 'ST Courier Express',
  destinationCity,
  destinationPincode,
  scans,
  liveSynced,
  estimatedArrival,
  estimatedArrivalHint,
  lastUpdatedAt,
  onRefresh,
  refreshing,
}: Props) {
  const [copied, setCopied] = useState(false);
  const list = normalizeScans(scans);
  const latest = list[0];
  const hasAwb = Boolean(
    awb &&
      String(awb).trim() &&
      !String(awb).startsWith('SHP-') &&
      (String(awb).startsWith('STC') || String(awb).length >= 8)
  );
  const awbText = hasAwb ? String(awb).trim() : '';
  const stUrl =
    trackingUrl ||
    (hasAwb ? `https://stcourier.com/track/shipment?docket=${encodeURIComponent(awbText)}` : null);
  const delivered = String(status || '').toLowerCase().includes('deliver');
  const statusLabel = delivered
    ? 'Delivered'
    : String(status || '').toLowerCase().includes('out for delivery')
      ? 'Out for Delivery'
      : String(status || '').toLowerCase().includes('transit')
        ? 'In Transit'
        : String(status || '').toLowerCase().includes('packed') ||
            String(status || '').toLowerCase().includes('handed')
          ? String(status)
          : hasAwb
            ? String(status || 'With ST Courier')
            : 'Confirmed';
  const dest =
    [destinationCity, destinationPincode].filter(Boolean).join(' — ') || 'Tamil Nadu';
  const updatedLabel = formatRelativeUpdated(lastUpdatedAt || latest?.timeRaw);

  const copyAwb = async () => {
    if (!awbText) return;
    try {
      await navigator.clipboard.writeText(awbText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (cancelled) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-1">
        <p className="font-heading font-black text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Shipment cancelled
        </p>
        <p className="text-xs text-red-700/90">
          Order #{orderId} will not move with ST Courier. No further hub updates.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-gradient-to-br from-[#001B3A] to-[#0044AA] text-white p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300">
              Current status
            </p>
            <h3 className="font-heading font-black text-lg sm:text-xl mt-0.5 leading-snug">
              {statusLabel}
            </h3>
            <p className="text-xs text-slate-200 mt-1 leading-relaxed flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
              <span>
                {delivered
                  ? 'Delivered to your address.'
                  : latest?.location
                    ? `Last known hub: ${latest.location}`
                    : hasAwb
                      ? 'Waiting for the next hub scan from ST Courier.'
                      : 'Being prepared at our shop — AWB not assigned yet.'}
                {!delivered && latest?.activity ? (
                  <span className="block text-slate-300 mt-0.5">{latest.activity}</span>
                ) : null}
              </span>
            </p>
            {updatedLabel && (
              <p className="text-[10px] text-slate-300 mt-2 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-300" />
                Last updated: {updatedLabel}
              </p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            {hasAwb && (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-white/10 text-slate-100 border border-white/20 px-2 py-1 rounded-full">
                {liveSynced ? 'Synced from ST' : 'ST Courier'}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-300" />
              {delivered ? 'Delivery' : 'Estimated delivery'}
            </p>
            <p className="text-sm font-extrabold text-white mt-0.5">
              {delivered
                ? 'Completed'
                : estimatedArrival || 'Usually 2–3 business days'}
            </p>
            {!delivered && (
              <p className="text-[10px] text-slate-300 mt-0.5 leading-snug">
                {estimatedArrivalHint ||
                  'Shop estimate for Tamil Nadu via ST Courier — not an official ST ETA. Exact timing follows hub scans.'}
              </p>
            )}
          </div>
          <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1">
              <MapPin className="w-3 h-3 text-amber-300" />
              Delivering to
            </p>
            <p className="text-sm font-extrabold text-white mt-0.5 truncate">{dest}</p>
            <p className="text-[10px] text-slate-300 mt-0.5 flex items-center gap-1">
              <Truck className="w-3 h-3" />
              {courierName}
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400 uppercase">Your AWB / docket number</p>
              {hasAwb ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="font-mono font-black text-base sm:text-lg text-[#001B3A] tracking-wide break-all">
                    {awbText}
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyAwb()}
                    className="shrink-0 inline-flex items-center gap-1 px-2.5 py-2 rounded-lg border border-slate-200 bg-white text-[10px] font-bold text-slate-600 hover:border-amber-400 hover:text-[#001B3A] touch-manipulation min-h-11"
                    aria-label="Copy AWB number"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  Not assigned yet — packing in progress
                </p>
              )}
            </div>
          </div>

          {hasAwb && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {onRefresh && !delivered && (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={refreshing}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-[#001B3A] text-[11px] font-extrabold uppercase tracking-wide touch-manipulation min-h-11 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Track here (refresh)
                </button>
              )}
              {stUrl && (
                <a
                  href={stUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#001B3A] hover:bg-[#002B5B] text-white text-[11px] font-extrabold uppercase tracking-wide touch-manipulation min-h-11 ${
                    onRefresh && !delivered ? '' : 'sm:col-span-2'
                  }`}
                >
                  Track on ST Courier website
                  <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                </a>
              )}
            </div>
          )}
          {hasAwb && (
            <p className="text-[10px] text-slate-500 leading-relaxed">
              Use AWB <span className="font-mono font-bold text-slate-700">{awbText}</span> to track here.
              If status looks outdated or doesn&apos;t load on our site, open{' '}
              <span className="font-semibold text-slate-700">Track on ST Courier website</span> with the same AWB —
              that page is the official source.
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="font-heading font-black text-xs text-[#001B3A] uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-[#2874f0]" />
              Complete scan timeline
            </h4>
            <span className="text-[10px] font-semibold text-slate-400">
              {list.length > 0 ? `${list.length} update${list.length === 1 ? '' : 's'}` : 'No scans yet'}
            </span>
          </div>

          {!hasAwb ? (
            <div className="rounded-xl border border-[#2874f0]/20 bg-[#2874f0]/5 px-3.5 py-3 text-xs text-slate-700 leading-relaxed font-medium">
              Shipment tracking will appear once your order is handed to the courier.
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-3 text-xs text-slate-700 leading-relaxed font-medium">
              Shipment booked. Tracking updates will appear soon.
            </div>
          ) : (
            <ol className="relative space-y-0 border-l-2 border-slate-200 ml-2.5 pl-4">
              {list.map((scan, idx) => {
                const isLatest = idx === 0;
                return (
                  <li key={`${scan.timeLabel}-${idx}`} className="relative pb-4 last:pb-0">
                    <span
                      className={`absolute -left-[1.4rem] top-1 w-3 h-3 rounded-full ring-4 ring-white ${
                        isLatest ? 'bg-emerald-500' : 'bg-[#2874f0]'
                      }`}
                    />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <p className={`text-xs font-extrabold ${isLatest ? 'text-emerald-800' : 'text-slate-900'}`}>
                        {scan.location || scan.activity}
                      </p>
                      {scan.timeLabel && (
                        <time className="text-[10px] font-mono text-slate-400">{scan.timeLabel}</time>
                      )}
                    </div>
                    {scan.location && scan.activity && scan.location !== scan.activity && (
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{scan.activity}</p>
                    )}
                    {isLatest && (
                      <p className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-700">
                        <CheckCircle2 className="w-3 h-3" />
                        Latest update
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <p className="text-[10px] text-slate-400 text-center leading-relaxed pt-1 border-t border-slate-100">
          Shipment tracking powered by ST Courier. Hub times and locations come from their network — not live GPS.
          {hasAwb
            ? ' If tracking here isn\'t updating, use Track on ST Courier website with your AWB.'
            : ''}
        </p>
      </div>
    </div>
  );
}
