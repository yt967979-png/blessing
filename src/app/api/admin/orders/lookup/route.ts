import { NextResponse } from 'next/server';
import { queryDb } from '@/lib/db';
import { verifyAdminRequest, forbiddenResponse } from '@/lib/serverSecurity';

export const dynamic = 'force-dynamic';

function cleanOrderBarcode(raw: string): string {
  let s = String(raw || '').trim();
  // If a full tracking URL was scanned, extract orderId parameter
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
  // Strip leading hashtag if present
  s = s.replace(/^#+/, '').trim();
  return s;
}

export async function GET(request: Request) {
  const auth = await verifyAdminRequest(request);
  if (!auth.isAdmin) {
    return forbiddenResponse(auth.error || 'Admin privileges required');
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawCode = searchParams.get('code') || searchParams.get('orderId') || '';
    const cleanCode = cleanOrderBarcode(rawCode);

    if (!cleanCode) {
      return NextResponse.json({ error: 'Order barcode or code is required' }, { status: 400 });
    }

    // Query order row from orders table (items are stored in order_items table)
    const result = await queryDb(
      `SELECT id, order_number, user_id, total_amount, order_status, awb_number, 
              courier_name, shipping_address, shipped_at, ordered_at 
       FROM orders 
       WHERE order_number = $1 OR id = $1 OR LOWER(order_number) = LOWER($1)
       LIMIT 1`,
      [cleanCode]
    );

    if (!result.rows || result.rows.length === 0) {
      return NextResponse.json(
        { error: `No order found matching barcode: "${cleanCode}"` },
        { status: 404 }
      );
    }

    const o = result.rows[0];

    // Fetch ordered books from order_items table
    const itemsRes = await queryDb(
      `SELECT id, book_id, book_title as title, book_price as price, quantity as qty, subtotal, medium 
       FROM order_items 
       WHERE order_id = $1`,
      [o.id]
    );
    const items = itemsRes.rows || [];

    let addr: any = {};
    if (o.shipping_address) {
      if (typeof o.shipping_address === 'object') {
        addr = o.shipping_address;
      } else {
        try {
          addr = JSON.parse(o.shipping_address);
        } catch {
          addr = { address: o.shipping_address };
        }
      }
    }

    const itemsSummary = items
      .map((it: any) => `${it.title || 'Guide'} × ${it.qty || 1}`)
      .join(', ') || 'School Study Guides';

    const orderNumber = o.order_number || o.id;
    const isCancelled = String(o.order_status || '').toLowerCase().includes('cancel');
    const isDispatched = Boolean(o.awb_number) || String(o.order_status || '').toLowerCase().includes('dispatch');

    return NextResponse.json({
      success: true,
      order: {
        id: o.id,
        orderNumber,
        studentName: addr.name || addr.fullName || addr.studentName || 'Student',
        parentName: addr.parentName || addr.parent_name || '',
        phone: addr.phone || addr.mobile || '',
        altPhone: addr.alternatePhone || addr.alternate_phone || '',
        doorNo: addr.doorNo || addr.door_no || '',
        street: addr.address || addr.addressLine1 || '',
        city: addr.city || addr.town || '',
        district: addr.district || '',
        state: addr.state || 'Tamil Nadu',
        pincode: addr.pincode || '',
        landmark: addr.landmark || addr.nearLandmark || '',
        totalAmount: Number(o.total_amount || 0),
        status: o.order_status || 'Order Placed',
        awbNumber: o.awb_number || null,
        courierName: o.courier_name || 'ST Courier Express',
        isCancelled,
        isDispatched,
        itemsCount: items.reduce((sum: number, it: any) => sum + Number(it.qty || 1), 0),
        itemsSummary,
        items,
      },
    });
  } catch (error: any) {
    console.error('[admin/orders/lookup] error:', error);
    return NextResponse.json({ error: error.message || 'Lookup failed' }, { status: 500 });
  }
}
