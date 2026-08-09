'use client';

import React from 'react';
import {
  MapPin,
  Truck,
  Clock,
  ExternalLink,
  RefreshCw,
  Package,
  CheckCircle2,
  AlertCircle,
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

function normalizeScans(scans: TrackingScan[] | undefined): Array<{
  activity: string;
  location: string;
  timeLabel: string;
}> {
  if (!Array.isArray(scans) || scans.length === 0) return [];
  return scans.map((s) => ({
    activity: String(s.activity || s.status || s.remarks || 'Update').trim() || 'Update',
    location: String(s.location || '').trim(),
    timeLabel: formatScanTime(s.time || s.at),
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
  /** Honest ETA string from ST TN estimate — not GPS */
  estimatedArrival?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  compact?: boolean;
};

/**
 * Flipkart-style shipment card: where it is now, when it may arrive, ST scan log.
 * Only shows real scan data — never invents hubs or fake AWBs.
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
  onRefresh,
  refreshing,
  compact,
}: Props) {
  const list = normalizeScans(scans);
  const latest = list[0];
  const hasAwb = Boolean(awb && String(awb).trim());
  const stUrl =
    trackingUrl ||
    (hasAwb ? `https://stcourier.com/track/shipment?docket=${encodeURIComponent(String(awb))}` : null);
  const delivered = String(status || '').toLowerCase().includes('deliver');
  const dest =
    [destinationCity, destinationPincode].filter(Boolean).join(' — ') || 'Tamil Nadu';

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
    <div
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${
        compact ? '' : ''
      }`}
    >
      {/* Where is it now */}
      <div className="bg-gradient-to-br from-[#001B3A] to-[#0044AA] text-white p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300">
              Where is my order?
            </p>
            <h3 className="font-heading font-black text-lg sm:text-xl mt-0.5 leading-snug">
              {delivered
                ? 'Delivered'
                : latest?.location
                  ? latest.location
                  : hasAwb
                    ? 'With ST Courier'
                    : 'Being prepared'}
            </h3>
            <p className="text-xs text-slate-200 mt-1 leading-relaxed">
              {delivered
                ? 'Your guide books were delivered successfully.'
                : latest?.activity
                  ? latest.activity
                  : hasAwb
                    ? 'Waiting for the next hub scan from ST Courier.'
                    : 'Confirmed — we pack and hand over to ST Courier next.'}
            </p>
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            {liveSynced && hasAwb && (
              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                LIVE ST
              </span>
            )}
            {onRefresh && hasAwb && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-200 hover:text-white disabled:opacity-50 touch-manipulation"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="rounded-xl bg-white/10 border border-white/15 px-3 py-2.5">
            <p className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-300" />
              {delivered ? 'Delivered' : 'Expected arrival'}
            </p>
            <p className="text-sm font-extrabold text-white mt-0.5">
              {delivered
                ? 'Completed'
                : estimatedArrival || 'Usually 2–3 days in Tamil Nadu via ST Courier'}
            </p>
            {!delivered && (
              <p className="text-[10px] text-slate-300 mt-0.5">
                Estimate based on ST Courier TN routes — exact time follows hub scans
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
        {/* AWB row */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-slate-400 uppercase">ST Courier docket (AWB)</p>
            {hasAwb ? (
              <p className="font-mono font-black text-sm text-[#001B3A] truncate">{awb}</p>
            ) : (
              <p className="text-xs font-semibold text-slate-500">Not assigned yet — packing in progress</p>
            )}
          </div>
          {stUrl && (
            <a
              href={stUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#001B3A] text-white text-[11px] font-extrabold uppercase tracking-wide touch-manipulation min-h-10"
            >
              Open ST site
              <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
            </a>
          )}
        </div>

        {/* Scan timeline */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h4 className="font-heading font-black text-xs text-[#001B3A] uppercase tracking-wider flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-[#2874f0]" />
              Tracking updates
            </h4>
            <span className="text-[10px] font-semibold text-slate-400">
              {list.length > 0 ? `${list.length} scan${list.length === 1 ? '' : 's'}` : 'No scans yet'}
            </span>
          </div>

          {!hasAwb ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-3 text-xs text-slate-600 leading-relaxed">
              Payment confirmed. After we pack and book with ST Courier, hub scans (Chennai / transit / out for delivery)
              will appear here automatically.
            </div>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50/80 px-3 py-3 text-xs text-slate-600 leading-relaxed">
              Docket <span className="font-mono font-bold">{awb}</span> is booked. Waiting for the first hub scan from
              ST Courier — tap Refresh or check again in a few hours.
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
      </div>
    </div>
  );
}
