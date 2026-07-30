import { NextResponse } from 'next/server';
import { getDbClient, releaseDbClient } from '@/lib/db';
import { applyRateLimitAsync, clientIp } from '@/lib/serverSecurity';
import { isOfficialAwb, syncOrderByAwb } from '@/lib/stCourier';

const CUSTOMER_STEPS = [
  { key: 'Order Placed', label: 'Order Placed', short: 'Placed' },
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
  if (a === b) return true;
  if (a.length >= 4 && b.endsWith(a.slice(-4))) return true;
  if (b.length >= 10 && a.length >= 10 && b.slice(-10) === a.slice(-10)) return true;
  return false;
}

function stepIndex(status: string): number {
  const s = (status || '').toLowerCase();
  if (s.includes('delivered')) return 5;
  if (s.includes('out for delivery')) return 4;
  if (s.includes('in transit') || s.includes('shipped')) return 3;
  if (s.includes('handed to st courier')) return 2;
  if (s.includes('packed')) return 1;
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

/**
 * Public Flipkart-style tracking.
 * POST/GET: orderId + phone (full or last 4 digits)
 */
async function handleTrack(orderIdRaw: string, phoneRaw: string) {
  const orderId = String(orderIdRaw || '').trim().toUpperCase();
  const phone = String(phoneRaw || '').trim();

  if (!orderId || orderId.length < 4) {
    return NextResponse.json({ error: 'Enter a valid Order ID (e.g. BPG-1234).' }, { status: 400 });
  }
  if (!phone || normalizePhone(phone).length < 4) {
    return NextResponse.json(
      { error: 'Enter the mobile number used at checkout (full number or last 4 digits).' },
      { status: 400 }
    );
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
              o.shipping_address, o.payment_status,
              COALESCE(
                json_agg(
                  json_build_object(
                    'title', oi.book_title,
                    'qty', oi.quantity
                  )
                ) FILTER (WHERE oi.id IS NOT NULL), '[]'
              ) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE UPPER(o.order_number) = $1 OR o.id = $1 OR UPPER(o.id) = $1
       GROUP BY o.id
       LIMIT 1`,
      [orderId]
    );

    if (res.rows.length === 0) {
      releaseDbClient(client);
      return NextResponse.json({ error: 'Order not found. Check the Order ID from WhatsApp / invoice.' }, { status: 404 });
    }

    const o = res.rows[0];
    let addr: any = {};
    try {
      addr = typeof o.shipping_address === 'string' ? JSON.parse(o.shipping_address) : o.shipping_address || {};
    } catch (_) {}

    if (
      !phonesMatch(phone, addr.phone || '') &&
      !phonesMatch(phone, addr.alternatePhone || addr.alternate_phone || '')
    ) {
      releaseDbClient(client);
      return NextResponse.json(
        { error: 'Phone number does not match this order. Use the mobile number from checkout.' },
        { status: 403 }
      );
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

    // Courier scan history if any
    let scans: any[] = [];
    try {
      const ct = await client.query(
        `SELECT status, location, remarks, event_time, created_at
         FROM courier_tracking WHERE order_id = $1 OR awb_number = $2
         ORDER BY COALESCE(event_time, created_at) DESC LIMIT 15`,
        [o.id, o.awb_number || '']
      );
      scans = ct.rows.map((r: any) => ({
        activity: r.status,
        location: r.location,
        time: r.remarks || r.event_time || r.created_at,
      }));
    } catch (_) {}

    releaseDbClient(client);

    // Live refresh from ST Courier when official AWB exists
    let live: any = null;
    if (isOfficialAwb(o.awb_number)) {
      try {
        live = await syncOrderByAwb(o.awb_number, { sendWhatsApp: false });
        if (live.updated && live.status) {
          o.order_status = live.status;
        }
        if (live.events?.length) {
          scans = live.events;
        }
      } catch (_) {}
    }

    const status = o.order_status || 'Order Placed';
    const currentStep = stepIndex(status);
    const awb = isOfficialAwb(o.awb_number) ? o.awb_number : null;
    const trackingUrl =
      o.tracking_url ||
      (awb ? `https://stcourier.com/track/shipment?docket=${encodeURIComponent(awb)}` : null);

    return NextResponse.json({
      success: true,
      order: {
        orderId: o.order_number || o.id,
        status,
        currentStep,
        steps: CUSTOMER_STEPS.map((s, i) => ({
          ...s,
          done: i <= currentStep,
          active: i === currentStep,
        })),
        awb,
        courierName: o.courier_name || 'ST Courier Express',
        trackingUrl,
        paymentStatus: o.payment_status,
        placedAt: o.ordered_at,
        customer: {
          name: maskName(addr.name || 'Customer'),
          phone: maskPhone(addr.phone || ''),
          city: addr.city || '',
          pincode: addr.pincode || '',
        },
        items: Array.isArray(o.items)
          ? o.items.map((it: any) => ({ title: it.title, qty: it.qty }))
          : [],
        timeline,
        scans,
        liveSynced: !!(live && live.verified),
        autoUpdated: !!(live && live.updated),
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
  return handleTrack(body.orderId, body.phone);
}

export async function GET(request: Request) {
  const rl = await applyRateLimitAsync(`public-track:${clientIp(request)}`, 20, 60000);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many track attempts. Wait a minute.' }, { status: 429 });
  }
  const { searchParams } = new URL(request.url);
  return handleTrack(searchParams.get('orderId') || '', searchParams.get('phone') || '');
}
