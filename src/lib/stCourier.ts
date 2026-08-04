import { getDbClient } from '@/lib/db';
import { broadcastOrderChange, notifyOrderChanged } from '@/app/api/orders/stream/route';

/** Official ST Courier docket formats */
export const VALID_DOCKET_PATTERN =
  /^(STC[0-9]{9}|STCOE[0-9]{7,10}|[A-Z]{2,3}[0-9]{8,12}|[0-9]{10,13})$/;

export type OrderStageLabel =
  | 'Order Placed'
  | 'Packed'
  | 'Handed to ST Courier'
  | 'In Transit'
  | 'Out for Delivery'
  | 'Delivered'
  | 'Delivery Attempted';

const STAGE_RANK: Record<string, number> = {
  'Order Placed': 0,
  Packed: 1,
  'Handed to ST Courier': 2,
  'In Transit': 3,
  'Out for Delivery': 4,
  Delivered: 5,
  'Delivery Attempted': 4,
};

const STAGE_TO_WHATSAPP_KEY: Record<string, string> = {
  'Handed to ST Courier': 'HANDED_TO_ST_COURIER',
  'In Transit': 'IN_TRANSIT',
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  'Delivery Attempted': 'FAILED_DELIVERY',
};

export function cleanDocket(docket: string): string {
  return (docket || '').trim().toUpperCase().replace(/\s+/g, '');
}

export function isOfficialAwb(awb: string | null | undefined): boolean {
  if (!awb) return false;
  const a = cleanDocket(awb);
  if (!a || a.startsWith('SHP-')) return false;
  return VALID_DOCKET_PATTERN.test(a) || (!a.startsWith('SHP-') && a.length >= 8);
}

/** Map ST Courier / ERP raw status text → our customer-facing status */
export function mapCourierStatusToOrderStatus(raw: string): OrderStageLabel {
  const s = (raw || '').toLowerCase();

  if (!s) return 'Handed to ST Courier';
  if (s.includes('deliver') && (s.includes('fail') || s.includes('undeliver') || s.includes('attempt'))) {
    return 'Delivery Attempted';
  }
  if (s.includes('delivered') || s.includes('rto delivered') || s === 'dlv' || s.includes('consignee')) {
    return 'Delivered';
  }
  if (
    s.includes('out for delivery') ||
    s.includes('out-for-delivery') ||
    s.includes('ofd') ||
    s.includes('out for del') ||
    s.includes('with delivery') ||
    s.includes('delivery boy') ||
    s.includes('out_for_delivery')
  ) {
    return 'Out for Delivery';
  }
  if (
    s.includes('in transit') ||
    s.includes('transit') ||
    s.includes('dispatched') ||
    s.includes('departed') ||
    s.includes('arrived') ||
    s.includes('hub') ||
    s.includes('connected') ||
    s.includes('manifest') ||
    s.includes('bagged') ||
    s.includes('received at')
  ) {
    return 'In Transit';
  }
  if (
    s.includes('booked') ||
    s.includes('picked') ||
    s.includes('pickup') ||
    s.includes('handed') ||
    s.includes('shipment created') ||
    s.includes('manifest generated')
  ) {
    return 'Handed to ST Courier';
  }

  return 'In Transit';
}

function extractEvents(erpData: any): Array<{ time: string; activity: string; location: string }> {
  const raw =
    erpData?.data?.trackingHistory ||
    erpData?.data?.history ||
    erpData?.data?.events ||
    erpData?.trackingHistory ||
    erpData?.history ||
    erpData?.events ||
    erpData?.data?.scans ||
    [];

  if (!Array.isArray(raw)) return [];

  return raw.slice(0, 20).map((e: any) => ({
    time: String(e.time || e.date || e.datetime || e.scanDate || e.created_at || ''),
    activity: String(e.activity || e.status || e.remark || e.remarks || e.scan || e.description || 'Update'),
    location: String(e.location || e.hub || e.city || e.place || ''),
  }));
}

function extractRawStatus(erpData: any): string {
  const candidates = [
    erpData?.shipmentStatus,
    erpData?.data?.shipmentStatus,
    erpData?.data?.status,
    erpData?.data?.currentStatus,
    erpData?.data?.CurrentStatus,
    erpData?.status,
    erpData?.data?.lastStatus,
    erpData?.CurrentStatus,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.toLowerCase() !== 'success') return c;
  }
  const events = extractEvents(erpData);
  if (events.length > 0) return events[0].activity;
  return 'In Transit';
}

