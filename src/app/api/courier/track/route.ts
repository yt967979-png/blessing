import { NextResponse } from 'next/server';
import {
  applyRateLimitAsync,
  clientIp,
  verifyAdminRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/serverSecurity';
import { cleanDocket, fetchStCourierTrack, syncOrderByAwb, VALID_DOCKET_PATTERN } from '@/lib/stCourier';

/**
 * GET /api/courier/track?docket=XXX
 * - Public (docket only): verify on ST Courier; may sync status onto matching order.
 * - Admin + orderId: assign AWB to order, then sync.
 */
export async function GET(request: Request) {
  const ip = clientIp(request);
  const { allowed } = await applyRateLimitAsync(`courier-${ip}`, 40, 60000);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many tracking checks. Please wait 1 minute.' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const docket = cleanDocket(searchParams.get('docket') || '');
  const orderId = searchParams.get('orderId') || '';

  if (!VALID_DOCKET_PATTERN.test(docket)) {
    return NextResponse.json(
      {
        isValid: false,
        verified: false,
        error: `"${docket}" does not match ST Courier docket format. Examples: STC241568974, TN12345678.`,
        docket,
      },
      { status: 400 }
    );
  }

  // AWB assign / order mutation — admin only
  if (orderId) {
    const admin = await verifyAdminRequest(request);
    if (!admin.isAdmin) {
      if (!admin.user) return unauthorizedResponse(admin.error || 'Unauthorized');
      return forbiddenResponse('Admin privilege required to assign AWB');
    }

    const { getDbClient, releaseDbClient } = await import('@/lib/db');
    const client = await getDbClient();
    try {
      if (client) {
        const ord = await client.query(
          `SELECT order_status FROM orders WHERE id = $1 OR order_number = $1 LIMIT 1`,
          [orderId]
        );
        if (ord.rows.length) {
          const { blocksShippingActions } = await import('@/lib/orderStatus');
          const st = ord.rows[0].order_status;
          if (blocksShippingActions(st)) {
            const awaiting = String(st || '').toLowerCase().includes('awaiting');
            return NextResponse.json(
              {
                isValid: false,
                verified: false,
                error: awaiting
                  ? 'Cannot assign AWB — order is not confirmed yet.'
                  : 'Cannot assign AWB — order is cancelled.',
                docket,
              },
              { status: 409 }
            );
          }
        }
        await client.query(
          `UPDATE orders
           SET awb_number = $1,
               tracking_url = $2,
               courier_name = 'ST Courier Express',
               updated_at = NOW()
           WHERE (id = $3 OR order_number = $3)
             AND COALESCE(order_status, '') NOT ILIKE '%cancel%'
             AND COALESCE(order_status, '') NOT ILIKE '%awaiting confirmation%'`,
          [docket, `https://stcourier.com/track/shipment?docket=${encodeURIComponent(docket)}`, orderId]
        );
      }
    } finally {
      releaseDbClient(client);
    }

    const synced = await syncOrderByAwb(docket);
    if (!synced.verified) {
      return NextResponse.json(
        {
          isValid: false,
          verified: false,
          error: synced.error || 'ST Courier docket not found / not booked yet.',
          docket,
          trackingUrl: synced.trackingUrl,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      isValid: true,
      verified: true,
      docket,
      courierName: 'ST Courier Express',
      status: synced.status,
      previousStatus: synced.previousStatus,
      updated: synced.updated,
      orderId: synced.orderId,
      events: synced.events || [],
      trackingUrl: synced.trackingUrl,
      autoSynced: synced.updated,
      timestamp: new Date().toISOString(),
    });
  }

  // Public / customer: verify + sync status if docket is on an order
  const live = await fetchStCourierTrack(docket);
  if (!live.ok) {
    const synced = await syncOrderByAwb(docket);
    if (synced.verified) {
      return NextResponse.json({
        success: true,
        isValid: true,
        verified: true,
        docket,
        courierName: 'ST Courier Express',
        status: synced.status,
        updated: synced.updated,
        orderId: synced.orderId,
        events: synced.events || [],
        trackingUrl: synced.trackingUrl,
        timestamp: new Date().toISOString(),
      });
    }
    return NextResponse.json(
      {
        isValid: false,
        verified: false,
        error: live.error || synced.error || 'ST Courier docket not found / not booked yet.',
        docket,
      },
      { status: 404 }
    );
  }

  const synced = await syncOrderByAwb(docket);
  return NextResponse.json({
    success: true,
    isValid: true,
    verified: true,
    docket,
    courierName: 'ST Courier Express',
    status: synced.status || live.status,
    updated: synced.updated,
    orderId: synced.orderId,
    events: synced.events || live.events || [],
    trackingUrl: synced.trackingUrl || live.trackingUrl,
    timestamp: new Date().toISOString(),
  });
}
