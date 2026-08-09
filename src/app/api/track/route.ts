import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { applyRateLimitAsync, clientIp, getAuthenticatedUser } from '@/lib/serverSecurity';
import { isOfficialAwb, syncOrderByAwb } from '@/lib/stCourier';
import { isOrderCancelled, isAwaitingConfirmation } from '@/lib/orderStatus';
import { getSTCourierDeliveryEstimate } from '@/lib/deliveryEstimator';

const CUSTOMER_STEPS = [
  { key: 'Confirmed', label: 'Confirmed', short: 'Confirmed' },
  { key: 'Packed', label: 'Packed', short: 'Packed' },
  { key: 'Handed to ST Courier', label: 'Shipped', short: 'Shipped' },
  { key: 'In Transit', label: 'In Transit', short: 'Transit' },
  { key: 'Out for Delivery', label: 'Out for Delivery', short: 'Out' },
  { key: 'Delivered', label: 'Delivered', short: 'Done' },
];

function normalizePhone(p: string): string {
  return String(p || '').replace(/\D/g, '');
}

function phonesMatch(input: string, stored: string): boolean {
  const a = normalizePhone(input);
  const b = normalizePhone(stored);
  if (!a || !b) return false;
  const a10 = a.length >= 10 ? a.slice(-10) : a;
  const b10 = b.length >= 10 ? b.slice(-10) : b;
  return a10.length === 10 && a10 === b10;
}

function stepIndex(status: string): number {
  const s = (status || '').toLowerCase();
  if (isOrderCancelled(s)) return -1;
  if (s.includes('delivered')) return 5;
  if (s.includes('out for delivery')) return 4;
  if (s.includes('in transit') || s.includes('shipped')) return 3;
  if (s.includes('handed to st courier')) return 2;
  if (s.includes('packed')) return 1;
  // Confirmed / Order Placed / Payment Confirmed / legacy awaiting → confirmed step
  return 0;
}