export type TrackResult =
  | {
      ok: true;
      docket: string;
      rawStatus: string;
      status: OrderStageLabel;
      events: Array<{ time: string; activity: string; location: string }>;
      trackingUrl: string;
      erpData?: any;
    }
  | { ok: false; docket: string; error: string; trackingUrl: string };

/** Live fetch from ST Courier ERP */
export async function fetchStCourierTrack(docketInput: string): Promise<TrackResult> {
  const docket = cleanDocket(docketInput);
  const trackingUrl = `https://stcourier.com/track/shipment?docket=${encodeURIComponent(docket)}`;

  if (!VALID_DOCKET_PATTERN.test(docket)) {
    return {
      ok: false,
      docket,
      trackingUrl,
      error: `"${docket}" is not a valid ST Courier docket format. Examples: STC241568974, TN12345678`,
    };
  }

  const numericDocketOnly = docket.replace(/[^0-9]/g, '');

  try {
    const erpRes = await fetch(
      `https://erpstcourier.com/api/v1/shipment/track?awb=${encodeURIComponent(docket)}&docket=${encodeURIComponent(numericDocketOnly)}`,
      {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
          Referer: 'https://stcourier.com/',
        },
        cache: 'no-store',
      }
    );

    if (!erpRes.ok) {
      return {
        ok: false,
        docket,
        trackingUrl,
        error: `ST Courier live system: docket '${docket}' not found / not booked yet.`,
      };
    }

    const erpData = await erpRes.json();
    const looksValid =
      erpData &&
      (erpData.status === 'success' ||
        erpData.data ||
        erpData.shipmentStatus ||
        erpData.CurrentStatus ||
        erpData.trackingHistory);

    if (!looksValid) {
      return {
        ok: false,
        docket,
        trackingUrl,
        error: `ST Courier live system: docket '${docket}' not found / not booked yet.`,
      };
    }

    const rawStatus = extractRawStatus(erpData);
    const status = mapCourierStatusToOrderStatus(rawStatus);
    const events = extractEvents(erpData);

    return { ok: true, docket, rawStatus, status, events, trackingUrl, erpData };
  } catch (e: any) {
    return {
      ok: false,
      docket,
      trackingUrl,
      error: e.message || 'Could not reach ST Courier network',
    };
  }
}

function shouldAdvance(current: string, next: OrderStageLabel): boolean {
  const curRank = STAGE_RANK[current] ?? -1;
  const nextRank = STAGE_RANK[next] ?? 0;
  if (current === 'Delivered') return false;
  return nextRank > curRank;
}

async function persistCourierEvents(
  client: any,
  orderId: string,
  docket: string,
  events: Array<{ time: string; activity: string; location: string }>
) {
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS courier_tracking (
        id VARCHAR(255) PRIMARY KEY,
        order_id VARCHAR(255),
        awb_number VARCHAR(255),
        docket_number VARCHAR(255),
        status VARCHAR(255),
        current_status VARCHAR(255),
        location VARCHAR(255),
        remarks TEXT,
        event_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    for (const col of [
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS awb_number VARCHAR(255)`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS status VARCHAR(255)`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS location VARCHAR(255)`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS remarks TEXT`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS event_time TIMESTAMP`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE courier_tracking ADD COLUMN IF NOT EXISTS docket_number VARCHAR(255)`,
    ]) {
      try {
        await client.query(col);
      } catch (_) {}
    }
    for (const ev of events.slice(0, 10)) {
      const id = `ct-${docket}-${Buffer.from(`${ev.time}|${ev.activity}`).toString('base64url').slice(0, 24)}`;
      await client.query(
        `INSERT INTO courier_tracking (id, order_id, awb_number, docket_number, status, location, remarks, event_time)
         VALUES ($1, $2, $3, $3, $4, $5, $6, NOW())
         ON CONFLICT (id) DO NOTHING`,
        [id, orderId, docket, ev.activity, ev.location || null, ev.time || null]
      );
    }
  } catch (_) {}
}

/**
 * Pull live ST Courier status for one AWB and auto-update order if status advanced.
 */
