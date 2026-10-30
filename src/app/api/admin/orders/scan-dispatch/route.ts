import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';
import { recordAdminAudit } from '@/lib/adminAudit';
import { buildWhatsAppAwbShareUrl } from '@/lib/whatsappTracking';
import { isOfficialAwb } from '@/lib/stCourier';
import { nanoid } from 'nanoid';

export const dynamic = 'force-dynamic';

function cleanAwbNumber(raw: string): string {
  let s = String(raw || '').trim();
  // If full ST Courier tracking URL was scanned, extract docket parameter
  if (s.includes('docket=')) {
    try {
      const u = new URL(s.startsWith('http') ? s : `https://${s}`);
      const param = u.searchParams.get('docket');
      if (param) s = param;
    } catch {
      const match = s.match(/docket=([^&]+)/);
      if (match) s = decodeURIComponent(match[1]);
    }
  }
  return s.trim().toUpperCase();
}

function cleanOrderCode(raw: string): string {
  let s = String(raw || '').trim();
  if (s.includes('orderId=')) {
    try {
      const u = new URL(s.startsWith('http') ? s : `https://${s}`);
      const param = u.searchParams.get('orderId');
      if (param) s = param;
    } catch {
      const match = s.match(/orderId=([^&]+)/);
      if (match) s = decodeURIComponent(match[1]);
    }
  }
  return s.replace(/^#+/, '').trim();
}

export async function POST(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    return forbiddenResponse(auth.error || 'Admin privileges required');
  }

  try {
    const body = await request.json();
    const rawOrderCode = body.orderId || body.orderCode || '';
    const rawAwb = body.awbNumber || body.awb || '';
    const courierName = String(body.courierName || 'ST Courier Express').trim();
    const forceOverwrite = Boolean(body.force);

    const orderCode = cleanOrderCode(rawOrderCode);
    const awb = cleanAwbNumber(rawAwb);

    if (!orderCode) {
      return NextResponse.json({ error: 'Order reference / barcode is required' }, { status: 400 });
    }
    if (!isOfficialAwb(awb)) {
      return NextResponse.json(
        {
          error: `"${awb}" is not a valid ST Courier docket format. Must be 10–13 digits (e.g. 63660535761) or start with STC.`,
        },
        { status: 400 }
      );
    }

    if (awb === orderCode.toUpperCase() || awb.startsWith('BPG') || awb.startsWith('ORD')) {
      return NextResponse.json(
        { error: `"${awb}" is an Order ID, not an ST Courier AWB docket.` },
        { status: 400 }
      );
    }

    // 1. Find the target order
    const orderRes = await queryDb(
      `SELECT id, order_number, user_id, total_amount, order_status, awb_number, 
              courier_name, shipping_address, shipped_at 
       FROM orders 
       WHERE order_number = $1 OR id = $1 OR LOWER(order_number) = LOWER($1)
       LIMIT 1`,
      [orderCode]
    );

    if (!orderRes.rows || orderRes.rows.length === 0) {
      return NextResponse.json(
        { error: `Order #${orderCode} not found in database.` },
        { status: 404 }
      );
    }

    const order = orderRes.rows[0];

    // Fetch order items from authoritative order_items table
    const itemsRes = await queryDb(
      `SELECT id, book_id, book_title as title, quantity as qty, book_price as price, medium 
       FROM order_items 
       WHERE order_id = $1`,
      [order.id]
    );
    const items = itemsRes.rows || [];

    // Check if cancelled
    if (String(order.order_status || '').toLowerCase().includes('cancel')) {
      return NextResponse.json(
        { error: `Cannot dispatch Order #${order.order_number}: this order was cancelled.` },
        { status: 400 }
      );
    }

    // Check if order already has an AWB and force was not specified
    if (order.awb_number && order.awb_number.toUpperCase() !== awb && !forceOverwrite) {
      return NextResponse.json(
        {
          error: `Order #${order.order_number} already has AWB "${order.awb_number}". To replace it, check "Overwrite existing AWB".`,
          existingAwb: order.awb_number,
          requiresForce: true,
        },
        { status: 409 }
      );
    }

    // 2. Duplicate AWB Guard: Ensure no OTHER active order is using this exact AWB
    const dupCheck = await queryDb(
      `SELECT id, order_number, order_status 
       FROM orders 
       WHERE UPPER(awb_number) = $1 AND id != $2 AND order_status NOT ILIKE '%cancel%'
       LIMIT 1`,
      [awb, order.id]
    );

    if (dupCheck.rows && dupCheck.rows.length > 0) {
      const dup = dupCheck.rows[0];
      return NextResponse.json(
        {
          error: `⚠️ Duplicate AWB! Docket "${awb}" is already allocated to Order #${dup.order_number} (${dup.order_status}). Please scan a fresh ST Courier barcode.`,
          duplicateOrderNumber: dup.order_number,
        },
        { status: 409 }
      );
    }

    // 3. Atomically update orders table
    const stCourierUrl = `https://stcourier.com/track/shipment?docket=${encodeURIComponent(awb)}`;
    await queryDb(
      `UPDATE orders 
       SET order_status = 'Dispatched', 
           awb_number = $1, 
           courier_name = $2, 
           tracking_url = $3,
           shipped_at = COALESCE(shipped_at, NOW()), 
           updated_at = NOW() 
       WHERE id = $4`,
      [awb, courierName, stCourierUrl, order.id]
    );

    // 4. Record timeline event
    const eventId = `ot_${nanoid(16)}`;
    await queryDb(
      `INSERT INTO order_timeline (id, order_id, status, remarks, hub_city, awb_number, created_at)
       VALUES ($1, $2, 'Dispatched', 'Dispatched via ST Courier (Scanned via Quick Dispatch Scanner)', 'Chennai Hub', $3, NOW())`,
      [eventId, order.id, awb]
    ).catch((err: any) => console.warn('[scan-dispatch] timeline insert notice:', err.message));

    // 5. Audit record
    await recordAdminAudit({
      actorId: auth.user?.userId || 'admin',
      actorEmail: 'admin@blessingpowerguide.in',
      action: 'ORDER_DISPATCH_SCANNED',
      targetType: 'order',
      targetId: order.id,
      details: {
        orderNumber: order.order_number,
        awbNumber: awb,
        courier: courierName,
        source: 'quick_dispatch_scanner',
      },
    }).catch(() => {});

    // 6. Broadcast SSE event to live dashboards
    try {
      const { broadcastOrderChange, notifyOrderChanged } = await import(
        '@/app/api/orders/stream/route'
      );
      const event = {
        type: 'ORDER_UPDATED',
        orderId: order.order_number || order.id,
        status: 'Dispatched',
        awbNumber: awb,
        userId: order.user_id ? String(order.user_id) : null,
        timestamp: Date.now(),
        source: 'quick_dispatch_scanner',
      };
      broadcastOrderChange(event);
      await notifyOrderChanged(event);
    } catch (e: any) {
      console.warn('[scan-dispatch] broadcast notice:', e?.message || e);
    }

    // Parse shipping address and items for response & WhatsApp URL
    let addr: any = {};
    if (order.shipping_address) {
      if (typeof order.shipping_address === 'object') {
        addr = order.shipping_address;
      } else {
        try {
          addr = JSON.parse(order.shipping_address);
        } catch {
          addr = { address: order.shipping_address };
        }
      }
    }


    const studentName = addr.name || addr.fullName || addr.studentName || 'Student';
    const studentPhone = addr.phone || addr.mobile || '';
    const destination = [addr.city || addr.town, addr.district, addr.pincode].filter(Boolean).join(', ');

    // Generate direct 1-click WhatsApp Share URL
    const whatsAppShareUrl = buildWhatsAppAwbShareUrl({
      orderNumber: order.order_number || order.id,
      customerName: studentName,
      customerPhone: studentPhone,
      trackingNumber: awb,
      items,
      address: [addr.doorNo || addr.door_no, addr.address || addr.addressLine1].filter(Boolean).join(', '),
      city: addr.city || addr.town || '',
      pincode: addr.pincode || '',
      state: addr.state || 'Tamil Nadu',
      totalAmount: Number(order.total_amount || 0),
    });

    const siteTrackingUrl = `https://blessingpowerguide.in/track?orderId=${encodeURIComponent(order.order_number || order.id)}&phone=${encodeURIComponent(studentPhone)}`;

    return NextResponse.json({
      success: true,
      message: `✓ Order #${order.order_number} successfully dispatched with ST Courier AWB "${awb}".`,
      order: {
        id: order.id,
        orderNumber: order.order_number || order.id,
        studentName,
        studentPhone,
        destination,
        awbNumber: awb,
        courierName,
        totalAmount: Number(order.total_amount || 0),
        status: 'Dispatched',
        stCourierUrl,
        siteTrackingUrl,
        whatsAppShareUrl,
        itemsCount: items.reduce((sum: number, it: any) => sum + (it.qty || it.quantity || 1), 0),
        itemsSummary: items.map((it: any) => `${it.title || it.name || 'Guide'} × ${it.qty || it.quantity || 1}`).join(', '),
      },
    });
  } catch (error: any) {
    console.error('[admin/orders/scan-dispatch] error:', error);
    return NextResponse.json({ error: error.message || 'Dispatch failed' }, { status: 500 });
  }
}