function maskPhone(phone: string): string {
  const d = normalizePhone(phone);
  if (d.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

function maskName(name: string): string {
  const n = (name || 'Customer').trim();
  if (n.length <= 2) return n[0] + '*';
  return n[0] + '*'.repeat(Math.min(n.length - 1, 6));
}

async function handleTrack(orderIdRaw: string, phoneRaw: string, request?: Request) {
  const orderId = String(orderIdRaw || '').trim().toUpperCase();
  const phone = String(phoneRaw || '').trim();
  const phoneDigits = normalizePhone(phone);

  if (!orderId || orderId.length < 4) {
    return NextResponse.json({ error: 'Enter a valid Order ID (e.g. BPG-1234).' }, { status: 400 });
  }

  const client = await getDbClient();
  if (!client) {
    return NextResponse.json(
      { error: 'Service temporarily busy. Please try again in a few seconds.' },
      { status: 503 }
    );
  }
  try {
    const res = await client.query(
      `SELECT o.id, o.order_number, o.order_status, o.awb_number, o.shipment_id, o.tracking_url,
              o.courier_name, o.total_amount, o.ordered_at, o.packed_at, o.shipped_at, o.delivered_at,
              o.shipping_address, o.payment_status, o.user_id, u.phone as user_phone,
              COALESCE(
                json_agg(
                  json_build_object(
                    'title', oi.book_title,
                    'qty', oi.quantity
                  )
                ) FILTER (WHERE oi.id IS NOT NULL), '[]'
              ) as items
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE UPPER(o.order_number) = $1 OR o.id = $1 OR UPPER(o.id) = $1 OR UPPER(COALESCE(o.awb_number, '')) = $1 OR UPPER(COALESCE(o.shipment_id, '')) = $1
       GROUP BY o.id, u.phone
       LIMIT 1`,
      [orderId]
    );

    const deny = () =>
      NextResponse.json(
        { error: 'Order not found. Check Order ID / AWB Number and the mobile number from checkout.' },
        { status: 404 }
      );

    if (res.rows.length === 0) {
      releaseDbClient(client);
      return deny();
    }

    const o = res.rows[0];
    let addr: any = {};
    try {
      addr = typeof o.shipping_address === 'string' ? JSON.parse(o.shipping_address) : o.shipping_address || {};
    } catch (_) {}

    // Check if session user matches
    let isAuthorized = false;
    if (request) {
      const session = await getAuthenticatedUser(request);
      if (session?.userId && String(session.userId) === String(o.user_id)) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized && (phoneDigits.length >= 10 || phoneDigits.length === 0)) {
      if (phoneDigits.length === 0 && isAuthorized) {
        // Authorized session
      } else if (
        phonesMatch(phone, addr.phone || '') ||
        phonesMatch(phone, addr.alternatePhone || addr.alternate_phone || '') ||
        phonesMatch(phone, o.user_phone || '')
      ) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      releaseDbClient(client);
      return deny();
    }

    // Timeline events
    let timeline: any[] = [];
    try {
      const tl = await client.query(
        `SELECT status, remarks, hub_city, awb_number, created_at
         FROM order_timeline WHERE order_id = $1 ORDER BY created_at ASC`,
        [o.id]
      );
      timeline = tl.rows.map((r: any) => ({
        label: r.status,
        remarks: r.remarks,
        hub: r.hub_city,
        at: r.created_at,
      }));
    } catch (_) {}

    // Courier scan history
    let scans: any[] = [];
    try {
      const ct = await client.query(
        `SELECT
           COALESCE(status, current_status) AS status,
           location,
           remarks,
           event_time,
           created_at
         FROM courier_tracking
         WHERE order_id = $1
            OR awb_number = $2
            OR docket_number = $2
         ORDER BY COALESCE(event_time, created_at, updated_at) DESC NULLS LAST
         LIMIT 15`,
        [o.id, o.awb_number || '']
      );
      scans = ct.rows.map((r: any) => ({
        activity: r.status || r.remarks || 'Update',
        location: r.location || '',
        time: r.event_time || r.created_at || '',
      }));
    } catch (_) {}

    releaseDbClient(client);

    const cancelled = isOrderCancelled(o.order_status);
    const awaiting = isAwaitingConfirmation(o.order_status);

    // Live refresh from ST Courier
    let live: any = null;
    if (!cancelled && !awaiting && isOfficialAwb(o.awb_number)) {
      try {
        live = await syncOrderByAwb(o.awb_number);
        if (live.updated && live.status) {
          o.order_status = live.status;
        }
        if (live.events?.length) {
          scans = live.events.map((e: any) => ({
            activity: e.activity || 'Update',
            location: e.location || '',
            time: e.time || '',
          }));
        }
      } catch (_) {}
    }

    const rawStatus = o.order_status || 'Confirmed';
    // Prepaid flow: legacy awaiting YES is treated as Confirmed for customer display
    const status = !cancelled && awaiting ? 'Confirmed' : rawStatus;
    const currentStep = stepIndex(status);
    const awb = isOfficialAwb(o.awb_number) ? o.awb_number : null;
    const trackingUrl =
      o.tracking_url ||
      (awb ? `https://stcourier.com/track/shipment?docket=${encodeURIComponent(awb)}` : null);

    const delivered = String(status).toLowerCase().includes('deliver');
    const eta = delivered
      ? 'Delivered'
      : getSTCourierDeliveryEstimate(addr.city || addr.state || 'Tamil Nadu').fullEstimateString;
    const lastScan = !cancelled && scans.length > 0 ? scans[0] : null;

    return NextResponse.json({
      success: true,
      order: {
        orderId: o.order_number || o.id,
        status,
        cancelled,
        awaitingConfirmation: false,
        currentStep,
        steps: CUSTOMER_STEPS.map((s, i) => ({
          ...s,
          done: cancelled ? false : i <= currentStep,
          active: cancelled ? false : i === currentStep,
        })),
        awb: cancelled ? null : awb,
        trackingNumber: cancelled ? null : awb,
        courierName: o.courier_name || 'ST Courier Express',
        trackingUrl: cancelled ? null : trackingUrl,
        paymentStatus: o.payment_status,
        placedAt: o.ordered_at,
        estimatedArrival: cancelled ? null : eta,
        lastLocation: lastScan?.location || null,
        lastActivity: lastScan?.activity || null,
        customer: {
          name: isAuthorized ? (addr.name || 'Customer') : maskName(addr.name || 'Customer'),
          phone: isAuthorized ? (addr.phone || '') : maskPhone(addr.phone || ''),
          city: addr.city || '',
          pincode: addr.pincode || '',
          state: addr.state || 'Tamil Nadu',
        },
        items: Array.isArray(o.items)
          ? o.items.map((it: any) => ({ title: it.title, qty: it.qty }))
          : [],
        timeline,
        scans: cancelled ? [] : scans,
        liveSynced: !cancelled && !!(live && live.verified),
        autoUpdated: !cancelled && !!(live && live.updated),
      },
    });
  } catch (err: any) {
    releaseDbClient(client);
    return NextResponse.json({ error: err.message || 'Tracking failed' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rl = await applyRateLimitAsync(`public-track:${clientIp(request)}`, 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many track attempts. Wait a minute.' }, { status: 429 });
  }
  const body = await request.json().catch(() => ({}));
  return handleTrack(body.orderId, body.phone, request);
}

export async function GET(request: Request) {
  const rl = await applyRateLimitAsync(`public-track:${clientIp(request)}`, 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many track attempts. Wait a minute.' }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  return handleTrack(searchParams.get('orderId') || '', searchParams.get('phone') || '', request);
}