export async function syncOrderByAwb(docketInput: string): Promise<{
  verified: boolean;
  updated: boolean;
  status?: string;
  previousStatus?: string;
  orderId?: string;
  error?: string;
  trackingUrl?: string;
  events?: Array<{ time: string; activity: string; location: string }>;
}> {
  const tracked = await fetchStCourierTrack(docketInput);
  if (!tracked.ok) {
    return { verified: false, updated: false, error: tracked.error, trackingUrl: tracked.trackingUrl };
  }

  const client = await getDbClient();
  if (!client) {
    return { verified: true, updated: false, error: 'Database unavailable', trackingUrl: tracked.trackingUrl };
  }
  try {
    const orderRes = await client.query(
      `SELECT id, order_number, order_status, awb_number, shipping_address
       FROM orders
       WHERE UPPER(REPLACE(awb_number, ' ', '')) = $1
          OR id = $1 OR order_number = $1
       ORDER BY ordered_at DESC
       LIMIT 1`,
      [tracked.docket]
    );

    // Also match if admin just verified but AWB not saved yet — caller may pass order later
    if (orderRes.rows.length === 0) {
      return {
        verified: true,
        updated: false,
        status: tracked.status,
        trackingUrl: tracked.trackingUrl,
        events: tracked.events,
      };
    }

    const order = orderRes.rows[0];
    const previous = order.order_status || 'Order Placed';
    let updated = false;
    let nextStatus = previous;

    // Never revive or overwrite a cancelled / awaiting-confirmation order via courier sync
    if (String(previous).toLowerCase().includes('cancel')) {
      return {
        verified: true,
        updated: false,
        status: previous,
        previousStatus: previous,
        orderId: order.order_number || order.id,
        trackingUrl: tracked.trackingUrl,
        events: tracked.events,
        error: 'Order is cancelled — status not updated.',
      };
    }
    if (String(previous).toLowerCase().includes('awaiting confirmation')) {
      return {
        verified: true,
        updated: false,
        status: previous,
        previousStatus: previous,
        orderId: order.order_number || order.id,
        trackingUrl: tracked.trackingUrl,
        events: tracked.events,
        error: 'Order not confirmed yet — status not updated.',
      };
    }

    await client.query(
      `UPDATE orders SET tracking_url = $1, courier_name = 'ST Courier Express', updated_at = NOW()
       WHERE id = $2`,
      [tracked.trackingUrl, order.id]
    );

    await persistCourierEvents(client, order.id, tracked.docket, tracked.events);

    if (shouldAdvance(previous, tracked.status)) {
      nextStatus = tracked.status;
      await client.query(`UPDATE orders SET order_status = $1, updated_at = NOW() WHERE id = $2`, [
        nextStatus,
        order.id,
      ]);

      try {
        await client.query(
          `INSERT INTO order_timeline (id, order_id, status, remarks)
           VALUES ($1, $2, $3, $4)`,
          [
            `tl-auto-${Date.now()}`,
            order.id,
            nextStatus,
            `Auto-synced from ST Courier: ${tracked.rawStatus}`,
          ]
        );
      } catch (_) {}

      updated = true;

      const event = {
        type: 'ORDER_UPDATED',
        orderId: order.order_number || order.id,
        status: nextStatus,
        awbNumber: tracked.docket,
        timestamp: Date.now(),
        source: 'st_courier_auto',
      };
      try {
        broadcastOrderChange(event);
        await notifyOrderChanged(event);
      } catch (_) {}
    }

    return {
      verified: true,
      updated,
      status: nextStatus,
      previousStatus: previous,
      orderId: order.order_number || order.id,
      trackingUrl: tracked.trackingUrl,
      events: tracked.events,
    };
  } finally {
    try {
      if (client) await client.end();
    } catch (_) {}
  }
}

/** Sync all open orders that have a real AWB */
export async function syncAllActiveAwbOrders(): Promise<{ checked: number; updated: number }> {
  const client = await getDbClient();
  let rows: any[] = [];
  try {
    if (!client) return { checked: 0, updated: 0 };
    const res = await client.query(
      `SELECT DISTINCT awb_number FROM orders
       WHERE awb_number IS NOT NULL
         AND awb_number NOT ILIKE 'SHP-%'
         AND COALESCE(order_status, '') NOT ILIKE '%delivered%'
         AND COALESCE(order_status, '') NOT ILIKE '%cancel%'
         AND COALESCE(order_status, '') NOT ILIKE '%awaiting confirmation%'
       LIMIT 40`
    );
    rows = res.rows;
  } finally {
    try {
      if (client) await client.end();
    } catch (_) {}
  }

  let updated = 0;
  for (const row of rows) {
    const result = await syncOrderByAwb(row.awb_number);
    if (result.updated) updated += 1;
    // small delay to avoid hammering ERP
    await new Promise((r) => setTimeout(r, 300));
  }
  return { checked: rows.length, updated };
}
